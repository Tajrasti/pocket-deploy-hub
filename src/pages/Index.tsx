import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Filter } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { SystemStats } from "@/components/dashboard/SystemStats";
import { AppCard } from "@/components/dashboard/AppCard";
import { TerminalLogs } from "@/components/dashboard/TerminalLogs";
import { DeployModal, DeployConfig } from "@/components/dashboard/DeployModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { App, BuildLog, SystemStats as SystemStatsType } from "@/types/deployment";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Configure your server IP/hostname here
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
const STATS_API = import.meta.env.VITE_STATS_URL || "http://localhost:3002";

export default function Index() {
  const [apps, setApps] = useState<App[]>([]);
  const [logs, setLogs] = useState<BuildLog[]>([]);
  const [stats, setStats] = useState<SystemStatsType>({
    cpuUsage: 0,
    memoryUsed: 0,
    memoryTotal: 1,
    uptime: 0,
    activeApps: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteApp, setDeleteApp] = useState<App | null>(null);

  // Fetch apps from backend
  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/apps`);
      if (res.ok) {
        const data = await res.json();
        setApps(data.map((app: any) => ({
          ...app,
          lastDeployed: new Date(app.lastDeployed),
          envVars: app.envVars || {}
        })));
      }
    } catch (error) {
      console.error("Failed to fetch apps:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch system stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${STATS_API}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats({
          cpuUsage: data.cpuUsage,
          memoryUsed: data.memoryUsed,
          memoryTotal: data.memoryTotal,
          uptime: data.uptime,
          activeApps: data.activeApps,
        });
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  // Fetch logs for an app
  const fetchLogs = useCallback(async (appId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/apps/${appId}/logs`);
      if (res.ok) {
        const text = await res.text();
        const logLines = text.split('\n').filter(Boolean).map((line, idx) => ({
          id: `${appId}-${idx}`,
          appId,
          timestamp: new Date(),
          message: line,
          type: line.toLowerCase().includes('error') ? 'error' as const : 
                line.toLowerCase().includes('success') || line.includes('✓') || line.includes('Complete') ? 'success' as const :
                line.toLowerCase().includes('warning') ? 'warning' as const : 'info' as const
        }));
        setLogs(logLines);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    fetchApps();
    fetchStats();
    
    const appsInterval = setInterval(fetchApps, 5000);
    const statsInterval = setInterval(fetchStats, 2000);
    
    return () => {
      clearInterval(appsInterval);
      clearInterval(statsInterval);
    };
  }, [fetchApps, fetchStats]);

  const filteredApps = apps.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewLogs = (app: App) => {
    setSelectedApp(app);
    fetchLogs(app.id);
  };

  const handleToggleApp = async (app: App) => {
    const action = app.status === "running" ? "stop" : "start";
    
    try {
      const res = await fetch(`${API_BASE}/api/apps/${app.id}/${action}`, {
        method: "POST"
      });
      
      if (res.ok) {
        toast.success(`${app.name} ${action === "stop" ? "stopped" : "started"}`);
        fetchApps();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to ${action} ${app.name}`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} ${app.name}`);
    }
  };

  const handleRedeploy = async (app: App) => {
    toast.info(`Redeploying ${app.name}...`);
    
    try {
      const res = await fetch(`${API_BASE}/api/apps/${app.id}/redeploy`, {
        method: "POST"
      });
      
      if (res.ok) {
        toast.success(`Redeployment started for ${app.name}`);
        fetchApps();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to redeploy ${app.name}`);
      }
    } catch (error) {
      toast.error(`Failed to redeploy ${app.name}`);
    }
  };

  const handleDeleteApp = async () => {
    if (!deleteApp) return;
    
    const appName = deleteApp.name;
    
    try {
      const res = await fetch(`${API_BASE}/api/apps/${deleteApp.id}`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        toast.success(`${appName} deleted successfully`);
        setDeleteApp(null);
        fetchApps();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to delete ${appName}`);
      }
    } catch (error) {
      toast.error(`Failed to delete ${appName}`);
    }
  };

  const handleDeploy = async (config: DeployConfig) => {
    toast.info(`Deploying ${config.name}...`);
    
    try {
      const res = await fetch(`${API_BASE}/api/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          repo: config.repo,
          branch: config.branch,
          buildCommand: config.buildCommand,
          startCommand: config.startCommand,
          port: config.port,
          domain: config.domain,
          envVars: config.envVars
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        toast.success(`Deployment started for ${config.name}`);
        if (data.app?.port) {
          toast.info(`Assigned port: ${data.app.port}`);
        }
        if (data.app?.domain) {
          toast.info(`Domain: ${data.app.domain}`);
        }
        fetchApps();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to deploy ${config.name}`);
      }
    } catch (error) {
      toast.error(`Failed to deploy ${config.name}`);
    }
  };

  const handleRefresh = () => {
    fetchApps();
    fetchStats();
    toast.success("Refreshed");
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

          {isLoading ? (
            <div className="text-muted-foreground text-center py-16">
              Loading applications...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredApps.map((app, index) => (
                <AppCard
                  key={app.id}
                  app={app}
                  index={index}
                  onViewLogs={handleViewLogs}
                  onToggleApp={handleToggleApp}
                  onRedeploy={handleRedeploy}
                  onDelete={setDeleteApp}
                />
              ))}
            </div>
          )}

          {!isLoading && filteredApps.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg"
            >
              <p className="mb-4">No apps found. Deploy your first app to get started!</p>
              <button
                onClick={() => setIsDeployModalOpen(true)}
                className="text-primary hover:underline"
              >
                Deploy your first app →
              </button>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteApp} onOpenChange={() => setDeleteApp(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteApp?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete the app, its files, and stop all running processes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteApp}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
