/**
 * PhoneDeploy - Webhook & API Server
 * Handles GitHub webhooks and deployment management
 */

import http from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { spawn, exec } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';

const PORT = process.env.WEBHOOK_PORT || 3001;
const DEPLOY_DIR = process.env.DEPLOY_DIR || `/home/${process.env.USER || 'user'}/phonedeploy`;
const CONFIG_FILE = join(DEPLOY_DIR, 'config', 'apps.json');
const PORTS_FILE = join(DEPLOY_DIR, 'config', 'ports.json');
const SECRET_FILE = join(DEPLOY_DIR, 'config', 'webhook-secret.txt');
const LOGS_DIR = join(DEPLOY_DIR, 'logs');
const APPS_DIR = join(DEPLOY_DIR, 'apps');
const BASE_DOMAIN = process.env.BASE_DOMAIN || ''; // e.g., 'myserver.local'

// Ensure directories exist
[join(DEPLOY_DIR, 'config'), LOGS_DIR, APPS_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Port management
function loadPorts() {
  if (!existsSync(PORTS_FILE)) {
    writeFileSync(PORTS_FILE, JSON.stringify({ nextPort: 4000, allocated: {} }));
  }
  return JSON.parse(readFileSync(PORTS_FILE, 'utf8'));
}

function savePorts(ports) {
  writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
}

function allocatePort(appId) {
  const ports = loadPorts();
  if (ports.allocated[appId]) return ports.allocated[appId];
  
  const port = ports.nextPort;
  ports.allocated[appId] = port;
  ports.nextPort = port + 1;
  savePorts(ports);
  return port;
}

function releasePort(appId) {
  const ports = loadPorts();
  if (ports.allocated[appId]) {
    delete ports.allocated[appId];
    savePorts(ports);
  }
}

// Auto-generate domain from app name
function generateDomain(appName) {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (BASE_DOMAIN) {
    return `${slug}.${BASE_DOMAIN}`;
  }
  return `${slug}.localhost`;
}

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
  if (!secret) return true; // Skip verification if no secret configured
  if (!signature) return false;
  
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
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
  
  console.log(`[${timestamp}] Starting deployment: ${app.name}`);
  
  const deployScript = join(DEPLOY_DIR, 'deploy.sh');
  
  const child = spawn('sh', [
    deployScript,
    app.id,
    app.repo,
    app.branch || 'main',
    app.buildCommand || 'npm install && npm run build',
    app.startCommand || 'npm start',
    String(app.port),
    app.domain || ''
  ], {
    cwd: DEPLOY_DIR,
    env: { 
      ...process.env, 
      ...app.envVars,
      APP_ID: app.id,
      APP_NAME: app.name,
      DEPLOY_DIR: DEPLOY_DIR,
      APPS_DIR: APPS_DIR
    }
  });
  
  let output = '';
  
  child.stdout.on('data', (data) => {
    output += data.toString();
    console.log(data.toString().trim());
  });
  
  child.stderr.on('data', (data) => {
    output += data.toString();
    console.error(data.toString().trim());
  });
  
  child.on('close', (code) => {
    const finalConfig = loadConfig();
    const idx = finalConfig.apps.findIndex(a => a.id === app.id);
    
    if (idx >= 0) {
      finalConfig.apps[idx].status = code === 0 ? 'running' : 'error';
      finalConfig.apps[idx].lastDeployed = new Date().toISOString();
      saveConfig(finalConfig);
    }
    
    // Write logs
    try {
      writeFileSync(logFile, output);
    } catch (e) {
      console.error('Failed to write log file:', e);
    }
    
    if (callback) callback(code === 0, output);
  });
}

// Stop an application
function stopApp(appId) {
  return new Promise((resolve) => {
    exec(`pm2 stop ${appId} 2>/dev/null || true`, (error) => {
      const config = loadConfig();
      const idx = config.apps.findIndex(a => a.id === appId);
      if (idx >= 0) {
        config.apps[idx].status = 'stopped';
        saveConfig(config);
      }
      resolve(!error);
    });
  });
}

// Start an application
function startApp(appId) {
  return new Promise((resolve) => {
    exec(`pm2 start ${appId} 2>/dev/null || pm2 restart ${appId}`, (error) => {
      const config = loadConfig();
      const idx = config.apps.findIndex(a => a.id === appId);
      if (idx >= 0) {
        config.apps[idx].status = error ? 'error' : 'running';
        saveConfig(config);
      }
      resolve(!error);
    });
  });
}

// Delete an application completely
function deleteApp(appId) {
  return new Promise((resolve) => {
    // Stop and delete from PM2
    exec(`pm2 delete ${appId} 2>/dev/null || true`, () => {
      // Remove app directory
      const appDir = join(APPS_DIR, appId);
      if (existsSync(appDir)) {
        try {
          rmSync(appDir, { recursive: true, force: true });
        } catch (e) {
          console.error(`Failed to remove app directory: ${e}`);
        }
      }
      
      // Remove log files
      const logPatterns = [`${appId}-build.log`, `${appId}-error.log`, `${appId}-out.log`];
      logPatterns.forEach(pattern => {
        const logFile = join(LOGS_DIR, pattern);
        if (existsSync(logFile)) {
          try { unlinkSync(logFile); } catch {}
        }
      });
      
      // Release port
      releasePort(appId);
      
      // Remove from config
      const config = loadConfig();
      config.apps = config.apps.filter(a => a.id !== appId);
      saveConfig(config);
      
      // Update Caddy config
      updateCaddyConfig();
      
      console.log(`App ${appId} deleted successfully`);
      resolve(true);
    });
  });
}

// Update Caddy reverse proxy config
function updateCaddyConfig() {
  const config = loadConfig();
  const caddyDir = join(DEPLOY_DIR, 'caddy');
  const caddyAppsFile = join(caddyDir, 'apps.conf');
  
  if (!existsSync(caddyDir)) {
    mkdirSync(caddyDir, { recursive: true });
  }
  
  let appsConfig = '# Auto-generated app configurations\n\n';
  
  config.apps.forEach(app => {
    if (app.domain && app.port) {
      appsConfig += `# ${app.name}\n`;
      appsConfig += `${app.domain} {\n`;
      appsConfig += `    reverse_proxy localhost:${app.port}\n`;
      appsConfig += `    encode gzip\n`;
      appsConfig += `}\n\n`;
    }
  });
  
  writeFileSync(caddyAppsFile, appsConfig);
  
  // Reload Caddy
  exec(`caddy reload --config ${join(caddyDir, 'Caddyfile')} 2>/dev/null || true`);
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

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
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
  req.on('end', async () => {
    
    // GitHub Webhook
    if (path === '/webhook' && req.method === 'POST') {
      const signature = req.headers['x-hub-signature-256'];
      
      if (!verifySignature(body, signature)) {
        return sendJSON(res, 401, { error: 'Invalid signature' });
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
          return sendJSON(res, 200, { message: 'Deployment started', app: app.name });
        } else {
          return sendJSON(res, 200, { message: 'No matching app found' });
        }
      } catch (e) {
        return sendJSON(res, 400, { error: 'Invalid payload' });
      }
    }
    
    // API: List apps
    if (path === '/api/apps' && req.method === 'GET') {
      const config = loadConfig();
      return sendJSON(res, 200, config.apps);
    }
    
    // API: Deploy new app
    if (path === '/api/apps' && req.method === 'POST') {
      try {
        const data = JSON.parse(body);
        
        if (!data.name || !data.repo) {
          return sendJSON(res, 400, { error: 'Name and repo are required' });
        }
        
        const appId = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        
        // Check if app already exists
        const config = loadConfig();
        if (config.apps.find(a => a.id === appId)) {
          return sendJSON(res, 400, { error: 'App with this name already exists' });
        }
        
        // Auto-allocate port if not provided or 0
        const port = data.port && data.port > 0 ? data.port : allocatePort(appId);
        
        // Auto-generate domain if not provided
        const domain = data.domain && data.domain.trim() ? data.domain.trim() : generateDomain(data.name);
        
        const app = {
          id: appId,
          name: data.name,
          repo: data.repo,
          branch: data.branch || 'main',
          status: 'building',
          port,
          domain,
          buildCommand: data.buildCommand || 'npm install && npm run build',
          startCommand: data.startCommand || 'npm start',
          envVars: data.envVars || {},
          lastDeployed: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        
        config.apps.push(app);
        saveConfig(config);
        
        // Update Caddy config
        updateCaddyConfig();
        
        // Start deployment
        deployApp(app, (success) => {
          console.log(`Deployment ${success ? 'succeeded' : 'failed'}: ${app.name}`);
        });
        
        return sendJSON(res, 202, { message: 'Deployment started', app });
      } catch (e) {
        console.error('Deploy error:', e);
        return sendJSON(res, 400, { error: 'Invalid request body' });
      }
    }
    
    // API: App actions
    const appMatch = path.match(/^\/api\/apps\/([^/]+)(?:\/(start|stop|redeploy|logs))?$/);
    if (appMatch) {
      const appId = appMatch[1];
      const action = appMatch[2];
      
      // DELETE app
      if (req.method === 'DELETE' && !action) {
        const config = loadConfig();
        const app = config.apps.find(a => a.id === appId);
        if (!app) {
          return sendJSON(res, 404, { error: 'App not found' });
        }
        
        await deleteApp(appId);
        return sendJSON(res, 200, { message: 'App deleted successfully' });
      }
      
      // GET single app
      if (req.method === 'GET' && !action) {
        const config = loadConfig();
        const app = config.apps.find(a => a.id === appId);
        if (!app) {
          return sendJSON(res, 404, { error: 'App not found' });
        }
        return sendJSON(res, 200, app);
      }
      
      // START app
      if (action === 'start' && req.method === 'POST') {
        const success = await startApp(appId);
        const config = loadConfig();
        const app = config.apps.find(a => a.id === appId);
        return sendJSON(res, success ? 200 : 500, app || { error: 'Failed to start' });
      }
      
      // STOP app
      if (action === 'stop' && req.method === 'POST') {
        const success = await stopApp(appId);
        const config = loadConfig();
        const app = config.apps.find(a => a.id === appId);
        return sendJSON(res, success ? 200 : 500, app || { error: 'Failed to stop' });
      }
      
      // REDEPLOY app
      if (action === 'redeploy' && req.method === 'POST') {
        const config = loadConfig();
        const app = config.apps.find(a => a.id === appId);
        if (app) {
          deployApp(app);
          return sendJSON(res, 202, { message: 'Redeployment started', app });
        } else {
          return sendJSON(res, 404, { error: 'App not found' });
        }
      }
      
      // GET logs
      if (action === 'logs' && req.method === 'GET') {
        const logs = getLogs(appId);
        res.writeHead(200, { 
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(logs);
        return;
      }
    }
    
    // Webhook info
    if (path === '/api/webhook-info' && req.method === 'GET') {
      const host = req.headers.host || `localhost:${PORT}`;
      return sendJSON(res, 200, {
        webhookUrl: `http://${host}/webhook`,
        secretConfigured: !!getWebhookSecret()
      });
    }
    
    // Health check
    if (path === '/health') {
      return sendJSON(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    }
    
    // 404
    sendJSON(res, 404, { error: 'Not found' });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PhoneDeploy Webhook Server running on port ${PORT}`);
  console.log(`Webhook URL: http://YOUR_IP:${PORT}/webhook`);
  console.log(`API URL: http://YOUR_IP:${PORT}/api/apps`);
});
