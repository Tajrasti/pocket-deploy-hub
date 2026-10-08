/**
 * PhoneDeploy server — one process that does everything:
 *   - REST API for the dashboard (apps, logs, settings, network, stats)
 *   - GitHub webhook receiver (POST /webhook)
 *   - Builds & runs apps with PM2, writes the Caddy reverse-proxy config
 *   - Serves the built dashboard (../dist) on the same port
 *
 * No dependencies beyond Node >= 18, git, pm2 (and optionally caddy).
 */
import http from 'node:http';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DATA = process.env.DATA_DIR || HERE;
const DIRS = {
  config: path.join(DATA, 'config'),
  logs: path.join(DATA, 'logs'),
  apps: path.join(DATA, 'apps'),
  caddy: path.join(DATA, 'caddy'),
};
const DASHBOARD = process.env.DASHBOARD_DIR || path.join(HERE, '..', 'dist');
const APPS_FILE = path.join(DIRS.config, 'apps.json');
const SETTINGS_FILE = path.join(DIRS.config, 'settings.json');
const CADDYFILE = path.join(DIRS.caddy, 'Caddyfile');
const OWN_PROCESSES = new Set(['phonedeploy', 'phonedeploy-caddy']);

Object.values(DIRS).forEach((d) => fs.mkdirSync(d, { recursive: true }));

// ---------- small helpers ----------
const readJSON = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJSON = (file, data) => {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic, never leaves a half-written file
};
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 20 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr) }));
  });
const pm2 = (...args) => run('pm2', args);

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  baseDomain: '',
  webhookSecret: '',
  startPort: 4000,
  enableHttps: false,
  autoStartApps: true,
  logRetentionDays: 7,
};
function getSettings() {
  const s = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_FILE, {}) };
  if (!s.webhookSecret) {
    s.webhookSecret = randomBytes(32).toString('hex');
    writeJSON(SETTINGS_FILE, s);
  }
  return s;
}
function saveSettings(updates) {
  const s = { ...getSettings() };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (updates[k] !== undefined) s[k] = updates[k];
  s.startPort = Number(s.startPort) || 4000;
  s.logRetentionDays = Number(s.logRetentionDays) || 7;
  writeJSON(SETTINGS_FILE, s);
  writeCaddyfile();
  return s;
}

// ---------- apps store ----------
// apps.json holds configuration only; live status comes from PM2.
const loadApps = () => {
  const data = readJSON(APPS_FILE, { apps: [] });
  return Array.isArray(data) ? data : data.apps || [];
};
const saveApps = (apps) => writeJSON(APPS_FILE, { apps });
const findApp = (id) => loadApps().find((a) => a.id === id);
function patchApp(id, patch) {
  const apps = loadApps();
  const i = apps.findIndex((a) => a.id === id);
  if (i < 0) return null;
  apps[i] = { ...apps[i], ...patch };
  saveApps(apps);
  return apps[i];
}

function freePort(apps, ignoreId) {
  const used = new Set(apps.filter((a) => a.id !== ignoreId).map((a) => Number(a.port)));
  used.add(PORT);
  let p = getSettings().startPort;
  while (used.has(p)) p++;
  return p;
}
function defaultDomain(id) {
  const base = getSettings().baseDomain.trim();
  return base ? `${id}.${base}` : `${id}.localhost`;
}

// ---------- PM2 status ----------
const builds = new Map(); // appId -> child process
async function pm2List() {
  const r = await pm2('jlist');
  try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('['))); } catch { return []; }
}
async function appsWithStatus() {
  const procs = new Map((await pm2List()).map((p) => [p.name, p.pm2_env?.status]));
  return loadApps().map((a) => {
    let status = 'stopped';
    if (builds.has(a.id)) status = 'building';
    else if (a.lastError) status = 'error';
    else if (procs.get(a.id) === 'online') status = 'running';
    else if (procs.get(a.id) === 'errored') status = 'error';
    return { ...a, status };
  });
}

// ---------- logs ----------
const logPath = (id) => path.join(DIRS.logs, `${id}-build.log`);
function readLogs(id) {
  let out = '';
  try { out = fs.readFileSync(logPath(id), 'utf8'); } catch {}
  return out;
}
function pruneLogs() {
  const maxAge = getSettings().logRetentionDays * 86400000;
  for (const f of fs.readdirSync(DIRS.logs)) {
    const p = path.join(DIRS.logs, f);
    try { if (Date.now() - fs.statSync(p).mtimeMs > maxAge) fs.unlinkSync(p); } catch {}
  }
}

// ---------- deploy ----------
function detectStatic(dir, startCommand) {
  const cmd = (startCommand || '').trim();
  const pkg = readJSON(path.join(dir, 'package.json'), {});
  const hasStart = !!pkg.scripts?.start;
  const outDir = ['dist', 'build', 'out', 'public'].find((d) => fs.existsSync(path.join(dir, d, 'index.html')));
  // Static when there is no real start command, or "npm start" is used but no start script exists.
  if (!outDir) return null;
  if (!cmd || cmd === 'static') return outDir;
  if (/^(npm|yarn|pnpm|bun)( run)? start$/.test(cmd) && !hasStart) return outDir;
  return null;
}

function deploy(app) {
  if (builds.has(app.id)) return false;
  const dir = path.join(DIRS.apps, app.id);
  const log = fs.createWriteStream(logPath(app.id), { flags: 'w' });
  const write = (msg) => log.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
  patchApp(app.id, { lastError: null });

  const env = { ...process.env, ...(app.envVars || {}), PORT: String(app.port), NODE_ENV: 'production' };
  const steps = [];
  if (fs.existsSync(path.join(dir, '.git'))) {
    steps.push(['Updating repository', `git fetch --depth 1 origin "${app.branch}" && git reset --hard FETCH_HEAD && git clean -fd`, dir]);
  } else {
    fs.rmSync(dir, { recursive: true, force: true });
    steps.push(['Cloning repository', `git clone --depth 1 -b "${app.branch}" "${app.repo}" "${dir}"`, DIRS.apps]);
  }
  if (app.buildCommand?.trim()) steps.push(['Building', app.buildCommand, dir]);

  write(`Deploying ${app.name} (${app.repo}@${app.branch}) on port ${app.port}`);
  let cancelled = false;
  const state = { cancel: () => { cancelled = true; } };
  builds.set(app.id, state);

  const runStep = (i) => {
    if (cancelled) return finish('Build cancelled by user', true);
    if (i >= steps.length) return start();
    const [label, cmd, cwd] = steps[i];
    write(`[${i + 1}/${steps.length + 1}] ${label}: ${cmd}`);
    // detached => own process group, so cancel kills npm and all its children
    const child = spawn('sh', ['-c', cmd], { cwd, env, detached: true });
    state.cancel = () => {
      cancelled = true;
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000).unref();
    };
    child.stdout.on('data', (d) => log.write(d));
    child.stderr.on('data', (d) => log.write(d));
    child.on('error', (e) => write(`ERROR: ${e.message}`));
    child.on('close', (code) => {
      if (cancelled) return finish('Build cancelled by user', true);
      if (code !== 0) return finish(`ERROR: "${label}" failed with exit code ${code}`);
      runStep(i + 1);
    });
  };

  const start = async () => {
    const step = `[${steps.length + 1}/${steps.length + 1}]`;
    await pm2('delete', app.id);
    const staticDir = detectStatic(dir, app.startCommand);
    let r;
    if (staticDir) {
      write(`${step} Serving static site from ${staticDir}/`);
      r = await pm2('serve', path.join(dir, staticDir), String(app.port), '--spa', '--name', app.id);
    } else {
      write(`${step} Starting: ${app.startCommand}`);
      r = await run('pm2', ['start', 'sh', '--name', app.id, '--cwd', dir, '--time', '--', '-c', app.startCommand], { env });
    }
    log.write(r.stdout + r.stderr);
    if (!r.ok) return finish('ERROR: PM2 failed to start the app');
    await pm2('save');
    finish(`✓ Deployment complete — http://${app.domain} (port ${app.port})`);
  };

  const finish = (msg, wasCancelled = false) => {
    write(msg);
    log.end();
    builds.delete(app.id);
    const isError = msg.startsWith('ERROR');
    patchApp(app.id, { lastDeployed: new Date().toISOString(), lastError: isError ? msg : null });
    if (wasCancelled) pm2('save');
  };

  runStep(0);
  return true;
}

function cancelBuild(id) {
  const b = builds.get(id);
  if (!b) return false;
  b.cancel();
  return true;
}

async function deleteApp(id) {
  cancelBuild(id);
  await pm2('delete', id);
  await pm2('save');
  fs.rmSync(path.join(DIRS.apps, id), { recursive: true, force: true });
  try { fs.unlinkSync(logPath(id)); } catch {}
  saveApps(loadApps().filter((a) => a.id !== id));
  writeCaddyfile();
}

// ---------- Caddy ----------
function writeCaddyfile() {
  const { enableHttps } = getSettings();
  const scheme = enableHttps ? '' : 'http://';
  let out = '# Auto-generated by PhoneDeploy — edits will be overwritten\n';
  if (!enableHttps) out += '{\n\tauto_https off\n}\n';
  out += `\n:80 {\n\treverse_proxy localhost:${PORT}\n}\n`;
  for (const a of loadApps()) {
    if (a.domain && a.port) out += `\n${scheme}${a.domain} {\n\tencode gzip\n\treverse_proxy localhost:${a.port}\n}\n`;
  }
  fs.writeFileSync(CADDYFILE, out);
  run('caddy', ['reload', '--config', CADDYFILE, '--adapter', 'caddyfile']);
}

// ---------- webhook ----------
function validSignature(body, sig) {
  if (!sig) return false;
  const digest = 'sha256=' + createHmac('sha256', getSettings().webhookSecret).update(body).digest('hex');
  const a = Buffer.from(digest), b = Buffer.from(String(sig));
  return a.length === b.length && timingSafeEqual(a, b);
}
const normRepo = (u) => String(u || '').toLowerCase().replace(/\.git$/, '').replace(/\/$/, '').replace(/^git@github\.com:/, 'https://github.com/');

// ---------- stats ----------
const cpuSample = () => {
  const t = os.cpus().reduce((acc, c) => {
    const tot = Object.values(c.times).reduce((x, y) => x + y, 0);
    return { idle: acc.idle + c.times.idle, total: acc.total + tot };
  }, { idle: 0, total: 0 });
  return t;
};
let lastCpu = cpuSample();
let cpuUsage = 0;
setInterval(() => {
  const now = cpuSample();
  const dt = now.total - lastCpu.total;
  cpuUsage = dt > 0 ? Math.round(100 * (1 - (now.idle - lastCpu.idle) / dt)) : 0;
  lastCpu = now;
}, 2000).unref();

async function getStats() {
  const mem = readJSON('/dev/null', null) ?? null; // placeholder to keep shape simple
  void mem;
  let total = os.totalmem(), avail = os.freemem();
  try {
    const m = fs.readFileSync('/proc/meminfo', 'utf8');
    const kb = (k) => Number(m.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1] || 0) * 1024;
    total = kb('MemTotal') || total;
    avail = kb('MemAvailable') || avail;
  } catch {}
  const procs = await pm2List();
  const activeApps = procs.filter((p) => !OWN_PROCESSES.has(p.name) && p.pm2_env?.status === 'online').length;
  const mb = (b) => +(b / 1048576).toFixed(1);
  return {
    cpuUsage,
    memoryUsed: mb(total - avail),
    memoryTotal: mb(total),
    uptime: Math.floor(os.uptime()),
    activeApps,
    cores: os.cpus().length,
    processes: procs.map((p) => ({
      name: p.name,
      status: p.pm2_env?.status,
      cpu: p.monit?.cpu || 0,
      memory: mb(p.monit?.memory || 0),
      restarts: p.pm2_env?.restart_time || 0,
    })),
  };
}

// ---------- network ----------
async function getInterfaces() {
  const ssid = (await run('sh', ['-c', 'iwgetid -r 2>/dev/null || nmcli -t -f active,ssid dev wifi 2>/dev/null | grep "^yes" | cut -d: -f2'])).stdout.trim();
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => name !== 'lo')
    .map(([name, infos]) => {
      const v4 = infos?.find((i) => i.family === 'IPv4');
      const type = /^(wl|wlan)/.test(name) ? 'wifi' : /^(eth|en|usb)/.test(name) ? 'ethernet' : 'other';
      return { name, type, status: v4 ? 'connected' : 'disconnected', ip: v4?.address, mac: infos?.[0]?.mac,
        ssid: type === 'wifi' && v4 ? ssid || undefined : undefined };
    });
}
async function scanWifi() {
  await run('nmcli', ['dev', 'wifi', 'rescan']);
  const r = await run('nmcli', ['-t', '-f', 'SSID,SIGNAL,SECURITY,ACTIVE', 'dev', 'wifi', 'list']);
  if (!r.ok) throw new Error('WiFi scan needs NetworkManager (nmcli)');
  const seen = new Map();
  for (const line of r.stdout.split('\n')) {
    const [ssid, signal, security, active] = line.split(/(?<!\\):/);
    if (!ssid) continue;
    const n = { ssid: ssid.replace(/\\:/g, ':'), signal: Number(signal) || 0, security: security || 'Open', connected: active === 'yes' };
    if (!seen.has(n.ssid) || seen.get(n.ssid).signal < n.signal) seen.set(n.ssid, n);
  }
  return [...seen.values()].sort((a, b) => b.signal - a.signal);
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain', '.woff2': 'font/woff2' };

function serveDashboard(req, res, pathname) {
  if (!fs.existsSync(DASHBOARD)) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('PhoneDeploy API is running. Build the dashboard (npm run build) to serve it here.');
  }
  let file = path.join(DASHBOARD, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DASHBOARD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DASHBOARD, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

const routes = {
  'GET /health': () => [200, { status: 'ok' }],
  'GET /api/stats': async () => [200, await getStats()],
  'GET /stats': async () => [200, await getStats()],
  'GET /api/apps': async () => [200, await appsWithStatus()],

  'POST /api/apps': async (_, body) => {
    if (!body.name?.trim() || !body.repo?.trim()) return [400, { error: 'Name and repository are required' }];
    const id = slugify(body.name);
    if (!id) return [400, { error: 'Invalid app name' }];
    const apps = loadApps();
    if (apps.some((a) => a.id === id)) return [400, { error: 'An app with this name already exists' }];
    const port = Number(body.port) > 0 ? Number(body.port) : freePort(apps);
    if (apps.some((a) => Number(a.port) === port) || port === PORT) return [400, { error: `Port ${port} is already in use` }];
    const app = {
      id, name: body.name.trim(), repo: body.repo.trim(), branch: body.branch?.trim() || 'main',
      port, domain: body.domain?.trim() || defaultDomain(id),
      buildCommand: body.buildCommand ?? 'npm install && npm run build',
      startCommand: body.startCommand ?? 'npm start',
      envVars: body.envVars || {}, createdAt: new Date().toISOString(), lastDeployed: new Date().toISOString(),
    };
    saveApps([...apps, app]);
    writeCaddyfile();
    deploy(app);
    return [202, { message: 'Deployment started', app: { ...app, status: 'building' } }];
  },

  'GET /api/settings': () => [200, getSettings()],
  'PUT /api/settings': (_, body) => [200, { message: 'Settings saved', settings: saveSettings(body) }],
  'POST /api/settings/generate-secret': () => {
    const secret = randomBytes(32).toString('hex');
    saveSettings({ webhookSecret: secret });
    return [200, { secret }];
  },
  'GET /api/webhook-info': (req) => [200, { webhookUrl: `http://${req.headers.host}/webhook`, secretConfigured: true }],

  'GET /api/network/interfaces': async () => [200, await getInterfaces()],
  'POST /api/network/wifi/scan': async () => [200, await scanWifi()],
  'POST /api/network/wifi/connect': async (_, { ssid, password }) => {
    if (!ssid) return [400, { error: 'SSID is required' }];
    const args = ['dev', 'wifi', 'connect', String(ssid)];
    if (password) args.push('password', String(password));
    const r = await run('nmcli', args);
    return r.ok ? [200, { message: `Connected to ${ssid}` }] : [500, { error: (r.stderr || 'Failed to connect').trim() }];
  },
  'POST /api/network/wifi/disconnect': async () => {
    const iface = (await getInterfaces()).find((i) => i.type === 'wifi');
    if (iface) await run('nmcli', ['dev', 'disconnect', iface.name]);
    return [200, { message: 'Disconnected' }];
  },

  'POST /webhook': (req, body, raw) => {
    if (!validSignature(raw, req.headers['x-hub-signature-256'])) return [401, { error: 'Invalid signature' }];
    if (req.headers['x-github-event'] === 'ping') return [200, { message: 'pong' }];
    const repo = normRepo(body.repository?.html_url);
    const branch = String(body.ref || '').replace('refs/heads/', '');
    const matches = loadApps().filter((a) => normRepo(a.repo) === repo && a.branch === branch);
    matches.forEach(deploy);
    return [200, { message: matches.length ? 'Deployment started' : 'No matching app', apps: matches.map((a) => a.id) }];
  },
};

async function appRoute(req, id, action, body) {
  const app = findApp(id);
  if (!app) return [404, { error: 'App not found' }];
  const key = `${req.method} ${action || ''}`;
  switch (key) {
    case 'GET ': return [200, (await appsWithStatus()).find((a) => a.id === id)];
    case 'GET logs': return [200, readLogs(id), 'text'];
    case 'DELETE ': await deleteApp(id); return [200, { message: 'App deleted' }];
    case 'PUT ': {
      const patch = {};
      for (const f of ['name', 'branch', 'buildCommand', 'startCommand', 'domain', 'envVars', 'repo']) if (body[f] !== undefined) patch[f] = body[f];
      if (body.port !== undefined) {
        const port = Number(body.port);
        if (!(port > 0 && port < 65536)) return [400, { error: 'Invalid port' }];
        if (port === PORT || loadApps().some((a) => a.id !== id && Number(a.port) === port)) return [400, { error: `Port ${port} is already in use` }];
        patch.port = port;
      }
      const updated = patchApp(id, patch);
      writeCaddyfile();
      return [200, { message: 'App updated — redeploy to apply build/port changes', app: updated }];
    }
    case 'POST start': {
      if (builds.has(id)) return [400, { error: 'App is building' }];
      const exists = (await pm2List()).some((p) => p.name === id);
      if (!exists) { deploy(app); return [202, { message: 'Deploying' }]; }
      const r = await pm2('restart', id);
      patchApp(id, { lastError: null });
      await pm2('save');
      return r.ok ? [200, { message: 'Started' }] : [500, { error: 'Failed to start' }];
    }
    case 'POST stop': {
      const r = await pm2('stop', id);
      await pm2('save');
      return r.ok ? [200, { message: 'Stopped' }] : [500, { error: 'Failed to stop' }];
    }
    case 'POST redeploy':
      return deploy(app) ? [202, { message: 'Redeployment started' }] : [400, { error: 'A build is already running' }];
    case 'POST cancel':
      return cancelBuild(id) ? [200, { message: 'Build cancelled' }] : [400, { error: 'No active build to cancel' }];
    default: return [404, { error: 'Not found' }];
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    const { pathname } = new URL(req.url, 'http://x');
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'Invalid JSON body' }); } }
    try {
      let result;
      const m = pathname.match(/^\/api\/apps\/([a-z0-9-]+)(?:\/(start|stop|redeploy|logs|cancel))?$/);
      if (m) result = await appRoute(req, m[1], m[2], body);
      else if (routes[`${req.method} ${pathname}`]) result = await routes[`${req.method} ${pathname}`](req, body, raw);
      else if (req.method === 'GET' && !pathname.startsWith('/api/')) return serveDashboard(req, res, pathname);
      else result = [404, { error: 'Not found' }];
      const [status, data, type] = result;
      if (type === 'text') { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(data); }
      json(res, status, data);
    } catch (e) {
      console.error(e);
      json(res, 500, { error: e.message || 'Internal error' });
    }
  });
});

// ---------- boot ----------
getSettings();
writeCaddyfile();
pruneLogs();
setInterval(pruneLogs, 6 * 3600000).unref();

// PM2 "resurrect" restores running apps after reboot. If disabled, stop them.
if (!getSettings().autoStartApps) {
  for (const a of loadApps()) pm2('stop', a.id);
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i?.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`PhoneDeploy running on port ${PORT}`);
  ips.forEach((ip) => console.log(`  Dashboard: http://${ip}:${PORT}   Webhook: http://${ip}:${PORT}/webhook`));
});
