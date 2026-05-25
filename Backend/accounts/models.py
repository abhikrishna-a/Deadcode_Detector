from django.contrib.auth.models import AbstractUser
from django.db import models
import pyotp
from urllib.parse import quote


class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('viewer', 'Viewer'),
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

    def __str__(self):
        return f"{self.username} ({self.role})"
