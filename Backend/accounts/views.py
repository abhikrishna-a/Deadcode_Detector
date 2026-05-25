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

from .serializers import (
    CustomTokenObtainPairSerializer,
    CustomTokenRefreshSerializer,
    RegisterSerializer,
    UserSerializer
)

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


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Stage 1 Login Endpoint:
    Validates password. Yields a low-privileged token pair if MFA is required,
    or a full authorization pair if MFA is disabled.
    """
    serializer_class = CustomTokenObtainPairSerializer


class CustomTokenRefreshView(TokenRefreshView):
    """
    Hardened Token Refresh Endpoint:
    Utilizes CustomTokenRefreshSerializer to prevent unverified, low-privilege 
    pre-auth refresh tokens from minting high-privilege active sessions.
    """
    serializer_class = CustomTokenRefreshSerializer


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
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
            # Generate genuine, fully-privileged active session tokens
            refresh = RefreshToken.for_user(user)
            refresh["role"] = user.role
            refresh["mfa_verified_for_session"] = True

            return Response(
                {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_200_OK,
            )

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

            return Response(
                {
                    "message": "Multi-factor authentication successfully activated.",
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {"error": "Invalid verification code. Activation failed."},
            status=status.HTTP_400_BAD_REQUEST,
        )
