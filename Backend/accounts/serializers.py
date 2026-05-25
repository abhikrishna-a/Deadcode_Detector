from django.contrib.auth import get_user_model
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
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES, required=False, default="viewer")

    class Meta:
        model = User
        fields = ["username", "email", "password", "role"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        
        refresh = self.get_token(self.user)
        refresh["mfa_verified_for_session"] = False

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
