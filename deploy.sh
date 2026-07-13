#!/bin/bash
# Deploy script for KillaAssistant backend on DigitalOcean Droplet
# Usage: ./deploy.sh
#
# Prerequisites:
# - SSH key configured for root@134.209.116.42
# - Node.js 20+ installed locally
# - Backend dependencies installed (npm install in backend/)

set -e

DROPLET_IP="134.209.116.42"
REMOTE_DIR="/opt/killa-assistant"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Building backend ==="
cd "$SCRIPT_DIR/backend"
npm run build

echo "=== Pushing to GitHub ==="
cd "$SCRIPT_DIR"
git push origin main

echo "=== Pulling latest code on droplet ==="
ssh -o ConnectTimeout=10 root@$DROPLET_IP "cd $REMOTE_DIR && git pull origin main"

echo "=== Copying compiled dist/ to droplet ==="
scp -r "$SCRIPT_DIR/backend/dist" "root@$DROPLET_IP:$REMOTE_DIR/backend/"

echo "=== Rebuilding and restarting Docker container ==="
ssh -o ConnectTimeout=10 root@$DROPLET_IP "cd $REMOTE_DIR && docker compose down && docker compose up -d --build"

echo "=== Waiting for container to start ==="
sleep 5

echo "=== Verifying deployment ==="
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://killaassistant.duckdns.org/health")
if [ "$HTTP_STATUS" = "200" ]; then
  echo "Deployment successful. Backend is running."
  curl -s "https://killaassistant.duckdns.org/health"
  echo ""
else
  echo "WARNING: Backend health check returned HTTP $HTTP_STATUS"
  exit 1
fi
