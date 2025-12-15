/**
 * PhoneDeploy - Webhook & API Server
 * Handles GitHub webhooks and deployment management
 */

import http from 'http';
import { createHmac } from 'crypto';
import { spawn, exec } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const PORT = process.env.WEBHOOK_PORT || 3001;
const DEPLOY_DIR = process.env.DEPLOY_DIR || `/home/${process.env.USER}/phonedeploy`;
const CONFIG_FILE = join(DEPLOY_DIR, 'config', 'apps.json');
const SECRET_FILE = join(DEPLOY_DIR, 'config', 'webhook-secret.txt');
const LOGS_DIR = join(DEPLOY_DIR, 'logs');

// Ensure directories exist
[join(DEPLOY_DIR, 'config'), LOGS_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Load or create config
function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify({ apps: [] }));
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Load webhook secret
function getWebhookSecret() {
  if (existsSync(SECRET_FILE)) {
    return readFileSync(SECRET_FILE, 'utf8').trim();
  }
  return null;
}

// Verify GitHub webhook signature
function verifySignature(payload, signature) {
  const secret = getWebhookSecret();
  if (!secret) return true; // Skip verification if no secret
  
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return signature === digest;
}

// Deploy an application
function deployApp(app, callback) {
  const logFile = join(LOGS_DIR, `${app.id}-build.log`);
  const timestamp = new Date().toISOString();
  
  // Update status to building
  const config = loadConfig();
  const appIndex = config.apps.findIndex(a => a.id === app.id);
  if (appIndex >= 0) {
    config.apps[appIndex].status = 'building';
    saveConfig(config);
  }
  
  const args = [
    join(DEPLOY_DIR, 'deploy.sh'),
    app.name || app.id,
    app.repo,
    app.branch || 'main',
    app.buildCommand || 'npm install',
    app.startCommand || 'npm start',
    String(app.port || 3000),
    app.domain || ''
  ];
  
  console.log(`[${timestamp}] Starting deployment: ${app.name}`);
  
  const child = spawn('sh', args, {
    cwd: DEPLOY_DIR,
    env: { ...process.env, ...app.envVars }
  });
  
  let output = '';
  
  child.stdout.on('data', (data) => {
    output += data.toString();
    console.log(data.toString());
  });
  
  child.stderr.on('data', (data) => {
    output += data.toString();
    console.error(data.toString());
  });
  
  child.on('close', (code) => {
    const finalConfig = loadConfig();
    const idx = finalConfig.apps.findIndex(a => a.id === app.id);
    
    if (idx >= 0) {
      finalConfig.apps[idx].status = code === 0 ? 'running' : 'error';
      finalConfig.apps[idx].lastDeployed = new Date().toISOString();
      saveConfig(finalConfig);
    }
    
    if (callback) callback(code === 0, output);
  });
}

// Stop an application
function stopApp(appId, callback) {
  exec(`pm2 stop ${appId}`, (error) => {
    const config = loadConfig();
    const idx = config.apps.findIndex(a => a.id === appId);
    if (idx >= 0) {
      config.apps[idx].status = 'stopped';
      saveConfig(config);
    }
    if (callback) callback(!error);
  });
}

// Start an application
function startApp(appId, callback) {
  exec(`pm2 start ${appId}`, (error) => {
    const config = loadConfig();
    const idx = config.apps.findIndex(a => a.id === appId);
    if (idx >= 0) {
      config.apps[idx].status = error ? 'error' : 'running';
      saveConfig(config);
    }
    if (callback) callback(!error);
  });
}

// Delete an application
function deleteApp(appId, callback) {
  exec(`pm2 delete ${appId}; rm -rf ${join(DEPLOY_DIR, 'apps', appId)}`, () => {
    const config = loadConfig();
    config.apps = config.apps.filter(a => a.id !== appId);
    saveConfig(config);
    if (callback) callback(true);
  });
}

// Get build logs
function getLogs(appId) {
  const logFile = join(LOGS_DIR, `${appId}-build.log`);
  if (existsSync(logFile)) {
    return readFileSync(logFile, 'utf8');
  }
  return '';
}

// CORS headers
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Hub-Signature-256');
}

// Request handler
const server = http.createServer((req, res) => {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  // Collect body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    
    // GitHub Webhook
    if (path === '/webhook' && req.method === 'POST') {
      const signature = req.headers['x-hub-signature-256'];
      
      if (!verifySignature(body, signature)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }
      
      try {
        const payload = JSON.parse(body);
        const repoUrl = payload.repository?.clone_url || payload.repository?.html_url;
        const branch = payload.ref?.replace('refs/heads/', '');
        
        // Find app by repo URL
        const config = loadConfig();
        const app = config.apps.find(a => 
          a.repo === repoUrl || a.repo === payload.repository?.html_url
        );
        
        if (app && app.branch === branch) {
          console.log(`Webhook received for ${app.name}, deploying...`);
          deployApp(app);
          res.writeHead(200);
          res.end(JSON.stringify({ message: 'Deployment started' }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify({ message: 'No matching app found' }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid payload' }));
      }
      return;
    }
    
    // API: List apps
    if (path === '/api/apps' && req.method === 'GET') {
      const config = loadConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config.apps));
      return;
    }
    
    // API: Deploy new app
    if (path === '/api/apps' && req.method === 'POST') {
      try {
        const app = JSON.parse(body);
        app.id = app.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        app.status = 'building';
        app.lastDeployed = new Date().toISOString();
        
        const config = loadConfig();
        config.apps = config.apps.filter(a => a.id !== app.id);
        config.apps.push(app);
        saveConfig(config);
        
        deployApp(app, (success) => {
          console.log(`Deployment ${success ? 'succeeded' : 'failed'}: ${app.name}`);
        });
        
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Deployment started', app }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
      return;
    }
    
    // API: App actions (start/stop/redeploy/delete)
    const appMatch = path.match(/^\/api\/apps\/([^/]+)\/?(start|stop|redeploy|logs)?$/);
    if (appMatch) {
      const appId = appMatch[1];
      const action = appMatch[2];
      
      if (req.method === 'DELETE' || action === 'delete') {
        deleteApp(appId, () => {
          res.writeHead(200);
          res.end(JSON.stringify({ message: 'App deleted' }));
        });
        return;
      }
      
      if (action === 'start' && req.method === 'POST') {
        startApp(appId, (success) => {
          res.writeHead(success ? 200 : 500);
          res.end(JSON.stringify({ success }));
        });
        return;
      }
      
      if (action === 'stop' && req.method === 'POST') {
        stopApp(appId, (success) => {
          res.writeHead(success ? 200 : 500);
          res.end(JSON.stringify({ success }));
        });
        return;
      }
      
      if (action === 'redeploy' && req.method === 'POST') {
        const config = loadConfig();
        const app = config.apps.find(a => a.id === appId);
        if (app) {
          deployApp(app);
          res.writeHead(202);
          res.end(JSON.stringify({ message: 'Redeployment started' }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'App not found' }));
        }
        return;
      }
      
      if (action === 'logs' && req.method === 'GET') {
        const logs = getLogs(appId);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(logs);
        return;
      }
    }
    
    // Health check
    if (path === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }
    
    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PhoneDeploy Webhook Server running on port ${PORT}`);
  console.log(`Webhook URL: http://YOUR_IP:${PORT}/webhook`);
  console.log(`API URL: http://YOUR_IP:${PORT}/api/apps`);
});
