import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, Save, Key, Terminal, Globe, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { App } from "@/types/deployment";

interface AppSettingsModalProps {
  app: App | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (appId: string, updates: Partial<App>) => void;
}

export function AppSettingsModal({ app, isOpen, onClose, onSave }: AppSettingsModalProps) {
  const [config, setConfig] = useState({
    branch: "",
    buildCommand: "",
    startCommand: "",
    port: 0,
    domain: "",
    envVars: {} as Record<string, string>,
  });
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (app) {
      setConfig({
        branch: app.branch || "main",
        buildCommand: app.buildCommand || "npm install && npm run build",
        startCommand: app.startCommand || "npm start",
        port: app.port || 0,
        domain: app.domain || "",
        envVars: app.envVars || {},
      });
    }
  }, [app]);

  const addEnvVar = () => {
    if (envKey && envValue) {
      setConfig((prev) => ({
        ...prev,
        envVars: { ...prev.envVars, [envKey]: envValue },
      }));
      setEnvKey("");
      setEnvValue("");
    }
  };

  const removeEnvVar = (key: string) => {
    setConfig((prev) => {
      const { [key]: _, ...rest } = prev.envVars;
      return { ...prev, envVars: rest };
    });
  };

  const handleSave = async () => {
    if (!app) return;
    setIsSaving(true);
    try {
      await onSave(app.id, config);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!app) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/20">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-medium">App Settings</h2>
                  <p className="text-xs text-muted-foreground">{app.name}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <GitBranch className="w-3 h-3" /> Branch
                  </Label>
                  <Input
                    value={config.branch}
                    onChange={(e) => setConfig((p) => ({ ...p, branch: e.target.value }))}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Port
                  </Label>
                  <Input
                    type="number"
                    value={config.port}
                    onChange={(e) => setConfig((p) => ({ ...p, port: parseInt(e.target.value) || 0 }))}
                    className="bg-muted border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Globe className="w-3 h-3" /> Domain
                </Label>
                <Input
                  value={config.domain}
                  onChange={(e) => setConfig((p) => ({ ...p, domain: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Terminal className="w-3 h-3" /> Build Command
                  </Label>
                  <Input
                    value={config.buildCommand}
                    onChange={(e) => setConfig((p) => ({ ...p, buildCommand: e.target.value }))}
                    className="bg-muted border-border font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Terminal className="w-3 h-3" /> Start Command
                  </Label>
                  <Input
                    value={config.startCommand}
                    onChange={(e) => setConfig((p) => ({ ...p, startCommand: e.target.value }))}
                    className="bg-muted border-border font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Key className="w-3 h-3" /> Environment Variables
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="KEY"
                    value={envKey}
                    onChange={(e) => setEnvKey(e.target.value.toUpperCase())}
                    className="bg-muted border-border font-mono text-xs flex-1"
                  />
                  <Input
                    placeholder="value"
                    value={envValue}
                    onChange={(e) => setEnvValue(e.target.value)}
                    className="bg-muted border-border font-mono text-xs flex-1"
                  />
                  <Button type="button" variant="terminal" onClick={addEnvVar} disabled={!envKey || !envValue}>
                    Add
                  </Button>
                </div>
                {Object.keys(config.envVars).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(config.envVars).map(([key]) => (
                      <button
                        type="button"
                        key={key}
                        onClick={() => removeEnvVar(key)}
                        className="px-2 py-1 bg-muted rounded text-xs text-primary hover:bg-destructive/20 hover:text-destructive transition-colors"
                        title="Click to remove"
                      >
                        {key} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  variant="glow" 
                  className="flex-1" 
                  disabled={isSaving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
