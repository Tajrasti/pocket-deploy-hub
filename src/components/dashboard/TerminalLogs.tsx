import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BuildLog, App } from "@/types/deployment";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface TerminalLogsProps {
  app: App | null;
  logs: BuildLog[];
  onClose: () => void;
}

const logTypeStyles = {
  info: "text-muted-foreground",
  error: "text-destructive",
  success: "text-success",
  warning: "text-warning",
};

export function TerminalLogs({ app, logs, onClose }: TerminalLogsProps) {
  if (!app) return null;

  const appLogs = logs.filter((log) => log.appId === app.id);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
        style={{ height: "40vh" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-destructive" />
              <span className="w-3 h-3 rounded-full bg-warning" />
              <span className="w-3 h-3 rounded-full bg-success" />
            </div>
            <span className="text-sm text-muted-foreground">
              ~/logs/<span className="text-primary">{app.name}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="h-[calc(100%-52px)] overflow-y-auto p-4 font-mono text-sm terminal-grid">
          {appLogs.length === 0 ? (
            <div className="text-muted-foreground">
              <span className="text-primary">$</span> No logs available
              <span className="animate-terminal-blink">_</span>
            </div>
          ) : (
            appLogs.map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className="flex gap-3 py-0.5"
              >
                <span className="text-muted-foreground/50 shrink-0">
                  {format(log.timestamp, "HH:mm:ss")}
                </span>
                <span className={cn(logTypeStyles[log.type])}>{log.message}</span>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
