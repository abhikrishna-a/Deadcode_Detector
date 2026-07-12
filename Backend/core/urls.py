from django.contrib import admin
from django.urls import include, path

from accounts.git_views import BatchAnalysisView, BatchResultsView
from accounts.webhook_views import WebhookAnalyzeView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/chat/", include("accounts.chat_urls")),
    path("api/git/", include("accounts.git_urls")),
    path("api/rag/", include("accounts.rag_urls")),
    path("api/analyze/", WebhookAnalyzeView.as_view(), name="webhook-analyze"),
    path("api/analysis/batch/", BatchAnalysisView.as_view(), name="analysis-batch"),
    path("api/analysis/batch/<uuid:batch_id>/results/", BatchResultsView.as_view(), name="batch-results"),
]
