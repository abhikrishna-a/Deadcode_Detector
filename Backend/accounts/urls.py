from django.urls import path
from .views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView, # Handled securely now
    RegisterView,
    CompleteMFALoginView,
    MFASetupView,
    MFAInitialVerifyView
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    
    path('mfa/verify-login/', CompleteMFALoginView.as_view(), name='mfa_complete_login'),
    path('mfa/setup/', MFASetupView.as_view(), name='mfa_setup'),
    path('mfa/activate/', MFAInitialVerifyView.as_view(), name='mfa_initial_verify'),
]
