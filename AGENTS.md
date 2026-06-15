# Service startup order (Windows)

All four services must be restarted after backend changes:

```powershell
# 1. Redis (if not running)
Get-Service Redis* | Start-Service

# 2. Django ASGI server (Daphne)
# Open shell 1
cd Backend
python manage.py runserver 0.0.0.0:8000

# 3. Celery worker — MUST use --pool=solo on Windows
# Open shell 2
cd Backend
celery -A core worker -l info --pool=solo

# 4. RAG FastAPI
# Open shell 3
cd services/rag
uvicorn app.main:app --port 8004 --reload

# 5. Vite frontend
# Open shell 4
cd Frontend
npm run dev
```

## Verification

- `http://localhost:5173` → login/signup works
- Scan Directory: select folder → batch progress via WebSocket appears
- Celery tasks visible in shell 2 logs
- Single file drop → RAG direct (port 8004)
- WebSocket auth: `?token=<JWT>` query param — no more 4001 close code
- JWT extracted from `Authorization` header, passed to Celery tasks for RAG auth

## Environment notes

- Python 3.14.0, Django 6.0.5, Channels 4.3.2, Celery 5.6.3, Redis 3.0.504
- FastAPI 0.136.3 on port 8004, PostgreSQL 16 on 5432
- React 19, Vite 8, Tailwind CSS v4, motion v12
- Django settings: `core/settings/dev.py` (default), override with `DJANGO_SETTINGS_MODULE=core.settings.prod` for prod
- Redis config in `.env` (not committed): `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- JWT via `ghostcode_access` cookie — RAG requires `mfa_verified_for_session: true` (included in Django login/signup tokens)
- Bugfix summary:
  - B1: missing `.apply_async()` on Celery chord → tasks now execute
  - B2: duplicate file names → `webkitRelativePath` used instead of base name
  - B3: WebSocket auth → `JWTAuthMiddleware` replaces `AuthMiddlewareStack`, reads `?token=` param
  - B4: tab unmount kills batch → `AnalyzerTab` always mounted, hidden via `display:none`
  - B5: WSGI instead of ASGI → `daphne` added as first `INSTALLED_APPS` entry so `runserver` handles WebSocket
  - B6: WebSocket bypasses Vite proxy → `WS_BASE` derived from `location.host` instead of hardcoded `localhost:8000`
  - B7: git import async path broken (expects `task_id`, gets `session_id`) → removed dead async wrapper, always calls `gitClone` directly
