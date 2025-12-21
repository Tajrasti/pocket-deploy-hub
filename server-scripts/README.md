# PhoneDeploy Server Scripts

Backend scripts for running PhoneDeploy on your postmarketOS device.

## Quick Start

### 1. Initial Setup

```bash
# SSH into your device
ssh user@your-device-ip

# Create directory
mkdir -p ~/phonedeploy

# Copy all server-scripts files to ~/phonedeploy/
# (from your development machine)
scp -r server-scripts/* user@your-device-ip:~/phonedeploy/

# Run setup
cd ~/phonedeploy
chmod +x *.sh
./setup.sh
```

### 2. Build & Deploy Frontend

On your development machine:

```bash
# Build the frontend
npm run build

# Copy to device
scp -r dist/* user@your-device-ip:~/phonedeploy/frontend/
```

### 3. Start Services

```bash
# Start all services
cd ~/phonedeploy
pm2 start ecosystem.config.cjs

# IMPORTANT: Save PM2 state for auto-restart
pm2 save
```

### 4. Verify

- Dashboard: `http://your-device-ip:3000`
- API: `http://your-device-ip:3001/health`
- Stats: `http://your-device-ip:3002/api/stats`

## Services

| Service | Port | Description |
|---------|------|-------------|
| phonedeploy-frontend | 3000 | Dashboard UI |
| phonedeploy-webhook | 3001 | API & GitHub webhooks |
| phonedeploy-stats | 3002 | System metrics |

## Auto-Restart on Reboot

The setup script configures PM2 to auto-start on boot via OpenRC. After running `pm2 save`, all processes (including deployed apps) will automatically restart after a reboot.

To verify:
```bash
# Check if PM2 service is enabled
rc-status | grep pm2

# Test by rebooting
sudo reboot
```

## Environment Variables

Create a `.env` file in your frontend project before building:

```env
VITE_API_URL=http://your-device-ip:3001
VITE_STATS_URL=http://your-device-ip:3002
```

## Useful PM2 Commands

```bash
# View all processes
pm2 list

# View logs
pm2 logs

# Restart all
pm2 restart all

# Stop specific app
pm2 stop app-name

# Save current state (IMPORTANT for reboot persistence)
pm2 save

# Resurrect saved state
pm2 resurrect
```

## File Structure

```
~/phonedeploy/
├── apps/              # Deployed applications
├── config/
│   ├── apps.json      # App configurations
│   ├── ports.json     # Port allocations
│   ├── settings.json  # Server settings
│   └── webhook-secret.txt
├── frontend/          # Dashboard UI (built files)
├── logs/              # Build and runtime logs
├── caddy/             # Caddy reverse proxy config
├── ecosystem.config.cjs
├── webhook-server.js
├── stats-server.js
├── deploy.sh
└── setup.sh
```

## Troubleshooting

### Services not starting after reboot

```bash
# Check if init script exists
ls -la /etc/init.d/pm2-*

# Check OpenRC status
rc-status

# Manually start if needed
sudo service pm2-$(whoami) start
```

### App won't start/stop

```bash
# Check PM2 process list
pm2 list

# Check if app exists in PM2
pm2 describe app-name

# Force restart
pm2 restart app-name --force
```

### Port already in use

```bash
# Find process using port
netstat -tlnp | grep :PORT

# Kill process
kill -9 PID
```

## Adding a New App via Dashboard

1. Click "Deploy" button in the dashboard
2. Fill in repo URL, branch, commands
3. The webhook server will clone and build the app
4. Caddy will automatically route traffic to your app

## GitHub Webhook Setup

1. Go to Settings page in dashboard to copy webhook URL and secret
2. In your GitHub repo: Settings → Webhooks → Add webhook
3. Paste the webhook URL
4. Set content type to `application/json`
5. Paste the webhook secret
6. Select "Just the push event"
