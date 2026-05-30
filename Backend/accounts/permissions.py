from rest_framework.permissions import BasePermission


class IsMFAVerified(BasePermission):
    """
    Allows access only to users who have completed the Stage 2 MFA check.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.has_mfa_enabled:
            request.auth.payload.get("mfa_verified_for_session")

        return True


class IsAdminWithVerifiedMFA(BasePermission):
    """
    Returns True only if:
    1. request.user.is_authenticated
    2. request.user.role == 'admin'
    3. request.auth.payload.get("mfa_verified_for_session") is True
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role != 'admin':
            return False
        if not request.auth:
            return False
        return request.auth.payload.get("mfa_verified_for_session") is True
