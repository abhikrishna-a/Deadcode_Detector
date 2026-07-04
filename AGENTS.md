# Docker development (Windows)

## Requirements

- Docker Desktop must be **running** before any Docker commands work
- Vite frontend runs **locally** (port 5173), everything else in Docker

## Startup

```powershell
# 1. Start all Docker services in background
docker compose -f docker-compose.dev.yml up -d

# 2. Apply migrations after backend changes
docker compose -f docker-compose.dev.yml exec backend python manage.py migrate
docker compose -f docker-compose.dev.yml restart backend

# 3. Rebuild images after dependency changes (new packages, etc.)
docker compose -f docker-compose.dev.yml up -d --build

# 4. Vite frontend (always local)
cd Frontend
npm run dev
```

## After pulling/rebasing

If database schema changed:
```powershell
docker compose -f docker-compose.dev.yml exec backend python manage.py migrate
docker compose -f docker-compose.dev.yml restart backend
```

For a full reset (fresh database):
```powershell
docker compose -f docker-compose.dev.yml down -v   # removes volumes
docker compose -f docker-compose.dev.yml up -d      # recreates fresh
docker compose -f docker-compose.dev.yml exec backend python manage.py migrate
```

## Viewing logs

```powershell
# All services
docker compose -f docker-compose.dev.yml logs -f

# Single service
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f celery-worker
docker compose -f docker-compose.dev.yml logs -f rag
```

## Stopping

```powershell
docker compose -f docker-compose.dev.yml down
```

To also remove database data (starts fresh next time):
```powershell
docker compose -f docker-compose.dev.yml down -v
```

## Email Service (Gmail SMTP)

The app sends emails for login notifications and welcome messages via Gmail SMTP.

### Local development

```powershell
# .env.docker already has these (use app password, not your real Gmail password)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-gmail@gmail.com
EMAIL_HOST_PASSWORD=your-16-char-app-password
DEFAULT_FROM_EMAIL=ghostcode@gmail.com
```

### GitHub Actions CI

Set these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `CI_EMAIL_HOST_USER` | Your test Gmail address |
| `CI_EMAIL_HOST_PASSWORD` | Gmail app password (16 chars) |

Secrets are referenced in `.github/workflows/ci.yml` as `${{ secrets.CI_EMAIL_HOST_USER }}`.

### Gmail App Password Setup

1. Enable [2-Step Verification](https://myaccount.google.com/security) on your Google Account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Select "Mail" and your device, generate the 16-character password

> ⚠️ Use a **dedicated test Gmail account** for CI — never reuse your production email credentials.

## Verification

- `http://localhost:5173` → login/signup works
- Scan Directory: select folder → batch progress via WebSocket appears
- Celery tasks visible in logs: `docker compose logs -f celery-worker`
- Single file drop → RAG direct (port 8004)
- WebSocket auth: `?token=<JWT>` query param — no more 4001 close code
- JWT extracted from `Authorization` header, passed to Celery tasks for RAG auth

## Services & ports

| Service | Port | How to access |
|---|---|---|
| Django backend | 8000 | `http://localhost:8000` |
| RAG FastAPI | 8004 | `http://localhost:8004` |
| PostgreSQL | 5432 | `localhost:5432` |
| Redis | 6379 | `localhost:6379` |
| Vite (local) | 5173 | `http://localhost:5173` |

## Common issues

- **Docker Desktop was restarted** → wait for it to fully start, then run `docker compose up -d` to restart services
- **Port conflict** → ensure no local PostgreSQL/Redis services are running (stop via `Services` panel)
- **DNS resolution fails inside containers** → Docker Desktop must be running for internal DNS to work
- **ProgrammingError on `result` column** → Docker backend was serving instead of local; ensure all local Python `manage.py` processes are killed and use Docker exclusively

## Environment notes

- Python 3.14.0, Django 6.0.5, Channels 4.3.2, Celery 5.6.3, Redis 3.0.504
- FastAPI 0.136.3 on port 8004, PostgreSQL 16 on 5432
- React 19, Vite 8, Tailwind CSS v4, motion v12
- Django settings: `.env.docker` at project root (referenced by Docker Compose as `env_file`), override locally with `core/settings/prod.py`
- JWT via `ghostcode_access` cookie — RAG requires `mfa_verified_for_session: true` (included in Django login/signup tokens)
- Bugfix summary:
  - B1: missing `.apply_async()` on Celery chord → tasks now execute
  - B2: duplicate file names → `webkitRelativePath` used instead of base name
  - B3: WebSocket auth → `JWTAuthMiddleware` replaces `AuthMiddlewareStack`, reads `?token=` param
  - B4: tab unmount kills batch → `AnalyzerTab` always mounted, hidden via `display:none`
  - B5: WSGI instead of ASGI → `daphne` added as first `INSTALLED_APPS` entry so `runserver` handles WebSocket
  - B6: WebSocket bypasses Vite proxy → `WS_BASE` derived from `location.host` instead of hardcoded `localhost:8000`
  - B7: git import async path broken (expects `task_id`, gets `session_id`) → removed dead async wrapper, always calls `gitClone` directly
  - B8: batch-analyze finds 0 issues — two-part fix: (a) removed `__db_history__` and `history_text` from token index (historical chunks pollute cross-ref, cause false negatives); (b) added two-phase analysis: Phase 1 = fast token cross-ref, Phase 2 = per-file LLM for files with 0 cross-ref hits, catching intra-file dead code the old single-file flow found.
