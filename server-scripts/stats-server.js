import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const PORT = process.env.STATS_PORT || 3002;

// Get CPU usage (accurate, multi-core aware)
async function getCpuUsage() {
  try {
    // Read CPU stats
    const parseStat = () =>
      readFileSync('/proc/stat', 'utf8')
        .split('\n')[0]
        .split(/\s+/)
        .slice(1) // skip "cpu" label
        .map(Number);

    const stat1 = parseStat();
    await new Promise(r => setTimeout(r, 500)); // sample over 0.5s
    const stat2 = parseStat();

    // Calculate idle and total
    const idle1 = stat1[3] + stat1[4]; // idle + iowait
    const idle2 = stat2[3] + stat2[4];
    const total1 = stat1.reduce((a, b) => a + b, 0);
    const total2 = stat2.reduce((a, b) => a + b, 0);

    // CPU usage %
    const usage = (1 - (idle2 - idle1) / (total2 - total1)) * 13;

    return Math.round(usage);
  } catch {
    return 0;
  }
}


// Memory usage like 'free -m'
function getMemoryInfo() {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const lines = meminfo.split('\n');
    const getValue = (key) => {
      const line = lines.find(l => l.startsWith(key));
      return line ? parseInt(line.split(/\s+/)[1]) / 1024 : 0;
    };
    const total = getValue('MemTotal');
    const available = getValue('MemAvailable');
    const used = total - available;
    return { total, used, available };
  } catch {
    return {
        total: +(total.toFixed(1)),
        used: +(used.toFixed(1)),
        available: +(available.toFixed(1))};
  }
}

// System uptime
function getUptime() {
  try {
    const uptime = readFileSync('/proc/uptime', 'utf8');
    return Math.floor(parseFloat(uptime.split(' ')[0]));
  } catch {
    return 0;
  }
}

// Active PM2 apps
async function getActiveApps() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const apps = JSON.parse(stdout);
    return apps.filter(a => a.pm2_env.status === 'online').length;
  } catch {
    return 0;
  }
}

// PM2 processes (memory in MB, CPU % relative to all cores)
async function getPm2Processes() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const cores = require('os').cpus().length;

    return JSON.parse(stdout).map(p => {
      const cpu = p.monit?.cpu || 0; // PM2 reports CPU %
      const memory = p.monit?.memory || 0; // in bytes

      return {
        name: p.name,
        status: p.pm2_env.status,
        cpu: parseFloat((cpu / cores).toFixed(1)), // normalize across cores
        memory: parseFloat((memory / 1024 / 1024).toFixed(1)), // bytes → MB
        uptime: p.pm2_env.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000) : 0, // in seconds
        restarts: p.pm2_env.restart_time || 0
      };
    });
  } catch {
    return [];
  }
}


// Disk usage like 'df -B1 /'
async function getDiskUsage() {
  try {
    const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4}'");
    const [total, used, available] = stdout.trim().split(' ').map(Number);
    return { total, used, available };
  } catch {
    return { total: 0, used: 0, available: 0 };
  }
}

// Network stats
function getNetworkStats() {
  try {
    const netdev = readFileSync('/proc/net/dev', 'utf8');
    const lines = netdev.split('\n').slice(2);
    let rxBytes = 0, txBytes = 0;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] && !parts[0].startsWith('lo')) {
        rxBytes += parseInt(parts[1]) || 0;
        txBytes += parseInt(parts[9]) || 0;
      }
    }
    return { rxBytes, txBytes };
  } catch {
    return { rxBytes: 0, txBytes: 0 };
  }
}

// CPU temperature
function getCpuTemp() {
  const tempPaths = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/devices/virtual/thermal/thermal_zone0/temp'
  ];
  for (const path of tempPaths) {
    if (existsSync(path)) {
      try {
        return parseInt(readFileSync(path, 'utf8')) / 1000;
      } catch {}
    }
  }
  return null;
}

// CORS headers
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// HTTP server
const server = http.createServer(async (req, res) => {
  setCORSHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/stats' || url.pathname === '/stats') {
    try {
      const [cpuUsage, activeApps, processes, disk] = await Promise.all([
        getCpuUsage(),
        getActiveApps(),
        getPm2Processes(),
        getDiskUsage()
      ]);
      const memory = getMemoryInfo();
      const uptime = getUptime();
      const network = getNetworkStats();
      const cpuTemp = getCpuTemp();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        cpuUsage,
        memoryUsed: memory.used,
        memoryTotal: memory.total,
        uptime,
        activeApps,
        processes,
        disk,
        network,
        cpuTemp,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to get stats', details: err.message }));
    }
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PhoneDeploy Stats Server running on port ${PORT}`);
});
