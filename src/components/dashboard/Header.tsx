import { motion } from "framer-motion";
import { Smartphone, Plus, Settings, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onNewDeploy: () => void;
  onRefresh: () => void;
}

export function Header({ onNewDeploy, onRefresh }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20 glow-subtle">
                <Smartphone className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  <span className="text-primary">Phone</span>Deploy
                </h1>
                <p className="text-xs text-muted-foreground">
                  Self-hosted • OnePlus 5T • postmarketOS
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Button variant="ghost" size="icon" onClick={onRefresh}>
              <RefreshCw className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-5 h-5" />
            </Button>
            <Button variant="glow" onClick={onNewDeploy}>
              <Plus className="w-4 h-4" />
              Deploy
            </Button>
          </motion.div>
        </div>
      </div>
    </header>
  );
}
