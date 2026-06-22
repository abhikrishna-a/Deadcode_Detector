import logging
import secrets
import threading

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
import base64
from io import BytesIO
import qrcode

from .models import UserSession
from .serializers import (
    CustomTokenObtainPairSerializer,
    CustomTokenRefreshSerializer,
    RegisterSerializer,
    UserSerializer,
    AdminUserSerializer,
    AdminUserRoleSerializer,
)
from .permissions import IsAdminWithVerifiedMFA

logger = logging.getLogger(__name__)

def _send_email_async(subject, message, recipient):
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
    except Exception as e:
        logger.error(f"Email to {recipient} failed: {e}")

User = get_user_model()

def has_verified_mfa_session(token_claims):
    """
    Validates if the present JWT claims represent an explicitly cleared 
    and fully authorized multi-factor authentication session.
    """
    return bool(token_claims and token_claims.get("mfa_verified_for_session") is True)


def build_qr_code_data_url(data):
    image = qrcode.make(data)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _set_refresh_cookie(response, session_key):
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=session_key,
        max_age=settings.REFRESH_TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        samesite='Lax',
        secure=not settings.DEBUG,
        path='/',
    )

def _set_access_cookie(response, access_token):
    response.set_cookie(
        key='ghostcode_access',
        value=access_token,
        max_age=settings.REFRESH_TOKEN_COOKIE_MAX_AGE,
        httponly=False,
        samesite='Lax',
        secure=not settings.DEBUG,
        path='/',
    )


def _create_session(user, refresh_token_str, request):
    session_key = secrets.token_urlsafe(32)
    expires_at = timezone.now() + timezone.timedelta(
        days=int(settings.REFRESH_TOKEN_COOKIE_MAX_AGE / 86400)
    )
    session = UserSession.objects.create(
        user=user,
        session_key=session_key,
        refresh_token=refresh_token_str,
        user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
        ip_address=request.META.get('REMOTE_ADDR'),
        expires_at=expires_at,
    )
    return session.session_key


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Stage 1 Login Endpoint:
    Validates password. Yields a low-privileged token pair if MFA is required,
    or a full authorization pair if MFA is disabled.
    """
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        resp = super().post(request, *args, **kwargs)
        if resp.status_code == 200:
            data = resp.data
            if not data.get('mfa_required') and 'access' in data:
                _set_access_cookie(resp, data['access'])
                _set_refresh_cookie(resp, data.get('refresh', ''))
        return resp


class CustomTokenRefreshView(TokenRefreshView):
    """
    Hardened Token Refresh Endpoint:
    Utilizes CustomTokenRefreshSerializer to prevent unverified, low-privilege 
    pre-auth refresh tokens from minting high-privilege active sessions.
    """
    serializer_class = CustomTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        resp = super().post(request, *args, **kwargs)
        if resp.status_code == 200 and 'access' in resp.data:
            _set_access_cookie(resp, resp.data['access'])
        return resp


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        threading.Thread(
            target=lambda: _send_email_async(
                subject="GhostCode — Welcome aboard",
                message=f"Hi {user.username},\n\nYour GhostCode account has been created successfully.\n\nYou can now log in and start scanning your code for dead code.\n\nHappy coding,\nThe GhostCode Team",
                recipient=user.email,
            ),
            daemon=True,
        ).start()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class MFALoginThrottle(SimpleRateThrottle):
    """
    Brute-force protection: Strict sliding window restriction limiting OTP
    verification attempts to 5 submissions per minute per user/IP.
    """
    scope = "mfa_login"
    rate = "5/min"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return f"throttle_mfa_{request.user.id}"
        return self.get_ident(request)


class CompleteMFALoginView(APIView):
    """
    Stage 2 Login Endpoint:
    Accepts the low-privilege pre-auth token alongside a 6-digit PIN.
    Issues production-grade fully privileged JWT session pairs upon validation.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [MFALoginThrottle]

    def post(self, request):
        user = request.user
        token_claims = request.auth  # Decoded token dictionary from SimpleJWT
        token = request.data.get("token")

        if not user.has_mfa_enabled:
            return Response(
                {"error": "MFA is not enabled for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce that the current session is strictly a low-privilege pre-auth ticket
        if token_claims.payload.get("mfa_verified_for_session") is not False:
            return Response(
                {"error": "A valid pre-auth token is required for MFA completion."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not token:
            return Response(
                {"error": "Verification code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify using the model method (incorporating the clock-drift window)
        if user.verify_mfa_token(token):
            refresh = RefreshToken.for_user(user)
            refresh["role"] = user.role
            refresh["mfa_verified_for_session"] = True

            session_key = _create_session(user, str(refresh), request)
            resp = Response(
                {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_200_OK,
            )
            _set_refresh_cookie(resp, session_key)
            _set_access_cookie(resp, str(refresh.access_token))
            return resp

        return Response(
            {"error": "Invalid verification code."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class MFASetupView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        token_claims = request.auth

        if user.is_mfa_enabled and has_verified_mfa_session(token_claims):
            return Response(
                {"error": "MFA must be verified before rotating the current authenticator."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user.mfa_secret:
            user.generate_mfa_secret()

        mfa_uri = user.get_mfa_uri()

        if not mfa_uri:
            return Response(
                {"error": "Failed to generate MFA provisioning configuration."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "qr_code_uri": mfa_uri,
                "qr_code_image": build_qr_code_data_url(mfa_uri),
            },
            status=status.HTTP_200_OK,
        )


class MFAInitialVerifyView(APIView):
    """
    MFA Activation Step:
    Confirms the user successfully linked their Authenticator application
    by checking their initial code submission. Activates the configuration flag.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [MFALoginThrottle]

    def post(self, request):
        user = request.user
        token_claims = request.auth
        token = request.data.get("token")

        if not user.mfa_secret:
            return Response(
                {"error": "MFA setup has not been initialized for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If MFA was fully operational before this rotation attempt, require 
        # that the user's active token claims maintain verified session authority.
        if user.is_mfa_enabled and has_verified_mfa_session(token_claims):
            return Response(
                {"error": "MFA must be verified before activating a replacement authenticator."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not token:
            return Response(
                {"error": "Verification code is required for activation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.verify_mfa_token(token):
            user.is_mfa_enabled = True
            user.save(update_fields=["is_mfa_enabled"])

            refresh = RefreshToken.for_user(user)
            refresh["role"] = user.role
            refresh["mfa_verified_for_session"] = True

            session_key = _create_session(user, str(refresh), request)
            resp = Response(
                {
                    "message": "Multi-factor authentication successfully activated.",
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_200_OK,
            )
            _set_refresh_cookie(resp, session_key)
            _set_access_cookie(resp, str(refresh.access_token))
            return resp

        return Response(
            {"error": "Invalid verification code. Activation failed."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class AdminUserListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdminWithVerifiedMFA]

    def get(self, request):
        users = User.objects.all().order_by("date_joined")
        serializer = AdminUserSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    """
    POST { "email": "user@example.com" }
    Always returns 200 to prevent user enumeration.
    Sends a reset link email if the account exists.
    """
    permission_classes = [AllowAny]
    throttle_scope = "password_reset"

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email__iexact=email)
            token = user.generate_password_reset_token()
            reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
            threading.Thread(
                target=lambda: _send_email_async(
                    subject="GhostCode — Reset your password",
                    message=f"Click the link below to reset your password (expires in 15 minutes):\n\n{reset_url}\n\nIf you did not request this, ignore this email.",
                    recipient=user.email,
                ),
                daemon=True,
            ).start()
        except User.DoesNotExist:
            pass  # Silent — don't reveal if email exists

        return Response(
            {"message": "If that email is registered, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    POST { "token": "...", "new_password": "..." }
    Validates the token and sets the new password.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token", "").strip()
        new_password = request.data.get("new_password", "")

        if not token or not new_password:
            return Response({"error": "Token and new password are required."}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({"error": "Password must be at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(password_reset_token=token)
        except User.DoesNotExist:
            return Response({"error": "Invalid or expired reset token."}, status=status.HTTP_400_BAD_REQUEST)

        if not user.is_password_reset_token_valid():
            user.clear_password_reset_token()
            return Response({"error": "Reset token has expired. Please request a new one."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.clear_password_reset_token()
        return Response({"message": "Password reset successfully. You can now log in."}, status=status.HTTP_200_OK)


class AdminUserRoleUpdateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdminWithVerifiedMFA]

    def patch(self, request, user_id):
        if request.user.id == user_id:
            return Response(
                {"error": "You cannot change your own role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = AdminUserRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user.role = serializer.validated_data["role"]
        target_user.save(update_fields=["role"])

        return Response(
            AdminUserSerializer(target_user).data,
            status=status.HTTP_200_OK,
        )


class SessionCheckView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        session_key = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if not session_key:
            return Response({"isAuthenticated": False})

        try:
            session = UserSession.objects.get(
                session_key=session_key, is_active=True
            )
        except UserSession.DoesNotExist:
            return Response({"isAuthenticated": False})

        if not session.is_valid():
            session.is_active = False
            session.save(update_fields=["is_active"])
            resp = Response({"isAuthenticated": False})
            resp.delete_cookie(settings.REFRESH_TOKEN_COOKIE_NAME, path='/')
            return resp

        user = session.user
        try:
            stored_refresh = RefreshToken(session.refresh_token)
            stored_refresh.check_exp()
        except Exception:
            session.is_active = False
            session.save(update_fields=["is_active"])
            resp = Response({"isAuthenticated": False})
            resp.delete_cookie(settings.REFRESH_TOKEN_COOKIE_NAME, path='/')
            return resp

        new_refresh = RefreshToken.for_user(user)
        new_refresh["role"] = user.role
        new_refresh["mfa_verified_for_session"] = True

        session.refresh_token = str(new_refresh)
        session.expires_at = timezone.now() + timezone.timedelta(
            days=int(settings.REFRESH_TOKEN_COOKIE_MAX_AGE / 86400)
        )
        session.save(update_fields=["refresh_token", "expires_at"])

        resp = Response({
            "isAuthenticated": True,
            "user": UserSerializer(user).data,
            "access": str(new_refresh.access_token),
        })
        _set_refresh_cookie(resp, session.session_key)
        _set_access_cookie(resp, str(new_refresh.access_token))
        return resp


class JuniorSubmissionUploadView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import JuniorSubmission
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        content = file.read().decode('utf-8', errors='replace')
        name = file.name
        lang = name.rsplit('.', 1)[-1] if '.' in name else ''
        submission = JuniorSubmission.objects.create(
            user=request.user,
            file_name=name,
            language=lang,
            content=content,
        )
        from .serializers import JuniorSubmissionSerializer
        return Response(JuniorSubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)


class JuniorSubmissionListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import JuniorSubmission
        from .serializers import JuniorSubmissionSerializer
        submissions = JuniorSubmission.objects.filter(user=request.user).order_by('-submitted_at')
        return Response(JuniorSubmissionSerializer(submissions, many=True).data)


class JuniorSubmissionDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, submission_id):
        from .models import JuniorSubmission
        from .serializers import JuniorSubmissionDetailSerializer
        try:
            submission = JuniorSubmission.objects.get(id=submission_id, user=request.user)
        except JuniorSubmission.DoesNotExist:
            return Response({'error': 'Submission not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(JuniorSubmissionDetailSerializer(submission).data)


class JuniorSubmissionAnalyzeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, submission_id):
        from .models import JuniorSubmission
        from .tasks import analyze_junior_submission
        try:
            submission = JuniorSubmission.objects.get(id=submission_id, user=request.user)
        except JuniorSubmission.DoesNotExist:
            return Response({'error': 'Submission not found.'}, status=status.HTTP_404_NOT_FOUND)
        if submission.status == 'processing':
            return Response({'error': 'Already processing.'}, status=status.HTTP_400_BAD_REQUEST)
        submission.status = 'processing'
        submission.save(update_fields=['status'])
        analyze_junior_submission.delay(submission.id)
        return Response({'message': 'Analysis started.'})


class JuniorGitImportView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import JuniorSubmission
        repo_url = request.data.get('repo_url', '').strip()
        branch = request.data.get('branch', 'main')
        paths = request.data.get('paths', [])
        if not repo_url or not paths:
            return Response({'error': 'repo_url and paths required'}, status=status.HTTP_400_BAD_REQUEST)
        import tempfile, os, subprocess
        temp_dir = tempfile.mkdtemp(prefix='junior_git_')
        try:
            subprocess.run(['git', 'clone', '--depth', '1', '-b', branch, repo_url, temp_dir],
                           capture_output=True, timeout=60, check=True)
            submissions = []
            for rel_path in paths:
                full_path = os.path.join(temp_dir, rel_path)
                if not os.path.isfile(full_path):
                    continue
                with open(full_path, 'r', encoding='utf-8', errors='replace') as fh:
                    content = fh.read()
                name = os.path.basename(rel_path)
                lang = name.rsplit('.', 1)[-1] if '.' in name else ''
                submission = JuniorSubmission.objects.create(
                    user=request.user,
                    file_name=name,
                    language=lang,
                    content=content,
                )
                submissions.append(submission.id)
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            from .serializers import JuniorSubmissionSerializer
            qs = JuniorSubmission.objects.filter(id__in=submissions)
            return Response(JuniorSubmissionSerializer(qs, many=True).data, status=status.HTTP_201_CREATED)
        except subprocess.TimeoutExpired:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            return Response({'error': 'Git clone timed out'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except subprocess.CalledProcessError as e:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            return Response({'error': f'Git clone failed: {e.stderr.decode()}'}, status=status.HTTP_400_BAD_REQUEST)


class JuniorClearView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        from .models import JuniorSubmission
        JuniorSubmission.objects.filter(user=request.user).delete()
        return Response({'message': 'All junior submissions cleared.'})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        session_key = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if session_key:
            UserSession.objects.filter(session_key=session_key).update(
                is_active=False
            )
        resp = Response({"message": "Logged out successfully."})
        resp.delete_cookie(settings.REFRESH_TOKEN_COOKIE_NAME, path='/')
        resp.delete_cookie('ghostcode_access', path='/')
        return resp
