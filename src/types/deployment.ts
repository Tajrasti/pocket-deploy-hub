export interface App {
  id: string;
  name: string;
  repo: string;
  branch: string;
  status: "running" | "building" | "stopped" | "error";
  domain: string;
  port: number;
  lastDeployed: Date;
  buildCommand: string;
  startCommand: string;
  envVars: Record<string, string>;
}

export interface BuildLog {
  id: string;
  appId: string;
  timestamp: Date;
  message: string;
  type: "info" | "error" | "success" | "warning";
}

export interface SystemStats {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  uptime: number;
  activeApps: number;
}
