# PhoneDeploy - Server Scripts

These scripts run on your postmarketOS device to enable automatic deployments.

## Quick Setup

```bash
# 1. Copy this folder to your device
scp -r server-scripts/ user@your-device:/home/user/phonedeploy/

# 2. SSH into your device
ssh user@your-device

# 3. Run the setup script
cd /home/user/phonedeploy
chmod +x setup.sh
./setup.sh

# 4. Start the deployment server
pm2 start ecosystem.config.cjs
pm2 save
```

## Directory Structure

```
/home/user/phonedeploy/
├── apps/              # Deployed applications live here
├── logs/              # Build and runtime logs
├── config/            # App configurations (JSON)
├── setup.sh           # Initial setup script
├── deploy.sh          # Deploy/redeploy script
├── webhook-server.js  # GitHub webhook receiver
├── stats-server.js    # System stats API
├── ecosystem.config.cjs # PM2 configuration
└── caddy/
    └── Caddyfile      # Reverse proxy config
```

## Ports

- **3001**: Webhook server (receives GitHub webhooks)
- **3002**: Stats API (system monitoring)
- **80/443**: Caddy reverse proxy

## Adding a New App via Dashboard

1. Click "Deploy New App" in the dashboard
2. Fill in repo URL, branch, commands
3. The webhook server will clone and build the app
4. Caddy will automatically route traffic to your app

## Manual Deployment

```bash
./deploy.sh my-app https://github.com/user/repo main "npm install" "npm start" 3000
```
