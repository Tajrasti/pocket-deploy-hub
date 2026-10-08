// PM2 config for PhoneDeploy itself. Deployed apps are added to PM2 by the server.
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'phonedeploy',
      script: path.join(__dirname, 'server.js'),
      cwd: __dirname,
      env: { PORT: 3001 },
      autorestart: true,
      restart_delay: 3000,
      time: true,
    },
    {
      name: 'phonedeploy-caddy',
      script: 'caddy',
      args: `run --config ${path.join(__dirname, 'caddy', 'Caddyfile')} --adapter caddyfile`,
      interpreter: 'none',
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
