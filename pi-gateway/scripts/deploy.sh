#!/bin/bash
# Deploy pi-gateway to remote server
# Usage: ./scripts/deploy.sh [restart]

REMOTE="root@115.191.43.169"
REMOTE_DIR="/root/.pi/agent"

rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude '*.log' \
  --exclude .DS_Store \
  --exclude bun.lockb \
  --exclude package-lock.json \
  --exclude sessions/ \
  --exclude messenger/ \
  ./ "${REMOTE}:${REMOTE_DIR}"

echo "✅ Synced to ${REMOTE}:${REMOTE_DIR}"

if [ "$1" = "restart" ]; then
  echo "Restarting gateway..."
  ssh "${REMOTE}" "cd ${REMOTE_DIR} && bun install --frozen-lockfile 2>/dev/null; pm2 restart pi-gateway 2>/dev/null || echo 'Manual restart needed'"
fi
