import pyotp
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class AccountsAuthFlowTests(APITestCase):
    def setUp(self):
        self.password = "TestPass123!"
        self.user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password=self.password,
            role="admin",
        )

    def test_register_creates_user(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "bob",
                "email": "bob@example.com",
                "password": "StrongPass123!",
                "role": "viewer",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "bob")
        self.assertEqual(response.data["email"], "bob@example.com")
        self.assertFalse(response.data["is_mfa_enabled"])
        self.assertTrue(User.objects.filter(username="bob").exists())

    def test_register_does_not_allow_mfa_setup_before_first_login(self):
        register_response = self.client.post(
            "/api/auth/register/",
            {
                "username": "bob",
                "email": "bob@example.com",
                "password": "StrongPass123!",
                "role": "viewer",
            },
            format="json",
        )

        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)
        setup_response = self.client.post("/api/auth/mfa/setup/", {}, format="json")
        self.assertEqual(setup_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_without_enabled_mfa_returns_tokens(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertFalse(response.data["user"]["is_mfa_enabled"])

    def test_mfa_setup_does_not_return_raw_secret(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post("/api/auth/mfa/setup/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("qr_code_uri", response.data)
        self.assertIn("qr_code_image", response.data)
        self.assertNotIn("secret", response.data)
        self.assertTrue(response.data["qr_code_uri"].startswith("otpauth://"))
        self.assertTrue(response.data["qr_code_image"].startswith("data:image/png;base64,"))

    def test_mfa_enabled_user_gets_pre_auth_token_at_login(self):
        self.user.generate_mfa_secret()
        self.user.is_mfa_enabled = True
        self.user.save(update_fields=["is_mfa_enabled"])

        response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["mfa_required"])
        self.assertIn("pre_auth_token", response.data)
        self.assertNotIn("access", response.data)

    def test_verify_login_rejects_full_session_token(self):
        self.user.generate_mfa_secret()
        self.user.is_mfa_enabled = True
        self.user.save(update_fields=["is_mfa_enabled"])

        login_response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
            format="json",
        )
        pre_auth_token = login_response.data["pre_auth_token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {pre_auth_token}")
        otp = pyotp.TOTP(self.user.mfa_secret).now()

        first_response = self.client.post(
            "/api/auth/mfa/verify-login/",
            {"token": otp},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        full_access_token = first_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {full_access_token}")
        second_response = self.client.post(
            "/api/auth/mfa/verify-login/",
            {"token": otp},
            format="json",
        )

        self.assertEqual(second_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            second_response.data["error"],
            "A valid pre-auth token is required for MFA completion.",
        )

    def test_mfa_enabled_user_can_complete_login_with_valid_otp(self):
        self.user.generate_mfa_secret()
        self.user.is_mfa_enabled = True
        self.user.save(update_fields=["is_mfa_enabled"])

        login_response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
            format="json",
        )
        pre_auth_token = login_response.data["pre_auth_token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {pre_auth_token}")
        otp = pyotp.TOTP(self.user.mfa_secret).now()

        response = self.client.post(
            "/api/auth/mfa/verify-login/",
            {"token": otp},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertTrue(response.data["user"]["is_mfa_enabled"])

    def test_mfa_enabled_user_cannot_rotate_secret_with_pre_auth_token(self):
        self.user.generate_mfa_secret()
        original_secret = self.user.mfa_secret
        self.user.is_mfa_enabled = True
        self.user.save(update_fields=["is_mfa_enabled"])

        login_response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
            format="json",
        )

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['pre_auth_token']}"
        )
        response = self.client.post("/api/auth/mfa/setup/", {}, format="json")

        self.user.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.user.mfa_secret, original_secret)

    def test_mfa_enabled_user_can_rotate_secret_with_fully_verified_session(self):
        self.user.generate_mfa_secret()
        original_secret = self.user.mfa_secret
        self.user.is_mfa_enabled = True
        self.user.save(update_fields=["is_mfa_enabled"])

        login_response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
            format="json",
        )
        pre_auth_token = login_response.data["pre_auth_token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {pre_auth_token}")
        otp = pyotp.TOTP(self.user.mfa_secret).now()
        verify_response = self.client.post(
            "/api/auth/mfa/verify-login/",
            {"token": otp},
            format="json",
        )

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {verify_response.data['access']}"
        )
        response = self.client.post("/api/auth/mfa/setup/", {}, format="json")

        self.user.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(self.user.mfa_secret, original_secret)
