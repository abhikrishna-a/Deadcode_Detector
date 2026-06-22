import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.conf import settings
import pyotp
from urllib.parse import quote


class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('senior', 'Senior')
        ('junior', 'Junior'),
    )

    role = models.CharField(
        max_length=10,
        choices=ROLE_CHOICES,
        default='viewer'
    )
    # Secret key used to generate OTP
    mfa_secret = models.CharField(
        max_length=32,
        blank=True,
        null=True
    )

    # Whether MFA setup is completed
    is_mfa_enabled = models.BooleanField(default=False)

    password_reset_token = models.CharField(max_length=64, blank=True, null=True)
    password_reset_token_created_at = models.DateTimeField(blank=True, null=True)

    @property
    def has_mfa_enabled(self):
        return bool(self.mfa_secret and self.is_mfa_enabled)

    def generate_mfa_secret(self):
        # Create random base32 secret
        self.mfa_secret = pyotp.random_base32()
        self.is_mfa_enabled = False
        self.save(update_fields=["mfa_secret", "is_mfa_enabled"])

        return self.mfa_secret

    def get_mfa_token(self):
        # If no secret exists
        if not self.mfa_secret:
            return None

        # Create TOTP object
        totp = pyotp.TOTP(self.mfa_secret)
        return totp.now()

    def verify_mfa_token(self, token):
        # If no secret exists
        if not self.mfa_secret:
            return False
        totp = pyotp.TOTP(self.mfa_secret)

        # Verify entered OTP
        return totp.verify(token, valid_window=1)

    def get_mfa_uri(self):
        if not self.mfa_secret:
            return None

        issuer = "GhostCode"
    
        totp = pyotp.TOTP(self.mfa_secret)
        return totp.provisioning_uri(
            name=self.email, 
            issuer_name=issuer
        )

    def generate_password_reset_token(self):
        self.password_reset_token = secrets.token_urlsafe(32)
        self.password_reset_token_created_at = timezone.now()
        self.save(update_fields=["password_reset_token", "password_reset_token_created_at"])
        return self.password_reset_token

    def is_password_reset_token_valid(self):
        if not self.password_reset_token or not self.password_reset_token_created_at:
            return False
        expiry = self.password_reset_token_created_at + timezone.timedelta(minutes=15)
        return timezone.now() < expiry

    def clear_password_reset_token(self):
        self.password_reset_token = None
        self.password_reset_token_created_at = None
        self.save(update_fields=["password_reset_token", "password_reset_token_created_at"])

    def __str__(self):
        return f"{self.username} ({self.role})"


class UserSession(models.Model):
    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name='sessions'
    )
    session_key = models.CharField(max_length=64, unique=True, db_index=True)
    refresh_token = models.TextField()
    user_agent = models.CharField(max_length=255, blank=True, default='')
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def is_valid(self):
        return self.is_active and timezone.now() < self.expires_at

    def __str__(self):
        return f"Session {self.session_key[:8]}... - {self.user.username}"


class JuniorSubmission(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    )
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='junior_submissions')
    file_name = models.CharField(max_length=512)
    language = models.CharField(max_length=50, blank=True, default='')
    content = models.TextField()
    submitted_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    result = models.JSONField(blank=True, null=True)
    analysis_id = models.CharField(max_length=64, blank=True, default='')
    scan_id = models.CharField(max_length=64, blank=True, default='')

    def __str__(self):
        return f"{self.file_name} ({self.user.username})"
