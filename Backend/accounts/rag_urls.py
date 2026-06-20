from django.urls import re_path
from .rag_proxy import RagProxyView

urlpatterns = [
    re_path(r'^(?P<proxy_path>.*)$', RagProxyView.as_view(), name='rag-proxy'),
]
