/**
 * PhoneDeploy - Webhook & API Server
 * Handles GitHub webhooks and deployment management
 */

import http from 'http';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { spawn, exec, execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';
import { networkInterfaces } from 'os';

const PORT = process.env.WEBHOOK_PORT || 3001;
const DEPLOY_DIR = process.env.DEPLOY_DIR || `/home/${process.env.USER || 'user'}/phonedeploy`;
const CONFIG_FILE = join(DEPLOY_DIR, 'config', 'apps.json');
const PORTS_FILE = join(DEPLOY_DIR, 'config', 'ports.json');
const SECRET_FILE = join(DEPLOY_DIR, 'config', 'webhook-secret.txt');
const SETTINGS_FILE = join(DEPLOY_DIR, 'config', 'settings.json');
const LOGS_DIR = join(DEPLOY_DIR, 'logs');
const APPS_DIR = join(DEPLOY_DIR, 'apps');

// Track active build processes
const activeBuilds = new Map();

// Ensure directories exist
[join(DEPLOY_DIR, 'config'), LOGS_DIR, APPS_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Settings management
function loadSettings() {
  try {
    if (!existsSync(SETTINGS_FILE)) {
      const defaultSettings = {
        baseDomain: '',
        webhookSecret: getWebhookSecret() || '',
        startPort: 4000,
        enableHttps: false,
        autoStartApps: true,
        logRetentionDays: 7
      };
      writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load settings:', e);
    return {
      baseDomain: '',
      webhookSecret: '',
      startPort: 4000,
      enableHttps: false,
      autoStartApps: true,
      logRetentionDays: 7
    };
  }
}

function saveSettings(settings) {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    // Also update webhook secret file if changed
    if (settings.webhookSecret) {
      writeFileSync(SECRET_FILE, settings.webhookSecret);
    }
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function generateWebhookSecret() {
  return randomBytes(32).toString('hex');
}

// Network management functions
function getNetworkInterfaces() {
  const interfaces = [];
  const nets = networkInterfaces();
  
  for (const [name, netInfos] of Object.entries(nets)) {
    if (name === 'lo') continue; // Skip loopback
    
    const info = netInfos?.find(n => n.family === 'IPv4');
    const type = name.startsWith('wlan') || name.startsWith('wl') ? 'wifi' : 
                 name.startsWith('eth') || name.startsWith('en') || name.startsWith('usb') ? 'ethernet' : 'other';
    
    interfaces.push({
      name,
      type,
      status: info ? 'connected' : 'disconnected',
      ip: info?.address,
      mac: info?.mac || netInfos?.[0]?.mac,
      ssid: type === 'wifi' ? getCurrentWifiSSID() : undefined,
      signal: type === 'wifi' ? getWifiSignal() : undefined
    });
  }
  
  return interfaces;
}

function getCurrentWifiSSID() {
  try {
    const result = execSync('iwgetid -r 2>/dev/null || nmcli -t -f active,ssid dev wifi | grep "^yes" | cut -d: -f2 2>/dev/null || echo ""', { encoding: 'utf8' });
    return result.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getWifiSignal() {
  try {
    const result = execSync('iwconfig 2>/dev/null | grep -i quality | awk \'{print $2}\' | cut -d= -f2 | cut -d/ -f1', { encoding: 'utf8' });
    const quality = parseInt(result.trim());
    return isNaN(quality) ? undefined : Math.round((quality / 70) * 100);
  } catch {
    return undefined;
  }
}

function scanWifiNetworks() {
  return new Promise((resolve) => {
    // Try nmcli first (NetworkManager)
    exec('nmcli -t -f SSID,SIGNAL,SECURITY,ACTIVE dev wifi list 2>/dev/null', (error, stdout) => {
      if (!error && stdout.trim()) {
        const networks = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [ssid, signal, security, active] = line.split(':');
          return {
            ssid: ssid || 'Hidden Network',
            signal: parseInt(signal) || 0,
            security: security || 'Open',
            connected: active === 'yes'
          };
        }).filter(n => n.ssid && n.ssid !== 'Hidden Network');
        return resolve(networks);
      }
      
      // Fallback to iwlist
      exec('iwlist wlan0 scan 2>/dev/null | grep -E "ESSID|Quality|Encryption"', (err, out) => {
        if (err || !out) return resolve([]);
        
        const networks = [];
        const lines = out.split('\n');
        let current = {};
        
        for (const line of lines) {
          if (line.includes('ESSID:')) {
            if (current.ssid) networks.push(current);
            current = { ssid: line.match(/ESSID:"(.*)"/)?.[1] || '', signal: 0, security: 'Open', connected: false };
          } else if (line.includes('Quality=')) {
            const match = line.match(/Quality[=:](\d+)/);
            current.signal = match ? Math.round((parseInt(match[1]) / 70) * 100) : 0;
          } else if (line.includes('Encryption key:on')) {
            current.security = 'WPA/WPA2';
          }
        }
        if (current.ssid) networks.push(current);
        
        resolve(networks);
      });
    });
  });
}

function connectToWifi(ssid, password) {
  return new Promise((resolve, reject) => {
    // Try nmcli first
    exec(`nmcli dev wifi connect "${ssid}" password "${password}" 2>&1`, (error, stdout, stderr) => {
      if (!error) {
        return resolve({ success: true });
      }
      
      // Fallback to wpa_supplicant
      const wpaConfig = `
network={
    ssid="${ssid}"
    psk="${password}"
    key_mgmt=WPA-PSK
}
`;
      try {
        writeFileSync('/tmp/wpa_temp.conf', wpaConfig);
        exec('wpa_supplicant -B -i wlan0 -c /tmp/wpa_temp.conf && dhclient wlan0', (err) => {
          if (err) {
            reject(new Error('Failed to connect to WiFi'));
          } else {
            resolve({ success: true });
          }
        });
      } catch (e) {
        reject(new Error('Failed to configure WiFi: ' + e.message));
      }
    });
  });
}

function disconnectWifi() {
  return new Promise((resolve) => {
    exec('nmcli dev disconnect wlan0 2>/dev/null || killall wpa_supplicant 2>/dev/null', () => {
      resolve({ success: true });
    });
  });
}

// Get BASE_DOMAIN from settings
function getBaseDomain() {
  const settings = loadSettings();
  return settings.baseDomain || '';
}

// Port management
function loadPorts() {
  try {
    if (!existsSync(PORTS_FILE)) {
      writeFileSync(PORTS_FILE, JSON.stringify({ nextPort: 4000, allocated: {} }));
    }
    return JSON.parse(readFileSync(PORTS_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load ports:', e);
    return { nextPort: 4000, allocated: {} };
  }
}

function savePorts(ports) {
  try {
    writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
  } catch (e) {
    console.error('Failed to save ports:', e);
  }
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
  const baseDomain = getBaseDomain();
  if (baseDomain) {
    return `${slug}.${baseDomain}`;
  }
  return `${slug}.localhost`;
}

// Load or create config
function loadConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      writeFileSync(CONFIG_FILE, JSON.stringify({ apps: [] }));
    }
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load config:', e);
    return { apps: [] };
  }
}

function saveConfig(config) {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// Load webhook secret
function getWebhookSecret() {
  try {
    if (existsSync(SECRET_FILE)) {
      return readFileSync(SECRET_FILE, 'utf8').trim();
    }
  } catch (e) {
    console.error('Failed to read webhook secret:', e);
  }
  return null;
}

// Verify GitHub webhook signature
function verifySignature(payload, signature) {
  const secret = getWebhookSecret();
  if (!secret) return true; // Skip verification if no secret configured
  if (!signature) return false;
  
  try {
    const hmac = createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Cancel an ongoing build
function cancelBuild(appId) {
  const buildProcess = activeBuilds.get(appId);
  if (buildProcess) {
    console.log(`Cancelling build for ${appId}`);
    buildProcess.kill('SIGTERM');
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (activeBuilds.has(appId)) {
        buildProcess.kill('SIGKILL');
        activeBuilds.delete(appId);
      }
    }, 5000);
    
    // Update status
    const config = loadConfig();
    const idx = config.apps.findIndex(a => a.id === appId);
    if (idx >= 0) {
      config.apps[idx].status = 'stopped';
      saveConfig(config);
    }
    
    return true;
  }
  return false;
}

// Deploy an application
function deployApp(app, callback) {
  const logFile = join(LOGS_DIR, `${app.id}-build.log`);
  const timestamp = new Date().toISOString();
  
  // Cancel any existing build for this app
  cancelBuild(app.id);
  
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
  
  // Track the build process
  activeBuilds.set(app.id, child);
  
  let output = '';
  
  child.stdout.on('data', (data) => {
    output += data.toString();
    console.log(data.toString().trim());
  });
  
  child.stderr.on('data', (data) => {
    output += data.toString();
    console.error(data.toString().trim());
  });
  
  child.on('close', (code, signal) => {
    activeBuilds.delete(app.id);
    
    const finalConfig = loadConfig();
    const idx = finalConfig.apps.findIndex(a => a.id === app.id);
    
    if (idx >= 0) {
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        finalConfig.apps[idx].status = 'stopped';
        output += '\n[Build cancelled by user]';
      } else {
        finalConfig.apps[idx].status = code === 0 ? 'running' : 'error';
      }
      finalConfig.apps[idx].lastDeployed = new Date().toISOString();
      saveConfig(finalConfig);
    }
    
    // Write logs
    try {
      writeFileSync(logFile, output);
    } catch (e) {
      console.error('Failed to write log file:', e);
    }
    
    if (callback) callback(code === 0 && !signal, output);
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
    // Cancel any ongoing build
    cancelBuild(appId);
    
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

// Update app configuration
function updateApp(appId, updates) {
  const config = loadConfig();
  const idx = config.apps.findIndex(a => a.id === appId);
  
  if (idx < 0) return null;
  
  // Apply updates (excluding id, name, repo which shouldn't change)
  const allowedFields = ['branch', 'buildCommand', 'startCommand', 'port', 'domain', 'envVars'];
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      config.apps[idx][field] = updates[field];
    }
  });
  
  saveConfig(config);
  
  // Update Caddy if domain changed
  if (updates.domain !== undefined) {
    updateCaddyConfig();
  }
  
  return config.apps[idx];
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
  
  try {
    writeFileSync(caddyAppsFile, appsConfig);
    
    // Reload Caddy
    exec(`caddy reload --config ${join(caddyDir, 'Caddyfile')} 2>/dev/null || true`);
  } catch (e) {
    console.error('Failed to update Caddy config:', e);
  }
}

// Get build logs
function getLogs(appId) {
  const logFile = join(LOGS_DIR, `${appId}-build.log`);
  try {
    if (existsSync(logFile)) {
      return readFileSync(logFile, 'utf8');
    }
  } catch (e) {
    console.error('Failed to read logs:', e);
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
        console.error('Webhook error:', e);
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
    const appMatch = path.match(/^\/api\/apps\/([^/]+)(?:\/(start|stop|redeploy|logs|cancel))?$/);
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
      
      // UPDATE app (PUT)
      if (req.method === 'PUT' && !action) {
        try {
          const updates = JSON.parse(body);
          const updatedApp = updateApp(appId, updates);
          
          if (!updatedApp) {
            return sendJSON(res, 404, { error: 'App not found' });
          }
          
          return sendJSON(res, 200, { message: 'App updated', app: updatedApp });
        } catch (e) {
          console.error('Update error:', e);
          return sendJSON(res, 400, { error: 'Invalid request body' });
        }
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
      
      // CANCEL build
      if (action === 'cancel' && req.method === 'POST') {
        const cancelled = cancelBuild(appId);
        if (cancelled) {
          return sendJSON(res, 200, { message: 'Build cancelled' });
        } else {
          return sendJSON(res, 400, { error: 'No active build to cancel' });
        }
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
    
    // API: Get settings
    if (path === '/api/settings' && req.method === 'GET') {
      const settings = loadSettings();
      return sendJSON(res, 200, settings);
    }
    
    // API: Update settings
    if (path === '/api/settings' && req.method === 'PUT') {
      try {
        const updates = JSON.parse(body);
        const currentSettings = loadSettings();
        const newSettings = { ...currentSettings, ...updates };
        saveSettings(newSettings);
        return sendJSON(res, 200, { message: 'Settings saved', settings: newSettings });
      } catch (e) {
        return sendJSON(res, 400, { error: 'Invalid request body' });
      }
    }
    
    // API: Generate new webhook secret
    if (path === '/api/settings/generate-secret' && req.method === 'POST') {
      const secret = generateWebhookSecret();
      const settings = loadSettings();
      settings.webhookSecret = secret;
      saveSettings(settings);
      return sendJSON(res, 200, { secret });
    }
    
    // API: Get network interfaces
    if (path === '/api/network/interfaces' && req.method === 'GET') {
      const interfaces = getNetworkInterfaces();
      return sendJSON(res, 200, interfaces);
    }
    
    // API: Scan WiFi networks
    if (path === '/api/network/wifi/scan' && req.method === 'POST') {
      try {
        const networks = await scanWifiNetworks();
        return sendJSON(res, 200, networks);
      } catch (e) {
        return sendJSON(res, 500, { error: 'Failed to scan networks' });
      }
    }
    
    // API: Connect to WiFi
    if (path === '/api/network/wifi/connect' && req.method === 'POST') {
      try {
        const { ssid, password } = JSON.parse(body);
        if (!ssid || !password) {
          return sendJSON(res, 400, { error: 'SSID and password are required' });
        }
        await connectToWifi(ssid, password);
        return sendJSON(res, 200, { message: `Connected to ${ssid}` });
      } catch (e) {
        return sendJSON(res, 500, { error: e.message || 'Failed to connect' });
      }
    }
    
    // API: Disconnect from WiFi
    if (path === '/api/network/wifi/disconnect' && req.method === 'POST') {
      await disconnectWifi();
      return sendJSON(res, 200, { message: 'Disconnected' });
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
