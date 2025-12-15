import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { SystemStats } from "@/components/dashboard/SystemStats";
import { AppCard } from "@/components/dashboard/AppCard";
import { TerminalLogs } from "@/components/dashboard/TerminalLogs";
import { DeployModal, DeployConfig } from "@/components/dashboard/DeployModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { App, BuildLog, SystemStats as SystemStatsType } from "@/types/deployment";

// Mock data for demonstration
const mockApps: App[] = [
  {
    id: "1",
    name: "portfolio-site",
    repo: "github.com/user/portfolio",
    branch: "main",
    status: "running",
    domain: "portfolio.local:3001",
    port: 3001,
    lastDeployed: new Date(Date.now() - 3600000),
    buildCommand: "npm run build",
    startCommand: "npm start",
    envVars: { NODE_ENV: "production" },
  },
  {
    id: "2",
    name: "api-server",
    repo: "github.com/user/api",
    branch: "develop",
    status: "running",
    domain: "api.local:3002",
    port: 3002,
    lastDeployed: new Date(Date.now() - 7200000),
    buildCommand: "npm run build",
    startCommand: "node dist/index.js",
    envVars: { NODE_ENV: "production", DATABASE_URL: "***" },
  },
  {
    id: "3",
    name: "blog-frontend",
    repo: "github.com/user/blog",
    branch: "main",
    status: "building",
    domain: "blog.local:3003",
    port: 3003,
    lastDeployed: new Date(Date.now() - 86400000),
    buildCommand: "npm run build",
    startCommand: "npm start",
    envVars: {},
  },
  {
    id: "4",
    name: "dashboard-app",
    repo: "github.com/user/dashboard",
    branch: "main",
    status: "error",
    domain: "dash.local:3004",
    port: 3004,
    lastDeployed: new Date(Date.now() - 172800000),
    buildCommand: "npm run build",
    startCommand: "npm start",
    envVars: { API_KEY: "***" },
  },
];

const mockLogs: BuildLog[] = [
  { id: "1", appId: "1", timestamp: new Date(), message: "[PM2] Starting app...", type: "info" },
  { id: "2", appId: "1", timestamp: new Date(), message: "[BUILD] Installing dependencies...", type: "info" },
  { id: "3", appId: "1", timestamp: new Date(), message: "[BUILD] Running build command...", type: "info" },
  { id: "4", appId: "1", timestamp: new Date(), message: "[BUILD] Build successful!", type: "success" },
  { id: "5", appId: "1", timestamp: new Date(), message: "[PM2] App started on port 3001", type: "success" },
  { id: "6", appId: "4", timestamp: new Date(), message: "[ERROR] Build failed: Cannot find module 'react'", type: "error" },
];

const mockStats: SystemStatsType = {
  cpuUsage: 23.5,
  memoryUsed: 136,
  memoryTotal: 7680,
  uptime: 432000,
  activeApps: 2,
};

export default function Index() {
  const [apps, setApps] = useState<App[]>(mockApps);
  const [logs] = useState<BuildLog[]>(mockLogs);
  const [stats] = useState<SystemStatsType>(mockStats);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const { toast } = useToast();

  const filteredApps = apps.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewLogs = (app: App) => {
    setSelectedApp(app);
  };

  const handleToggleApp = (app: App) => {
    setApps((prev) =>
      prev.map((a) =>
        a.id === app.id
          ? { ...a, status: a.status === "running" ? "stopped" : "running" }
          : a
      )
    );
    toast({
      title: app.status === "running" ? "App Stopped" : "App Started",
      description: `${app.name} has been ${app.status === "running" ? "stopped" : "started"}.`,
    });
  };

  const handleRedeploy = (app: App) => {
    setApps((prev) =>
      prev.map((a) => (a.id === app.id ? { ...a, status: "building" } : a))
    );
    toast({
      title: "Redeploying",
      description: `${app.name} is being redeployed...`,
    });
    // Simulate build completion
    setTimeout(() => {
      setApps((prev) =>
        prev.map((a) =>
          a.id === app.id ? { ...a, status: "running", lastDeployed: new Date() } : a
        )
      );
    }, 3000);
  };

  const handleDeploy = (config: DeployConfig) => {
    const newApp: App = {
      id: Date.now().toString(),
      name: config.name,
      repo: config.repo,
      branch: config.branch,
      status: "building",
      domain: config.domain || `${config.name}.local:${config.port}`,
      port: config.port,
      lastDeployed: new Date(),
      buildCommand: config.buildCommand,
      startCommand: config.startCommand,
      envVars: config.envVars,
    };
    setApps((prev) => [newApp, ...prev]);
    toast({
      title: "Deployment Started",
      description: `${config.name} is being deployed...`,
    });
    // Simulate build completion
    setTimeout(() => {
      setApps((prev) =>
        prev.map((a) => (a.id === newApp.id ? { ...a, status: "running" } : a))
      );
    }, 5000);
  };

  const handleRefresh = () => {
    toast({
      title: "Refreshing",
      description: "Fetching latest app status...",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onNewDeploy={() => setIsDeployModalOpen(true)} onRefresh={handleRefresh} />

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* System Stats */}
        <section>
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm uppercase tracking-wider text-muted-foreground mb-4"
          >
            System Overview
          </motion.h2>
          <SystemStats stats={stats} />
        </section>

        {/* Apps Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm uppercase tracking-wider text-muted-foreground"
            >
              Deployed Apps ({apps.length})
            </motion.h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search apps..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64 bg-muted border-border"
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApps.map((app, index) => (
              <AppCard
                key={app.id}
                app={app}
                index={index}
                onViewLogs={handleViewLogs}
                onToggleApp={handleToggleApp}
                onRedeploy={handleRedeploy}
              />
            ))}
          </div>

          {filteredApps.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 text-muted-foreground"
            >
              <p>No apps found. Deploy your first app to get started!</p>
            </motion.div>
          )}
        </section>
      </main>

      {/* Terminal Logs Panel */}
      {selectedApp && (
        <TerminalLogs
          app={selectedApp}
          logs={logs}
          onClose={() => setSelectedApp(null)}
        />
      )}

      {/* Deploy Modal */}
      <DeployModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        onDeploy={handleDeploy}
      />
    </div>
  );
}
