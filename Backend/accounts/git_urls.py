from django.urls import path

from .git_views import GitCloneStatusView, GitCloneView, GitFileFetchView

urlpatterns = [
    path('clone/', GitCloneView.as_view(), name='git_clone'),
    path('clone/<str:task_id>/status/', GitCloneStatusView.as_view(), name='git_clone_status'),
    path('files/', GitFileFetchView.as_view(), name='git_files'),
]
