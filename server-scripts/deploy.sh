#!/bin/sh
# PhoneDeploy - Application Deployment Script

set -e

DEPLOY_DIR="${DEPLOY_DIR:-/home/$(whoami)/phonedeploy}"
APPS_DIR="${APPS_DIR:-$DEPLOY_DIR/apps}"
LOGS_DIR="$DEPLOY_DIR/logs"
CONFIG_FILE="$DEPLOY_DIR/config/apps.json"
CADDY_DIR="$DEPLOY_DIR/caddy"

# Arguments
APP_ID="$1"
REPO_URL="$2"
BRANCH="${3:-main}"
BUILD_CMD="${4:-npm install && npm run build}"
START_CMD="${5:-npm start}"
PORT="${6:-3000}"
DOMAIN="${7:-}"

if [ -z "$APP_ID" ] || [ -z "$REPO_URL" ]; then
    echo "Usage: ./deploy.sh <app-id> <repo-url> [branch] [build-cmd] [start-cmd] [port] [domain]"
    exit 1
fi

APP_DIR="$APPS_DIR/$APP_ID"
LOG_FILE="$LOGS_DIR/$APP_ID-build.log"

# Ensure directories exist
mkdir -p "$APPS_DIR" "$LOGS_DIR" "$CADDY_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Starting deployment: $APP_ID"
log "Repository: $REPO_URL"
log "Branch: $BRANCH"
log "Port: $PORT"
log "Domain: $DOMAIN"
log "=========================================="

# Stop existing app if running
log "Stopping existing instance..."
pm2 stop "$APP_ID" 2>/dev/null || true
pm2 delete "$APP_ID" 2>/dev/null || true

# Clone or pull repo
if [ -d "$APP_DIR/.git" ]; then
    log "[1/4] Updating repository..."
    cd "$APP_DIR"
    git fetch origin 2>&1 | tee -a "$LOG_FILE"
    git reset --hard "origin/$BRANCH" 2>&1 | tee -a "$LOG_FILE"
    git clean -fd 2>&1 | tee -a "$LOG_FILE"
else
    log "[1/4] Cloning repository..."
    rm -rf "$APP_DIR" 2>/dev/null || true
    git clone -b "$BRANCH" --single-branch "$REPO_URL" "$APP_DIR" 2>&1 | tee -a "$LOG_FILE"
    cd "$APP_DIR"
fi

# Detect package manager
if [ -f "bun.lockb" ]; then
    PKG_MGR="bun"
    INSTALL_CMD="bun install"
elif [ -f "pnpm-lock.yaml" ]; then
    PKG_MGR="pnpm"
    INSTALL_CMD="pnpm install"
elif [ -f "yarn.lock" ]; then
    PKG_MGR="yarn"
    INSTALL_CMD="yarn install"
else
    PKG_MGR="npm"
    INSTALL_CMD="npm install"
fi

log "Detected package manager: $PKG_MGR"

# Run build command
log "[2/4] Building application..."
log "Running: $BUILD_CMD"
eval "$BUILD_CMD" 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
    log "ERROR: Build failed!"
    exit 1
fi

log "Build completed successfully"

# Detect if it's a static site
IS_STATIC=false
SERVE_DIR=""

if [ -d "dist" ]; then
    IS_STATIC=true
    SERVE_DIR="dist"
elif [ -d "build" ]; then
    IS_STATIC=true
    SERVE_DIR="build"
elif [ -d "out" ]; then
    IS_STATIC=true
    SERVE_DIR="out"
fi

# Start with PM2
log "[3/4] Starting application on port $PORT..."

if [ "$IS_STATIC" = true ]; then
    log "Detected static build in $SERVE_DIR/, using serve..."
    # Check if serve is available
    if ! command -v serve &> /dev/null; then
        npm install -g serve 2>&1 | tee -a "$LOG_FILE"
    fi
    pm2 start "npx" --name "$APP_ID" -- serve -s "$SERVE_DIR" -l "$PORT" 2>&1 | tee -a "$LOG_FILE"
else
    log "Starting with: $START_CMD"
    PORT=$PORT pm2 start "$START_CMD" --name "$APP_ID" 2>&1 | tee -a "$LOG_FILE" || \
    PORT=$PORT pm2 start npm --name "$APP_ID" -- start 2>&1 | tee -a "$LOG_FILE"
fi

pm2 save 2>/dev/null || true

# Wait and check if app started
sleep 3

if pm2 show "$APP_ID" 2>/dev/null | grep -q "online"; then
    log "✓ Application started successfully!"
else
    log "WARNING: Application may not have started. Check 'pm2 logs $APP_ID'"
fi

# Update Caddy config if domain provided
if [ -n "$DOMAIN" ]; then
    log "[4/4] Updating reverse proxy for $DOMAIN..."
    
    # Update apps.conf
    APPS_CONF="$CADDY_DIR/apps.conf"
    
    # Remove old entry for this app
    if [ -f "$APPS_CONF" ]; then
        sed -i "/# $APP_ID$/,/^}/d" "$APPS_CONF" 2>/dev/null || true
    fi
    
    # Add new entry
    cat >> "$APPS_CONF" << EOF
# $APP_ID
$DOMAIN {
    reverse_proxy localhost:$PORT
    encode gzip
}

EOF
    
    # Reload Caddy
    if [ -f "$CADDY_DIR/Caddyfile" ]; then
        caddy reload --config "$CADDY_DIR/Caddyfile" 2>/dev/null || log "Note: Caddy reload skipped"
    fi
else
    log "[4/4] No domain specified, skipping reverse proxy setup"
fi

log ""
log "=========================================="
log "✓ Deployment Complete!"
log "App: $APP_ID"
log "Port: $PORT"
[ -n "$DOMAIN" ] && log "URL: http://$DOMAIN"
log "=========================================="

exit 0
