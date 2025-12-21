#!/bin/sh
# PhoneDeploy Setup Script for postmarketOS (Alpine-based)

set -e

echo "=== PhoneDeploy Setup ==="
echo "Setting up deployment server on postmarketOS..."

# Update package list
echo "[1/8] Updating packages..."
sudo apk update

# Install required packages
echo "[2/8] Installing dependencies..."
sudo apk add --no-cache \
    nodejs \
    npm \
    git \
    caddy \
    curl \
    jq \
    openssl

# Install PM2 and serve globally
echo "[3/8] Installing PM2 and serve..."
sudo npm install -g pm2 serve

# Create directory structure
echo "[4/8] Creating directories..."
DEPLOY_DIR="/home/$(whoami)/phonedeploy"
mkdir -p "$DEPLOY_DIR/apps"
mkdir -p "$DEPLOY_DIR/logs"
mkdir -p "$DEPLOY_DIR/config"
mkdir -p "$DEPLOY_DIR/caddy"
mkdir -p "$DEPLOY_DIR/frontend"

# Generate a webhook secret
echo "[5/8] Generating webhook secret..."
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "$WEBHOOK_SECRET" > "$DEPLOY_DIR/config/webhook-secret.txt"
echo "Webhook secret saved to $DEPLOY_DIR/config/webhook-secret.txt"

# Create initial config
echo "[6/8] Creating initial configuration..."
cat > "$DEPLOY_DIR/config/apps.json" << 'EOF'
{
  "apps": []
}
EOF

cat > "$DEPLOY_DIR/config/ports.json" << 'EOF'
{
  "nextPort": 4000,
  "allocated": {}
}
EOF

# Create server settings config
cat > "$DEPLOY_DIR/config/settings.json" << 'EOF'
{
  "baseDomain": "",
  "webhookSecret": "",
  "autoRestart": true,
  "maxConcurrentBuilds": 2,
  "logRetentionDays": 7,
  "defaultBranch": "main",
  "enableCaddy": true
}
EOF

# Read webhook secret into settings
jq --arg secret "$WEBHOOK_SECRET" '.webhookSecret = $secret' "$DEPLOY_DIR/config/settings.json" > "$DEPLOY_DIR/config/settings.json.tmp" && mv "$DEPLOY_DIR/config/settings.json.tmp" "$DEPLOY_DIR/config/settings.json"

# Setup Caddy
echo "[7/8] Setting up Caddy..."
sudo cp "$DEPLOY_DIR/caddy/Caddyfile" /etc/caddy/Caddyfile 2>/dev/null || true

# Enable Caddy service
sudo rc-update add caddy default 2>/dev/null || true

# Setup PM2 startup for OpenRC
echo "[8/8] Configuring PM2 startup..."

# Create PM2 startup script
PM2_STARTUP_SCRIPT="/etc/init.d/pm2-$(whoami)"
sudo tee "$PM2_STARTUP_SCRIPT" > /dev/null << INITEOF
#!/sbin/openrc-run

name="PM2"
description="PM2 Process Manager for $(whoami)"

USER_HOME="/home/$(whoami)"
PM2_HOME="\$USER_HOME/.pm2"

depend() {
    need net localmount
    after firewall
}

start() {
    ebegin "Starting PM2 for $(whoami)"
    export HOME="\$USER_HOME"
    export PM2_HOME="\$PM2_HOME"
    
    # First try to resurrect saved processes
    if [ -f "\$PM2_HOME/dump.pm2" ]; then
        su - $(whoami) -c "PM2_HOME=\$PM2_HOME pm2 resurrect" >/dev/null 2>&1
    fi
    
    # If no processes running, start from ecosystem
    RUNNING=\$(su - $(whoami) -c "PM2_HOME=\$PM2_HOME pm2 jlist 2>/dev/null" | jq length 2>/dev/null || echo "0")
    if [ "\$RUNNING" = "0" ] || [ -z "\$RUNNING" ]; then
        if [ -f "\$USER_HOME/phonedeploy/ecosystem.config.cjs" ]; then
            su - $(whoami) -c "cd \$USER_HOME/phonedeploy && PM2_HOME=\$PM2_HOME pm2 start ecosystem.config.cjs"
        fi
    fi
    
    eend \$?
}

stop() {
    ebegin "Saving PM2 state and stopping"
    export HOME="\$USER_HOME"
    export PM2_HOME="\$PM2_HOME"
    su - $(whoami) -c "PM2_HOME=\$PM2_HOME pm2 save" >/dev/null 2>&1 || true
    su - $(whoami) -c "PM2_HOME=\$PM2_HOME pm2 kill" >/dev/null 2>&1 || true
    eend 0
}

status() {
    su - $(whoami) -c "pm2 list"
}
INITEOF

# Make init script executable and enable it
sudo chmod +x "$PM2_STARTUP_SCRIPT"
sudo rc-update add "pm2-$(whoami)" default 2>/dev/null || true

# Initialize PM2 dump file
pm2 save 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy all server-scripts files to $DEPLOY_DIR"
echo "2. Make scripts executable: chmod +x $DEPLOY_DIR/*.sh"
echo "3. Build the frontend: cd /path/to/lovable-project && npm run build"
echo "4. Copy dist folder to $DEPLOY_DIR/frontend/"
echo "5. Start services: cd $DEPLOY_DIR && pm2 start ecosystem.config.cjs"
echo "6. Save PM2 state: pm2 save"
echo ""
echo "The services will auto-start on reboot!"
echo ""
echo "Webhook URL: http://YOUR_IP:3001/webhook"
echo "Webhook Secret: $WEBHOOK_SECRET"
echo "Dashboard: http://YOUR_IP:3000"
echo ""
echo "Add this webhook to your GitHub repos!"
