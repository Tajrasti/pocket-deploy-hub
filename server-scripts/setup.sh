#!/bin/sh
# PhoneDeploy Setup Script for postmarketOS (Alpine-based)

set -e

echo "=== PhoneDeploy Setup ==="
echo "Setting up deployment server on postmarketOS..."

# Update package list
echo "[1/6] Updating packages..."
sudo apk update

# Install required packages
echo "[2/6] Installing dependencies..."
sudo apk add --no-cache \
    nodejs \
    npm \
    git \
    caddy \
    curl \
    jq \
    openssl

# Install PM2 globally
echo "[3/6] Installing PM2 process manager..."
sudo npm install -g pm2

# Create directory structure
echo "[4/6] Creating directories..."
DEPLOY_DIR="/home/$(whoami)/phonedeploy"
mkdir -p "$DEPLOY_DIR/apps"
mkdir -p "$DEPLOY_DIR/logs"
mkdir -p "$DEPLOY_DIR/config"
mkdir -p "$DEPLOY_DIR/caddy"

# Generate a webhook secret
echo "[5/6] Generating webhook secret..."
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "$WEBHOOK_SECRET" > "$DEPLOY_DIR/config/webhook-secret.txt"
echo "Webhook secret saved to $DEPLOY_DIR/config/webhook-secret.txt"

# Create initial config
echo "[6/6] Creating initial configuration..."
cat > "$DEPLOY_DIR/config/apps.json" << 'EOF'
{
  "apps": []
}
EOF

# Setup Caddy
echo "Setting up Caddy..."
sudo cp "$DEPLOY_DIR/caddy/Caddyfile" /etc/caddy/Caddyfile 2>/dev/null || true

# Enable Caddy service
sudo rc-update add caddy default 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Configure your domain/IP in the Caddyfile"
echo "2. Start services: pm2 start ecosystem.config.cjs"
echo "3. Save PM2 config: pm2 save"
echo "4. Setup PM2 startup: pm2 startup"
echo ""
echo "Webhook URL: http://YOUR_IP:3001/webhook"
echo "Webhook Secret: $WEBHOOK_SECRET"
echo ""
echo "Add this webhook to your GitHub repos!"
