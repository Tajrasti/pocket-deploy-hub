import { motion } from "framer-motion";
import { Cpu, HardDrive, Clock, Activity } from "lucide-react";
import type { SystemStats as SystemStatsType } from "@/types/deployment";

interface SystemStatsProps {
  stats: SystemStatsType;
}

export function SystemStats({ stats }: SystemStatsProps) {
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  const memoryPercent = (stats.memoryUsed / stats.memoryTotal) * 100;

  const statItems = [
    {
      icon: Cpu,
      label: "CPU Usage",
      value: `${stats.cpuUsage.toFixed(1)}%`,
      progress: stats.cpuUsage,
    },
    {
      icon: HardDrive,
      label: "Memory",
      value: `${(stats.memoryUsed / 1024).toFixed(1)}GB / ${(stats.memoryTotal / 1024).toFixed(1)}GB`,
      progress: memoryPercent,
    },
    {
      icon: Clock,
      label: "Uptime",
      value: formatUptime(stats.uptime),
      progress: null,
    },
    {
      icon: Activity,
      label: "Active Apps",
      value: stats.activeApps.toString(),
      progress: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statItems.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-md bg-muted">
              <item.icon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {item.label}
            </span>
          </div>
          <div className="text-lg font-medium text-foreground">{item.value}</div>
          {item.progress !== null && (
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${item.progress}%` }}
                transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
              />
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
