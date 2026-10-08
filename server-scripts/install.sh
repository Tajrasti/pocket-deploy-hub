#!/bin/sh
# PhoneDeploy installer — works on postmarketOS/Alpine, Debian/Ubuntu, Fedora, Arch.
# Run as your normal user (it uses sudo when needed):  sh install.sh
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
USER_NAME="$(id -un)"
USER_HOME="$HOME"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

say "Installing system packages (node, npm, git, caddy)"
if command -v apk >/dev/null 2>&1; then
    $SUDO apk add --no-cache nodejs npm git caddy libcap curl
elif command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update && $SUDO apt-get install -y nodejs npm git caddy libcap2-bin curl
elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y nodejs npm git caddy libcap curl
elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm nodejs npm git caddy libcap curl
else
    echo "Unknown package manager - install node (>=18), npm, git and caddy yourself."
fi

say "Installing PM2 (keeps apps running)"
command -v pm2 >/dev/null 2>&1 || $SUDO npm install -g pm2

# Let Caddy listen on port 80/443 without running as root
CADDY_BIN="$(command -v caddy || true)"
[ -n "$CADDY_BIN" ] && $SUDO setcap cap_net_bind_service=+ep "$CADDY_BIN" 2>/dev/null || true
# Stop a system-wide Caddy so it does not fight over port 80
$SUDO rc-service caddy stop 2>/dev/null || $SUDO systemctl disable --now caddy 2>/dev/null || true
$SUDO rc-update del caddy default 2>/dev/null || true

if [ -f "$ROOT/package.json" ]; then
    say "Building the dashboard"
    (cd "$ROOT" && npm install --no-audit --no-fund && npm run build)
fi

say "Starting PhoneDeploy"
mkdir -p "$HERE/caddy" "$HERE/config" "$HERE/logs" "$HERE/apps"
touch "$HERE/caddy/Caddyfile"
cd "$HERE"
pm2 delete phonedeploy phonedeploy-caddy >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save

say "Enabling start on boot"
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    $SUDO env PATH="$PATH" pm2 startup systemd -u "$USER_NAME" --hp "$USER_HOME" >/dev/null
else
    # OpenRC (postmarketOS / Alpine)
    PM2_BIN="$(command -v pm2)"
    $SUDO tee /etc/init.d/phonedeploy >/dev/null <<EOF
#!/sbin/openrc-run
name="PhoneDeploy"
description="PhoneDeploy (restores all PM2 apps)"
depend() { need net; after firewall; }
start() {
    ebegin "Starting PhoneDeploy"
    su - $USER_NAME -c "$PM2_BIN resurrect"
    eend \$?
}
stop() {
    ebegin "Stopping PhoneDeploy"
    su - $USER_NAME -c "$PM2_BIN save --force; $PM2_BIN kill"
    eend \$?
}
EOF
    $SUDO chmod +x /etc/init.d/phonedeploy
    $SUDO rc-update add phonedeploy default
fi

IP="$(hostname -i 2>/dev/null | awk '{print $1}')"
[ -z "$IP" ] || [ "$IP" = "127.0.0.1" ] && IP="$(ip -4 route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
say "Done!"
echo "Dashboard:  http://${IP:-YOUR_IP}:3001   (or http://${IP:-YOUR_IP} via Caddy)"
echo "Webhook:    http://${IP:-YOUR_IP}:3001/webhook  (secret: Settings > Security)"
echo "Logs:       pm2 logs phonedeploy"
