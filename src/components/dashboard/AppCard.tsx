import { motion } from "framer-motion";
import { GitBranch, ExternalLink, Play, Square, RotateCcw, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import type { App } from "@/types/deployment";
import { formatDistanceToNow } from "date-fns";

interface AppCardProps {
  app: App;
  index: number;
  onViewLogs: (app: App) => void;
  onToggleApp: (app: App) => void;
  onRedeploy: (app: App) => void;
  onDelete: (app: App) => void;
}

export function AppCard({ app, index, onViewLogs, onToggleApp, onRedeploy, onDelete }: AppCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group bg-card border border-border rounded-lg p-5 hover:border-primary/40 transition-all duration-300 hover:glow-subtle"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-medium text-foreground group-hover:text-primary transition-colors">
              {app.name}
            </h3>
            <StatusBadge status={app.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{app.repo}</span>
            <span className="text-primary/60">/{app.branch}</span>
          </div>
        </div>
        <a
          href={`http://${app.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className="px-2 py-1 bg-muted rounded text-muted-foreground">
          :{app.port}
        </span>
        {app.domain && (
          <>
            <span className="text-muted-foreground">•</span>
            <span className="text-primary/70 truncate max-w-[120px]">{app.domain}</span>
          </>
        )}
        <span className="text-muted-foreground">•</span>
        <span className="text-muted-foreground">
          {formatDistanceToNow(app.lastDeployed, { addSuffix: true })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="terminal"
          size="sm"
          onClick={() => onToggleApp(app)}
          className="flex-1"
          disabled={app.status === "building"}
        >
          {app.status === "running" ? (
            <>
              <Square className="w-3 h-3" /> Stop
            </>
          ) : (
            <>
              <Play className="w-3 h-3" /> Start
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRedeploy(app)}
          className="text-muted-foreground hover:text-primary"
          disabled={app.status === "building"}
          title="Redeploy"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onViewLogs(app)}
          className="text-muted-foreground hover:text-secondary"
          title="View logs"
        >
          <Terminal className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(app)}
          className="text-muted-foreground hover:text-destructive"
          disabled={app.status === "building"}
          title="Delete app"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
