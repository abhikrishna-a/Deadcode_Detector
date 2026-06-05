from django.urls import path
from .git_views import GitCloneView, GitFileFetchView

urlpatterns = [
    path('clone/', GitCloneView.as_view(), name='git_clone'),
    path('files/', GitFileFetchView.as_view(), name='git_files'),
]
