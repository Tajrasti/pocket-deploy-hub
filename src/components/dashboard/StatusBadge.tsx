import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatusBadgeProps {
  status: "running" | "building" | "stopped" | "error";
}

const statusConfig = {
  running: {
    label: "Running",
    className: "bg-success/20 text-success border-success/50",
    pulseColor: "bg-success",
  },
  building: {
    label: "Building",
    className: "bg-warning/20 text-warning border-warning/50",
    pulseColor: "bg-warning",
  },
  stopped: {
    label: "Stopped",
    className: "bg-muted text-muted-foreground border-border",
    pulseColor: "bg-muted-foreground",
  },
  error: {
    label: "Error",
    className: "bg-destructive/20 text-destructive border-destructive/50",
    pulseColor: "bg-destructive",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border",
        config.className
      )}
    >
      <motion.span
        className={cn("w-2 h-2 rounded-full", config.pulseColor)}
        animate={
          status === "running" || status === "building"
            ? { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }
            : {}
        }
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      {config.label}
    </div>
  );
}
