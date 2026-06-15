
from django.contrib import admin
from django.urls import path, include
from accounts.git_views import BatchAnalysisView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/git/', include('accounts.git_urls')),
    path('api/analysis/batch/', BatchAnalysisView.as_view(), name='analysis-batch'),
]
