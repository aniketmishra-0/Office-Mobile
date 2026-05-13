#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Pulling latest changes from origin/main..."
git pull --ff-only origin main

echo "Restarting backend with pm2..."
pm2 restart backend --update-env

echo "Backend deploy complete."