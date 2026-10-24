#!/usr/bin/env bash
# Pull the latest code, rebuild the frontend and restart the API.
#   bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

echo "== Backend"
(cd backend && npm ci --omit=dev)

echo "== Frontend"
(cd frontend && npm ci && npm run build)

echo "== Restart API"
if pm2 describe leadpro-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "Done. nginx serves the new frontend straight away (no reload needed)."
