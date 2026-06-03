from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    is_mfa_enabled = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "is_mfa_enabled"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def create(self, validated_data):
        validated_data["role"] = "viewer"
        return User.objects.create_user(**validated_data)

class AdminUserSerializer(serializers.ModelSerializer):
    is_mfa_enabled = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "is_mfa_enabled", "date_joined"]


class AdminUserRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES)

    def validate_role(self, value):
        return value


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # Allow login with email by finding username first
        login_field = attrs.get('username', '')
        if '@' in login_field:
            try:
                user_obj = User.objects.get(email__iexact=login_field)
                attrs['username'] = user_obj.username
            except User.DoesNotExist:
                pass  # Let super().validate() raise the auth error

        data = super().validate(attrs)

        refresh = self.get_token(self.user)
        refresh["mfa_verified_for_session"] = False

        try:
            send_mail(
                subject="GhostCode — New login detected",
                message=f"Hi {self.user.username},\n\nA new login was detected on your GhostCode account.\n\nIf this was you, you can ignore this email.\nIf this wasn't you, please change your password immediately.\n\nStay safe,\nThe GhostCode Team",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[self.user.email],
                fail_silently=False,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Login email failed for {self.user.email}: {e}")

        return {
            "mfa_required": True,
            "refresh": str(refresh),
            "pre_auth_token": str(refresh.access_token),
            "user": UserSerializer(self.user).data,
            "is_mfa_enabled": self.user.has_mfa_enabled,
        }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        return token

class CustomTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Hardens the refresh pipeline. Ensures unverified MFA sessions 
    cannot generate standard privileged access tokens.
    """
    def validate(self, attrs):
        data = super().validate(attrs)
        
        # Decode the refresh token payload to read custom claims
        refresh_token = RefreshToken(attrs['refresh'])
        mfa_verified = refresh_token.payload.get("mfa_verified_for_session", False)
        
        if not mfa_verified:
            raise InvalidToken("MFA verification incomplete. Cannot refresh session.")
            
        return data
