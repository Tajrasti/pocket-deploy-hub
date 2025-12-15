/**
 * PhoneDeploy - System Stats Server
 * Provides real-time system metrics for the dashboard
 */

import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const PORT = process.env.STATS_PORT || 3002;

// Get CPU usage
async function getCpuUsage() {
  try {
    // Read /proc/stat for CPU stats
    const stat1 = readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/);
    await new Promise(r => setTimeout(r, 100));
    const stat2 = readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/);
    
    const idle1 = parseInt(stat1[4]);
    const idle2 = parseInt(stat2[4]);
    const total1 = stat1.slice(1, 8).reduce((a, b) => a + parseInt(b), 0);
    const total2 = stat2.slice(1, 8).reduce((a, b) => a + parseInt(b), 0);
    
    const idleDiff = idle2 - idle1;
    const totalDiff = total2 - total1;
    
    return Math.round((1 - idleDiff / totalDiff) * 100);
  } catch {
    return 0;
  }
}

// Get memory info
function getMemoryInfo() {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const lines = meminfo.split('\n');
    const getValue = (key) => {
      const line = lines.find(l => l.startsWith(key));
      return line ? parseInt(line.split(/\s+/)[1]) * 1024 : 0;
    };
    
    const total = getValue('MemTotal');
    const available = getValue('MemAvailable');
    const used = total - available;
    
    return { total, used, available };
  } catch {
    return { total: 0, used: 0, available: 0 };
  }
}

// Get uptime
function getUptime() {
  try {
    const uptime = readFileSync('/proc/uptime', 'utf8');
    return Math.floor(parseFloat(uptime.split(' ')[0]));
  } catch {
    return 0;
  }
}

// Get active apps count
async function getActiveApps() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const apps = JSON.parse(stdout);
    return apps.filter(a => a.pm2_env.status === 'online').length;
  } catch {
    return 0;
  }
}

// Get detailed PM2 process info
async function getPm2Processes() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    return JSON.parse(stdout).map(p => ({
      name: p.name,
      status: p.pm2_env.status,
      cpu: p.monit?.cpu || 0,
      memory: p.monit?.memory || 0,
      uptime: p.pm2_env.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
      restarts: p.pm2_env.restart_time || 0
    }));
  } catch {
    return [];
  }
}

// Get disk usage
async function getDiskUsage() {
  try {
    const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4}'");
    const [total, used, available] = stdout.trim().split(' ').map(Number);
    return { total, used, available };
  } catch {
    return { total: 0, used: 0, available: 0 };
  }
}

// Get network stats
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

// Get CPU temperature (if available)
function getCpuTemp() {
  const tempPaths = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/devices/virtual/thermal/thermal_zone0/temp'
  ];
  
  for (const path of tempPaths) {
    if (existsSync(path)) {
      try {
        const temp = parseInt(readFileSync(path, 'utf8'));
        return temp / 1000; // Convert from millidegrees
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

const server = http.createServer(async (req, res) => {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Main stats endpoint
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
      
      const stats = {
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
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to get stats' }));
    }
    return;
  }
  
  // Health check
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
