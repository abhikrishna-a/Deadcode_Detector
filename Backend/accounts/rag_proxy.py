import httpx
from django.conf import settings
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

RAG_BASE = settings.RAG_ANALYZE_URL.rsplit("/rag/", 1)[0]


class RagProxyView(APIView):
    permission_classes = [IsAuthenticated]

    def _forward_headers(self, request):
        headers = {}
        auth = request.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        elif request.auth:
            headers["Authorization"] = f"Bearer {request.auth}"
        ct = request.headers.get("Content-Type")
        if ct:
            headers["Content-Type"] = ct
        return headers

    def _proxy(self, request, method, proxy_path):
        target = f"{RAG_BASE}/rag/{proxy_path}"
        headers = self._forward_headers(request)
        params = request.GET.dict() or None
        with httpx.Client() as client:
            if method in ("GET", "DELETE"):
                resp = client.request(method, target, headers=headers, params=params)
            else:
                resp = client.request(method, target, headers=headers, content=request.body, params=params)
        return HttpResponse(
            resp.content,
            status=resp.status_code,
            content_type=resp.headers.get("content-type", "application/json"),
        )

    def get(self, request, proxy_path=""):
        return self._proxy(request, "GET", proxy_path)

    def post(self, request, proxy_path=""):
        if proxy_path == "chat":
            headers = self._forward_headers(request)
            target = f"{RAG_BASE}/rag/chat"

            def stream():
                with httpx.Client() as client:
                    with client.stream("POST", target, headers=headers, content=request.body) as resp:
                        yield from resp.iter_bytes()

            return StreamingHttpResponse(stream(), content_type="text/event-stream")
        return self._proxy(request, "POST", proxy_path)

    def delete(self, request, proxy_path=""):
        return self._proxy(request, "DELETE", proxy_path)
