from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken


def _parse_cookies(scope):
    cookies = {}
    for name, value in scope.get("headers", []):
        if name == b"cookie":
            for part in value.decode().split(";"):
                if "=" in part:
                    k, v = part.strip().split("=", 1)
                    cookies[k] = v
    return cookies


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        params = dict(p.split("=", 1) for p in query_string.split("&") if "=" in p)
        token = params.get("token")

        if not token:
            cookies = _parse_cookies(scope)
            token = cookies.get("ghostcode_access")

        if token:
            try:
                access_token = AccessToken(token)
                user = await database_sync_to_async(get_user_model().objects.get)(id=access_token["user_id"])
                scope["user"] = user
            except (TokenError, Exception):
                scope["user"] = AnonymousUser()
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)
