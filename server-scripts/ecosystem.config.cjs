/**
 * PM2 Ecosystem Configuration
 * Manages all PhoneDeploy services
 */

const path = require('path');
const os = require('os');
const deployDir = `/home/${process.env.USER || os.userInfo().username}/phonedeploy`;

module.exports = {
  apps: [
    // Frontend Dashboard - served via 'serve'
    {
      name: 'phonedeploy-frontend',
      script: 'serve',
      args: ['-s', path.join(deployDir, 'frontend'), '-l', '3000'],
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_file: path.join(deployDir, 'logs', 'frontend.log'),
      error_file: path.join(deployDir, 'logs', 'frontend-error.log'),
      merge_logs: true,
      time: true
    },
    // Webhook & API Server
    {
      name: 'phonedeploy-webhook',
      script: path.join(deployDir, 'webhook-server.js'),
      node_args: '--experimental-modules',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 3001,
        DEPLOY_DIR: deployDir
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_file: path.join(deployDir, 'logs', 'webhook.log'),
      error_file: path.join(deployDir, 'logs', 'webhook-error.log'),
      merge_logs: true,
      time: true,
      kill_timeout: 5000
    },
    // Stats Server
    {
      name: 'phonedeploy-stats',
      script: path.join(deployDir, 'stats-server.js'),
      node_args: '--experimental-modules',
      env: {
        NODE_ENV: 'production',
        STATS_PORT: 3002
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_file: path.join(deployDir, 'logs', 'stats.log'),
      error_file: path.join(deployDir, 'logs', 'stats-error.log'),
      merge_logs: true,
      time: true,
      kill_timeout: 5000
    }
  ]
};
