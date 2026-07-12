#!/bin/bash
cd /home/ec2-user/app
sed -i 's|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=https://ghostcode-ai.vercel.app,https://api-ghostcode.duckdns.org|' .env.docker
sed -i 's|^FRONTEND_URL=.*|FRONTEND_URL=https://ghostcode-ai.vercel.app|' .env.docker
grep -E '^(CORS_ALLOWED_ORIGINS|FRONTEND_URL)' .env.docker
