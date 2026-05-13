#!/usr/bin/env bash

set -euo pipefail

REPO_PATH="$HOME/Office-Mobile"
REPO_URL="https://github.com/aniketmishra-0/Office-Mobile.git"
ENV_FILE="$REPO_PATH/backend/.env"
CREDENTIALS_DIR="$REPO_PATH/backend/credentials"
SERVICE_ACCOUNT_FILE_RELATIVE="./credentials/service_account.json"

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

upsert_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    local escaped_value
    escaped_value="$(escape_sed_replacement "$value")"
    sed -i.bak "s|^${key}=.*|${key}=${escaped_value}|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

echo "========================================="
echo "Backend Deployment Script"
echo "========================================="

# Clone repo if it doesn't exist
if [ ! -d "$REPO_PATH" ]; then
  echo "Repository not found at $REPO_PATH"
  echo "Cloning repository..."
  git clone "$REPO_URL" "$REPO_PATH"
  cd "$REPO_PATH"
else
  cd "$REPO_PATH"
  echo "Repository found at $REPO_PATH"
fi

echo "Pulling latest changes from origin/main..."
git pull --ff-only origin main || git fetch origin main && git reset --hard origin/main

if [ -f "$ENV_FILE" ]; then
  echo "Updating backend environment file..."

  # Handle base64-encoded JSON (from GitHub Actions)
  if [ -n "${GOOGLE_SERVICE_ACCOUNT_JSON_B64:-}" ]; then
    echo "Decoding Google service account JSON from base64..."
    GOOGLE_SERVICE_ACCOUNT_JSON=$(echo "$GOOGLE_SERVICE_ACCOUNT_JSON_B64" | base64 -d)
  fi

  if [ -n "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]; then
    echo "Writing Google service account JSON to credentials file..."
    mkdir -p "$CREDENTIALS_DIR"
    printf '%s' "$GOOGLE_SERVICE_ACCOUNT_JSON" > "$CREDENTIALS_DIR/service_account.json"
    chmod 600 "$CREDENTIALS_DIR/service_account.json"

    upsert_env_value "GOOGLE_SERVICE_ACCOUNT_FILE" "$SERVICE_ACCOUNT_FILE_RELATIVE"
    upsert_env_value "GOOGLE_SERVICE_ACCOUNT_JSON" ""

    if command -v python3 >/dev/null 2>&1; then
      service_account_email="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["client_email"])' "$CREDENTIALS_DIR/service_account.json")"
      upsert_env_value "GOOGLE_SERVICE_ACCOUNT_EMAIL" "$service_account_email"
    fi
  fi
fi

echo "Installing backend dependencies..."
cd backend

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but was not found on PATH." >&2
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi

PYTHON_BIN="$(pwd)/.venv/bin/python"
"$PYTHON_BIN" -m pip install --upgrade pip
"$PYTHON_BIN" -m pip install -r requirements.txt

UVICORN_CMD="$PYTHON_BIN -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo "Starting/Restarting backend with pm2..."
if pm2 info backend > /dev/null 2>&1; then
  echo "Replacing existing backend process..."
  pm2 delete backend
fi
pm2 start "$UVICORN_CMD" --name backend --update-env
pm2 save

echo "========================================="
echo "✓ Backend deploy complete!"
echo "========================================="
pm2 status backend