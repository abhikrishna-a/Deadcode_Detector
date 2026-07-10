# GhostCode — Deployment Guide

This guide documents how to take GhostCode from a clean checkout to a running environment, for both local development and production, plus the checks to run before every deploy.

---

## 0. Pre-Deployment Checklist (read this first)

Before deploying, resolve these items:

1. **Rotate all default/example secrets.** `dev.py`/`docker-compose.dev.yml` ship a placeholder Postgres password (`1234`) and `services/rag/app/db.py` has a hardcoded fallback DSN with the same password — fine for local dev, **must** be overridden via env vars in any shared or production environment.
2. **Confirm `DJANGO_SECRET_KEY` is shared** between the Django backend and the RAG service — `services/rag/app/auth.py` verifies JWTs using this exact value, so a mismatch causes 401s on every RAG call.
3. **Confirm LLM keys are set** (`GROQ_API_KEYS` at minimum) — Phase 2 analysis and RAG chat silently fall back to Gemini or fail if neither is configured.
4. **Run CI locally** if possible: `ruff check Backend/ services/`, `ruff format --check Backend/ services/`, `python Backend/manage.py test`, `npm run lint` and `npm run build` in `Frontend/`.

---

## 1. Environments Overview

| Environment | Compose file | Frontend serving | Backend server | Debug |
|---|---|---|---|---|
| Development | `docker-compose.dev.yml` | Vite dev server (local, port 5173, hot reload) | `manage.py runserver` (Daphne-capable) | `DJANGO_DEBUG=True` |
| Production | `docker-compose.prod.yml` | Built static SPA served by Nginx (`Frontend/Dockerfile`) | `daphne -b 0.0.0.0 -p 8000` | `DJANGO_DEBUG=False`, `core.settings.prod` |

Both environments share the same Postgres (pgvector) + Redis backing services and the same FastAPI RAG service image.

---

## 2. Development Deployment

### 2.1 Prerequisites
- Docker Desktop running
- Node.js 22+
- No local Postgres/Redis bound to 5432/6379 (conflicts with the Docker containers)

### 2.2 Steps
```powershell
# 1. Start Postgres, Redis, Django, Celery worker/beat, RAG service
docker compose -f docker-compose.dev.yml up -d

# 2. Apply Django migrations
docker compose -f docker-compose.dev.yml exec backend python manage.py migrate

# 3. (Only after changing dependencies) rebuild images
docker compose -f docker-compose.dev.yml up -d --build

# 4. Run the frontend locally (not containerized in dev)
cd Frontend
npm install
npm run dev
```
The app is now reachable at `http://localhost:5173`. RAG runs on `8004`, Django on `8000`, Postgres on `5432`, Redis on `6379`.

### 2.3 Environment files needed
- Repo root `.env.docker` — shared secrets/config injected into every backend/RAG container (`env_file` in compose)
- Repo root `.env` (optional, git-ignored) — local overrides layered on top of `.env.docker`
- `Frontend/.env.development` or `Frontend/.env.example` copy — `VITE_API_URL`, `VITE_RAG_URL`, `VITE_RAG_API_URL`, `VITE_WS_URL`

### 2.4 Verifying a healthy dev deployment
- `http://localhost:5173` loads the landing page and registration/login works end to end (including MFA QR + TOTP)
- Directory scan produces WebSocket progress events (`docker compose logs -f backend` should show `WebSocket connected`)
- `docker compose -f docker-compose.dev.yml logs -f celery-worker` shows task pickup for batch analysis
- `curl http://localhost:8004/rag/health` and `curl http://localhost:8000/api/auth/session/` both respond

---

## 3. Production Deployment

### 3.1 Build & run
```bash
# From repo root
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```
`docker-compose.prod.yml` brings up: `redis`, `postgres` (pgvector image, healthchecked), `backend` (Daphne, runs `migrate` on container start), `celery-worker`, `celery-beat`, `rag`, `frontend` (Nginx serving the built SPA), and a top-level `nginx` reverse proxy bound to port 80.

### 3.2 Required environment variables (`.env.docker`)
| Variable | Notes |
|---|---|
| `SECRET_KEY` | Django secret key — also consumed by RAG as `DJANGO_SECRET_KEY` for JWT verification |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Postgres credentials — **do not** ship the dev default password |
| `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` | Point at the `redis` service |
| `RAG_DATABASE_URL` | Async Postgres DSN (`postgresql+asyncpg://...`) for the RAG service |
| `RAG_ANALYZE_URL` | Internal URL the Django backend/Celery uses to reach RAG, e.g. `http://rag:8004/rag/analyze` |
| `GROQ_API_KEYS`, `GEMINI_API_KEY`, `XAI_API_KEYS` | LLM provider credentials (comma-separate multiple Groq keys for rotation) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | SMTP for welcome/login/reset emails |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `ALLOWED_HOSTS` | Must match the public domain serving the SPA |
| `DJANGO_DEBUG` | Must be `False` in production |

### 3.3 Nginx routing (production)
`nginx/nginx.conf` maps:
- `/` → `frontend:80` (built SPA)
- `/api/analyzer/` → rewritten to `/analyzer/` on `rag:8004`
- `/api/` → `backend:8000`
- `/rag/` → `rag:8004`
- `/ws` → `backend:8000` with `Upgrade`/`Connection` headers for WebSocket passthrough, 24h read timeout

If you front this stack with an external load balancer/CDN, replicate these path rules and ensure WebSocket upgrade headers are preserved end to end.

### 3.4 Database migrations in production
The `backend` service command already runs `python manage.py migrate` on every container start (`docker-compose.prod.yml`). For zero-downtime rollouts, run migrations as a separate one-off step before rolling the new backend image:
```bash
docker compose -f docker-compose.prod.yml run --rm backend python manage.py migrate
```

### 3.5 Post-deploy smoke tests
1. `GET /api/auth/session/` → `{"isAuthenticated": false}` for an anonymous request (confirms Django is up)
2. `GET /rag/health` → `{"status": "ok", "service": "ghostcode-rag"}`
3. Register a user, complete MFA setup, run a single-file scan, confirm a WebSocket-delivered result
4. `docker compose -f docker-compose.prod.yml logs -f celery-beat` shows the three scheduled tasks firing on their intervals (60s / 3600s / 21600s)

---

## 4. CI/CD Pipeline

### 4.1 Continuous Integration (`.github/workflows/ci.yml`)

Runs on every push/PR to `main`:

| Job | What it does |
|---|---|
| `lint-backend` | `ruff check` + `ruff format --check` on `Backend/` and `services/` |
| `test-backend` | `python manage.py test` against a real Postgres 16 service container |
| `lint-frontend` | `eslint .` in `Frontend/` |
| `typecheck-frontend` | `vite build` (fails on TS errors) |
| `build-docker` | `docker compose -f docker-compose.prod.yml build` — validates every Dockerfile still builds |

Treat a green `build-docker` job as the CI gate — it exercises the exact images that will ship.

### 4.2 Continuous Deployment (`.github/workflows/cd.yml`)

Triggers automatically after CI passes on `main`. Pipeline steps:

| Step | Action |
|---|---|
| 1. Gate | Waits for CI workflow to complete successfully |
| 2. Build + tag | Rebuilds production images and tags them with `git SHA` and `latest` |
| 3. Push | Pushes images to GitHub Container Registry (`ghcr.io`) |
| 4. SSH deploy | Connects to production host via SSH key, pulls new images, restarts stack |
| 5. Smoke tests | Validates Django session endpoint and RAG health endpoint respond correctly |
| 6. Notify | Emits a warning annotation on failure with a link to this guide's rollback section |

### 4.3 Required secrets for CD

Set these in your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `DEPLOY_HOST` | Production server hostname or IP |
| `DEPLOY_USER` | SSH user on the production server |
| `DEPLOY_SSH_KEY` | Private SSH key (passwordless) for deploy access |
| `CI_EMAIL_HOST_USER` | Required by CI test job (see AGENTS.md) |
| `CI_EMAIL_HOST_PASSWORD` | Required by CI test job (see AGENTS.md) |

### 4.4 Production server setup (one-time)

On the deployment target server:

```bash
# 1. Install Docker & Docker Compose
apt install docker.io docker-compose-v2

# 2. Clone the repo
git clone https://github.com/<org>/<repo>.git /opt/ghostcode

# 3. Create .env.docker with production secrets
#    (See §3.2 for required variables)
cp /opt/ghostcode/.env.docker.example /opt/ghostcode/.env.docker
#    Edit .env.docker with real secrets

# 4. Bootstrap the stack
cd /opt/ghostcode
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 5. Verify coverage (Docker automatically runs migrate)
curl http://localhost:8000/api/auth/session/
curl http://localhost:8004/rag/health
```

### 4.5 Rollback a deployment

```bash
# On the production server:
cd /opt/ghostcode

# Roll back to a specific SHA
git checkout <previous-stable-sha>
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Or pull the previous image tag directly
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## 5. Rollback & Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend container exits immediately | Missing `SECRET_KEY` | `docker compose logs backend`, fix source, rebuild |
| RAG returns 401/403 on every request | `DJANGO_SECRET_KEY` mismatch between backend and RAG env | Ensure both containers load the same `SECRET_KEY` value from `.env.docker` |
| WebSocket closes immediately (code 4001) | JWT missing/expired in `?token=` query param | Re-login on frontend; confirm `ghostcode_access` cookie is present |
| Batch scan never completes | Celery worker not running or Redis unreachable | `docker compose ps`, check `celery-worker` logs, confirm `CELERY_BROKER_URL` |
| `ProgrammingError` on a `result`/new column | Local `manage.py runserver` process still running alongside Docker backend | Kill stray local Python processes; use Docker exclusively (see `AGENTS.md`) |
| Full reset needed | Corrupted local dev data | `docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d && docker compose -f docker-compose.dev.yml exec backend python manage.py migrate` |

For day-to-day Windows/Docker Desktop developer workflow details (log tailing, service ports, known local-dev bugfixes), see `AGENTS.md` in the repo root — this guide focuses on the deploy path itself. 
