#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="ghostcode_pg_$TIMESTAMP.sql.gz"
COMPOSE_FILE="/opt/ghostcode/docker-compose.prod.yml"
BUCKET="ghostcode-backups-abhi"

# Dump PostgreSQL running inside Docker
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U postgres deadcode_detector 2>/dev/null | gzip > "/tmp/$FILENAME"

# Upload to S3
aws s3 cp "/tmp/$FILENAME" "s3://$BUCKET/$FILENAME" --quiet

# Clean up local temp files older than 7 days
find /tmp -name "ghostcode_pg_*.sql.gz" -mtime +7 -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backup $FILENAME uploaded to s3://$BUCKET/"
