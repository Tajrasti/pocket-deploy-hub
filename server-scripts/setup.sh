#!/bin/sh
# PhoneDeploy Setup Script for postmarketOS (Alpine-based)

set -e

echo "=== PhoneDeploy Setup ==="
echo "Setting up deployment server on postmarketOS..."

# Update package list
echo "[1/7] Updating packages..."
sudo apk update

# Install required packages
echo "[2/7] Installing dependencies..."
sudo apk add --no-cache \
    nodejs \
    npm \
    git \
    caddy \
    curl \
    jq \
    openssl

# Install PM2 globally
echo "[3/7] Installing PM2 process manager..."
sudo npm install -g pm2

# Create directory structure
echo "[4/7] Creating directories..."
DEPLOY_DIR="/home/$(whoami)/pocket-deploy-hub/server-scripts"
mkdir -p "$DEPLOY_DIR/apps"
mkdir -p "$DEPLOY_DIR/logs"
mkdir -p "$DEPLOY_DIR/config"
mkdir -p "$DEPLOY_DIR/caddy"

# Generate a webhook secret
echo "[5/7] Generating webhook secret..."
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "$WEBHOOK_SECRET" > "$DEPLOY_DIR/config/webhook-secret.txt"
echo "Webhook secret saved to $DEPLOY_DIR/config/webhook-secret.txt"

# Create initial config
echo "[6/7] Creating initial configuration..."
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

# Setup Caddy
echo "Setting up Caddy..."
sudo cp "$DEPLOY_DIR/caddy/Caddyfile" /etc/caddy/Caddyfile 2>/dev/null || true

# Enable Caddy service
sudo rc-update add caddy default 2>/dev/null || true

# Setup PM2 startup
echo "[7/7] Configuring PM2 startup..."
# Generate startup script for OpenRC
pm2 startup openrc -u $(whoami) --hp /home/$(whoami) 2>/dev/null || true

# Create a simple init script for PhoneDeploy
INIT_SCRIPT="/etc/init.d/pocket-deploy-hub/server-scripts"
sudo tee "$INIT_SCRIPT" > /dev/null << 'INITEOF'
#!/sbin/openrc-run

name="PhoneDeploy"
description="PhoneDeploy Deployment Server"
command="/usr/bin/pm2"
command_args="resurrect"
command_user="${RC_SVCNAME##*.}"
pidfile="/run/${RC_SVCNAME}.pid"

depend() {
    need net
    after firewall
}

start_pre() {
    checkpath --directory --owner $(whoami) /run
}

start() {
    ebegin "Starting PhoneDeploy services"
    su - $(whoami) -c "cd /home/$(whoami)/pocket-deploy-hub/server-scripts && pm2 resurrect" || \
    su - $(whoami) -c "cd /home/$(whoami)/pocket-deploy-hub/server-scripts && pm2 start ecosystem.config.cjs"
    eend $?
}

stop() {
    ebegin "Stopping PhoneDeploy services"
    su - $(whoami) -c "pm2 kill"
    eend $?
}

status() {
    su - $(whoami) -c "pm2 list"
}
INITEOF

# Make init script executable and enable it
sudo chmod +x "$INIT_SCRIPT" 2>/dev/null || true
sudo rc-update add phonedeploy default 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy all server-scripts files to $DEPLOY_DIR"
echo "2. Make scripts executable: chmod +x $DEPLOY_DIR/*.sh"
echo "3. Start services: cd $DEPLOY_DIR && pm2 start ecosystem.config.cjs"
echo "4. Save PM2 state: pm2 save"
echo ""
echo "The services will auto-start on reboot!"
echo ""
echo "Webhook URL: http://YOUR_IP:3001/webhook"
echo "Webhook Secret: $WEBHOOK_SECRET"
echo ""
echo "Add this webhook to your GitHub repos!"
