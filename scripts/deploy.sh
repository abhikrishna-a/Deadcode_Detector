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
git checkout -- .
git pull origin main

# Generate .env.docker from example if missing
if [ ! -f "$APP_DIR/.env.docker" ]; then
    echo ">>> .env.docker not found — copying from .env.docker.example"
    cp "$APP_DIR/.env.docker.example" "$APP_DIR/.env.docker"
    echo ">>> IMPORTANT: Edit .env.docker with real secrets before restarting services"
fi

# Generate pgbouncer config from .env.docker if missing
if [ ! -f "$APP_DIR/pgbouncer/pgbouncer.ini" ]; then
    echo ">>> Generating pgbouncer.ini from .env.docker..."
    DB_HOST=$(grep '^DB_HOST=' "$APP_DIR/.env.docker" | cut -d'=' -f2-)
    DB_PASSWORD=$(grep '^DB_PASSWORD=' "$APP_DIR/.env.docker" | cut -d'=' -f2-)
    cp "$APP_DIR/pgbouncer/pgbouncer.ini.example" "$APP_DIR/pgbouncer/pgbouncer.ini"
    sed -i "s/changeme-rds-endpoint/$DB_HOST/g" "$APP_DIR/pgbouncer/pgbouncer.ini"
    cp "$APP_DIR/pgbouncer/userlist.txt.example" "$APP_DIR/pgbouncer/userlist.txt"
    sed -i "s/changeme-db-password/$DB_PASSWORD/g" "$APP_DIR/pgbouncer/userlist.txt"
    echo ">>> pgbouncer config generated"
fi

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
    if curl --connect-timeout 5 --max-time 10 -sf -o /dev/null -w '%{http_code}' http://localhost:8000/ | grep -qE '^[23]'; then
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
    if curl --connect-timeout 5 --max-time 10 -sf http://localhost:8004/rag/health | grep -q 'ok'; then
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
