#!/bin/bash
set -ex

APP_DIR="/home/ec2-user/app"
COMPOSE_FILE="docker-compose.prod.yml"

echo "===== CD Deploy: $(date) ====="

# Clone or pull
if [ ! -d "$APP_DIR/.git" ]; then
    echo ">>> First deploy — cloning repo..."
    git clone https://github.com/abhikrishna-a/Deadcode_Detector.git "$APP_DIR"
fi

cd "$APP_DIR"

echo ">>> Pulling latest code..."
git pull origin main

# Build images
echo ">>> Building Docker images..."
docker compose -f "$COMPOSE_FILE" --env-file .env.docker build

# Restart services
echo ">>> Restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file .env.docker up -d

# Wait for services
echo ">>> Waiting for services to start..."
sleep 15

# Verify backend
echo ">>> Verifying backend..."
for i in 1 2 3; do
    if curl -sfL http://api-ghostcode.duckdns.org/api/auth/session/ | grep -q 'isAuthenticated'; then
        echo "✅ Backend is healthy"
        break
    fi
    echo ">>> Attempt $i/3 failed, retrying in 5s..."
    sleep 5
    if [ "$i" -eq 3 ]; then
        echo "❌ Backend health check failed after 3 attempts"
        exit 1
    fi
done

# Verify RAG
echo ">>> Verifying RAG service..."
for i in 1 2 3; do
    if curl -sfL http://localhost:8004/rag/health | grep -q 'ok'; then
        echo "✅ RAG service is healthy"
        break
    fi
    echo ">>> Attempt $i/3 failed, retrying in 5s..."
    sleep 5
    if [ "$i" -eq 3 ]; then
        echo "❌ RAG health check failed after 3 attempts"
        exit 1
    fi
done

echo "===== Deploy complete: $(date) ====="
