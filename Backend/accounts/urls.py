from django.urls import path
from .views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    RegisterView,
    CompleteMFALoginView,
    MFASetupView,
    MFAInitialVerifyView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    AdminUserListView,
    AdminUserRoleUpdateView,
    SessionCheckView,
    LogoutView,
    JuniorSubmissionUploadView,
    JuniorSubmissionListView,
    JuniorSubmissionDetailView,
    JuniorSubmissionAnalyzeView,
    JuniorClearView,
    JuniorGitImportView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),

    path('mfa/verify-login/', CompleteMFALoginView.as_view(), name='mfa_complete_login'),
    path('mfa/setup/', MFASetupView.as_view(), name='mfa_setup'),
    path('mfa/activate/', MFAInitialVerifyView.as_view(), name='mfa_initial_verify'),

    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),

    path('session/', SessionCheckView.as_view(), name='session_check'),
    path('logout/', LogoutView.as_view(), name='logout'),

    path('admin/users/', AdminUserListView.as_view(), name='admin_user_list'),
    path('admin/users/<int:user_id>/role/', AdminUserRoleUpdateView.as_view(), name='admin_user_role_update'),

    path('junior/upload/', JuniorSubmissionUploadView.as_view(), name='junior_upload'),
    path('junior/list/', JuniorSubmissionListView.as_view(), name='junior_list'),
    path('junior/detail/<int:submission_id>/', JuniorSubmissionDetailView.as_view(), name='junior_detail'),
    path('junior/analyze/<int:submission_id>/', JuniorSubmissionAnalyzeView.as_view(), name='junior_analyze'),
    path('junior/clear/', JuniorClearView.as_view(), name='junior_clear'),
    path('junior/git-import/', JuniorGitImportView.as_view(), name='junior_git_import'),
]
