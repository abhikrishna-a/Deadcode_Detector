from .base import *  # noqa: F403
from .base import env

# Turn off debugging in production environments
DEBUG = False

# Strict host mapping dynamically pulled from .env
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost"])

# Explicitly limit CORS requests to your static React application
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])

# Secure Production Database Parsing
# Looks for DATABASE_URL in .env (e.g., postgres://user:password@host:port/dbname)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST", default="localhost"),
        "PORT": env("DB_PORT", default="5432"),
    }
}

# Standard production security headers
# SSL should be enabled once you have a real certificate (Cloudflare, Let's Encrypt, etc.)
# Until then, keep these False to avoid infinite redirect loops on HTTP
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=False)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=False)
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
