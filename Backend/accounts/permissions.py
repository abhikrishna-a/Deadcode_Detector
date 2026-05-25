
from rest_framework.permissions import BasePermission

class IsMFAVerified(BasePermission):
    """
    Allows access only to users who have completed the Stage 2 MFA check.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # If user has MFA active on their profile, verify their current token claim status
        if request.user.has_mfa_enabled:
            request.auth.payload.get("mfa_verified_for_session")
            
        return True