#!/bin/sh
# PhoneDeploy - Application Deployment Script

set -e

DEPLOY_DIR="/home/$(whoami)/phonedeploy"
APPS_DIR="$DEPLOY_DIR/apps"
LOGS_DIR="$DEPLOY_DIR/logs"
CONFIG_FILE="$DEPLOY_DIR/config/apps.json"

# Arguments
APP_NAME="$1"
REPO_URL="$2"
BRANCH="${3:-main}"
BUILD_CMD="${4:-npm install}"
START_CMD="${5:-npm start}"
PORT="${6:-3000}"
DOMAIN="${7:-}"

if [ -z "$APP_NAME" ] || [ -z "$REPO_URL" ]; then
    echo "Usage: ./deploy.sh <app-name> <repo-url> [branch] [build-cmd] [start-cmd] [port] [domain]"
    exit 1
fi

APP_DIR="$APPS_DIR/$APP_NAME"
LOG_FILE="$LOGS_DIR/$APP_NAME-build.log"

echo "=== Deploying $APP_NAME ===" | tee "$LOG_FILE"
echo "Repo: $REPO_URL" | tee -a "$LOG_FILE"
echo "Branch: $BRANCH" | tee -a "$LOG_FILE"
echo "Port: $PORT" | tee -a "$LOG_FILE"

# Stop existing app if running
pm2 stop "$APP_NAME" 2>/dev/null || true
pm2 delete "$APP_NAME" 2>/dev/null || true

# Clone or pull repo
if [ -d "$APP_DIR" ]; then
    echo "[1/4] Updating repository..." | tee -a "$LOG_FILE"
    cd "$APP_DIR"
    git fetch origin
    git reset --hard "origin/$BRANCH"
else
    echo "[1/4] Cloning repository..." | tee -a "$LOG_FILE"
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# Run build command
echo "[2/4] Building application..." | tee -a "$LOG_FILE"
eval "$BUILD_CMD" 2>&1 | tee -a "$LOG_FILE"

# Start with PM2
echo "[3/4] Starting application..." | tee -a "$LOG_FILE"
PORT=$PORT pm2 start --name "$APP_NAME" -- $START_CMD
pm2 save

# Update Caddy config if domain provided
if [ -n "$DOMAIN" ]; then
    echo "[4/4] Updating reverse proxy..." | tee -a "$LOG_FILE"
    
    CADDYFILE="/etc/caddy/Caddyfile"
    
    # Remove old entry for this domain
    sudo sed -i "/$DOMAIN {/,/}/d" "$CADDYFILE" 2>/dev/null || true
    
    # Add new entry
    cat << EOF | sudo tee -a "$CADDYFILE"

$DOMAIN {
    reverse_proxy localhost:$PORT
}
EOF
    
    # Reload Caddy
    sudo caddy reload --config "$CADDYFILE" 2>/dev/null || sudo rc-service caddy reload
fi

# Update apps.json
echo "Updating configuration..." | tee -a "$LOG_FILE"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create app entry
NEW_APP=$(cat << EOF
{
  "id": "$APP_NAME",
  "name": "$APP_NAME",
  "repo": "$REPO_URL",
  "branch": "$BRANCH",
  "status": "running",
  "domain": "$DOMAIN",
  "port": $PORT,
  "lastDeployed": "$TIMESTAMP",
  "buildCommand": "$BUILD_CMD",
  "startCommand": "$START_CMD"
}
EOF
)

# Update or add app in config
if [ -f "$CONFIG_FILE" ]; then
    # Remove existing entry and add new one
    jq --argjson app "$NEW_APP" '
        .apps = [.apps[] | select(.id != $app.id)] + [$app]
    ' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
else
    echo '{"apps":[]}' | jq --argjson app "$NEW_APP" '.apps += [$app]' > "$CONFIG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "=== Deployment Complete ===" | tee -a "$LOG_FILE"
echo "App: $APP_NAME" | tee -a "$LOG_FILE"
echo "URL: http://$DOMAIN" | tee -a "$LOG_FILE"
echo "Port: $PORT" | tee -a "$LOG_FILE"
