import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Github, GitBranch, Terminal, Globe, Key, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (config: DeployConfig) => void;
}

export interface DeployConfig {
  name: string;
  repo: string;
  branch: string;
  buildCommand: string;
  startCommand: string;
  port?: number;
  domain?: string;
  envVars: Record<string, string>;
}

export function DeployModal({ isOpen, onClose, onDeploy }: DeployModalProps) {
  const [config, setConfig] = useState<DeployConfig>({
    name: "",
    repo: "",
    branch: "main",
    buildCommand: "npm install && npm run build",
    startCommand: "npm start",
    port: undefined,
    domain: undefined,
    envVars: {},
  });

  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.name || !config.repo) return;
    
    onDeploy({
      ...config,
      port: config.port || undefined,
      domain: config.domain?.trim() || undefined,
    });
    
    // Reset form
    setConfig({
      name: "",
      repo: "",
      branch: "main",
      buildCommand: "npm install && npm run build",
      startCommand: "npm start",
      port: undefined,
      domain: undefined,
      envVars: {},
    });
    onClose();
  };

  const slugPreview = config.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

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
                  <Github className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-medium">Deploy New App</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  App Name *
                </Label>
                <Input
                  placeholder="my-awesome-app"
                  value={config.name}
                  onChange={(e) => setConfig((p) => ({ ...p, name: e.target.value }))}
                  className="bg-muted border-border"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Github className="w-3 h-3" /> Repository URL *
                </Label>
                <Input
                  placeholder="https://github.com/user/repo"
                  value={config.repo}
                  onChange={(e) => setConfig((p) => ({ ...p, repo: e.target.value }))}
                  className="bg-muted border-border"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <GitBranch className="w-3 h-3" /> Branch
                  </Label>
                  <Input
                    placeholder="main"
                    value={config.branch}
                    onChange={(e) => setConfig((p) => ({ ...p, branch: e.target.value }))}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Zap className="w-3 h-3" /> Port
                    <span className="text-primary/60 text-[10px] normal-case">(auto if empty)</span>
                  </Label>
                  <Input
                    type="number"
                    placeholder="Auto-assigned"
                    value={config.port || ""}
                    onChange={(e) => setConfig((p) => ({ ...p, port: e.target.value ? parseInt(e.target.value) : undefined }))}
                    className="bg-muted border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Globe className="w-3 h-3" /> Domain
                  <span className="text-primary/60 text-[10px] normal-case">(auto if empty)</span>
                </Label>
                <Input
                  placeholder={slugPreview ? `${slugPreview}.localhost` : "Auto-generated from name"}
                  value={config.domain || ""}
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
                    placeholder="npm install && npm run build"
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
                    placeholder="npm start"
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
                <Button type="submit" variant="glow" className="flex-1" disabled={!config.name || !config.repo}>
                  Deploy
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
