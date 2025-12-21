import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, RefreshCw, Server, Globe, Shield, Clock, Layers, Copy, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ServerSettings {
  baseDomain: string;
  webhookSecret: string;
  autoRestart: boolean;
  maxConcurrentBuilds: number;
  logRetentionDays: number;
  defaultBranch: string;
  enableCaddy: boolean;
}

interface ServerInfo {
  webhookUrl: string;
  secretConfigured: boolean;
}

export default function Settings() {
  const [settings, setSettings] = useState<ServerSettings>({
    baseDomain: "",
    webhookSecret: "",
    autoRestart: true,
    maxConcurrentBuilds: 2,
    logRetentionDays: 7,
    defaultBranch: "main",
    enableCaddy: true,
  });
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchServerInfo();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchServerInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/webhook-info`);
      if (res.ok) {
        const data = await res.json();
        setServerInfo(data);
      }
    } catch (error) {
      console.error("Failed to fetch server info:", error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast.success("Settings saved successfully");
      } else {
        toast.error("Failed to save settings");
      }
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const regenerateSecret = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/regenerate-secret`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, webhookSecret: data.secret }));
        toast.success("Webhook secret regenerated");
      } else {
        toast.error("Failed to regenerate secret");
      }
    } catch (error) {
      toast.error("Failed to regenerate secret");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">Settings</h1>
              <p className="text-xs text-muted-foreground">
                Configure your PhoneDeploy server
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Server Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                Server Information
              </CardTitle>
              <CardDescription>
                Connection details for your PhoneDeploy server
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={serverInfo?.webhookUrl || `${API_BASE}/webhook`}
                    readOnly
                    className="bg-muted font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      handleCopy(
                        serverInfo?.webhookUrl || `${API_BASE}/webhook`,
                        "Webhook URL"
                      )
                    }
                  >
                    {copied === "Webhook URL" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add this URL as a webhook in your GitHub repository settings
                </p>
              </div>

              <div className="space-y-2">
                <Label>API Base URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={API_BASE}
                    readOnly
                    className="bg-muted font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(API_BASE, "API URL")}
                  >
                    {copied === "API URL" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Domain Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Domain Settings
              </CardTitle>
              <CardDescription>
                Configure automatic domain generation for deployed apps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="baseDomain">Base Domain</Label>
                <Input
                  id="baseDomain"
                  placeholder="e.g., myserver.local or yourdomain.com"
                  value={settings.baseDomain}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      baseDomain: e.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Apps will be assigned subdomains like app-name.{settings.baseDomain || "localhost"}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enableCaddy">Enable Caddy Reverse Proxy</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically configure Caddy for app routing
                  </p>
                </div>
                <Switch
                  id="enableCaddy"
                  checked={settings.enableCaddy}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, enableCaddy: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Security
              </CardTitle>
              <CardDescription>
                Webhook secret for GitHub signature verification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Webhook Secret</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={settings.webhookSecret}
                    readOnly
                    className="bg-muted font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      handleCopy(settings.webhookSecret, "Webhook Secret")
                    }
                  >
                    {copied === "Webhook Secret" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button variant="outline" onClick={regenerateSecret}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add this secret to your GitHub webhook configuration
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Build Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Build Configuration
              </CardTitle>
              <CardDescription>
                Default settings for new deployments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultBranch">Default Branch</Label>
                  <Input
                    id="defaultBranch"
                    placeholder="main"
                    value={settings.defaultBranch}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        defaultBranch: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxConcurrentBuilds">Max Concurrent Builds</Label>
                  <Input
                    id="maxConcurrentBuilds"
                    type="number"
                    min={1}
                    max={5}
                    value={settings.maxConcurrentBuilds}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        maxConcurrentBuilds: parseInt(e.target.value) || 1,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autoRestart">Auto-Restart on Crash</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically restart apps if they crash
                  </p>
                </div>
                <Switch
                  id="autoRestart"
                  checked={settings.autoRestart}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, autoRestart: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Maintenance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Maintenance
              </CardTitle>
              <CardDescription>
                Log retention and cleanup settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="logRetentionDays">Log Retention (days)</Label>
                <Input
                  id="logRetentionDays"
                  type="number"
                  min={1}
                  max={90}
                  value={settings.logRetentionDays}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      logRetentionDays: parseInt(e.target.value) || 7,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Build logs older than this will be automatically deleted
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Separator />

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex justify-end"
        >
          <Button onClick={handleSave} disabled={isSaving} variant="glow">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
