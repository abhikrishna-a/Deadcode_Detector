#!/bin/bash
set -e

APP_DIR="/home/ec2-user/app"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="$APP_DIR/deploy.log"

exec > "$LOG_FILE" 2>&1
echo "===== CD Deploy: $(date) ====="

# Clone or pull
if [ ! -d "$APP_DIR/.git" ]; then
    echo "First deploy — cloning repo..."
    git clone https://github.com/abhikrishna-a/Deadcode_Detector.git "$APP_DIR"
fi

cd "$APP_DIR"

echo "Pulling latest code..."
git pull origin main

# Build images
echo "Building Docker images..."
docker compose -f "$COMPOSE_FILE" --env-file .env.docker build

# Restart services
echo "Restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file .env.docker up -d

# Run migrations
echo "Running database migrations..."
docker compose -f "$COMPOSE_FILE" --env-file .env.docker exec -T backend python manage.py migrate

# Verify
echo "Verifying deployment..."
sleep 3

if curl -sf http://localhost:8000/api/auth/session/ > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    exit 1
fi

if curl -sf http://localhost:8004/rag/health > /dev/null 2>&1; then
    echo "✅ RAG service is healthy"
else
    echo "❌ RAG health check failed"
    exit 1
fi

echo "===== Deploy complete: $(date) ====="
