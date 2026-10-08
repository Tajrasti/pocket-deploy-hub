# PhoneDeploy server

One Node.js process (`server.js`, no npm dependencies) that runs the dashboard, API,
GitHub webhook and system stats on **port 3001**. Apps are run by PM2, and Caddy
routes domains to them. No Docker/Podman needed.

## Install (any Linux: postmarketOS, Alpine, Debian, Ubuntu, Fedora, Arch)

```sh
git clone https://github.com/YOU/pocket-deploy-hub.git
cd pocket-deploy-hub/server-scripts
sh install.sh
```

Then open `http://PHONE_IP:3001`. That's it — everything starts again by itself after a reboot,
including every app that was running.

## Update
```sh
cd pocket-deploy-hub && git pull && npm run build && pm2 restart phonedeploy
```

## Useful commands
- `pm2 ls` — list everything that is running
- `pm2 logs phonedeploy` — server logs
- `pm2 logs <app-id>` — logs of a deployed app

## Files
- `config/apps.json` — your apps (editable from the dashboard)
- `config/settings.json` — settings and webhook secret
- `apps/<id>/` — app source, `logs/<id>-build.log` — build logs
- `caddy/Caddyfile` — generated automatically

## How apps are run
- If the repo builds to `dist/`, `build/`, `out/` or `public/` with an `index.html` and has no
  `start` script (or the start command is empty), it is served as a static site.
- Otherwise the start command runs with `PORT` set to the app's port.

## WiFi
WiFi scanning/connecting in Settings uses NetworkManager (`nmcli`), which postmarketOS ships by default.
Ethernet (USB adapters) works automatically.
