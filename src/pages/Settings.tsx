import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Wifi, 
  Cable, 
  Globe, 
  Server, 
  Shield, 
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface NetworkInterface {
  name: string;
  type: 'wifi' | 'ethernet' | 'other';
  status: 'connected' | 'disconnected' | 'connecting';
  ip?: string;
  mac?: string;
  ssid?: string;
  signal?: number;
}

interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
  connected: boolean;
}

interface ServerSettings {
  baseDomain: string;
  webhookSecret: string;
  startPort: number;
  enableHttps: boolean;
  autoStartApps: boolean;
  logRetentionDays: number;
}

export default function Settings() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [settings, setSettings] = useState<ServerSettings>({
    baseDomain: '',
    webhookSecret: '',
    startPort: 4000,
    enableHttps: false,
    autoStartApps: true,
    logRetentionDays: 7
  });
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wifiPassword, setWifiPassword] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch network interfaces
  const fetchInterfaces = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/network/interfaces`);
      if (res.ok) {
        const data = await res.json();
        setInterfaces(data);
      }
    } catch (error) {
      console.error("Failed to fetch interfaces:", error);
    }
  }, []);

  // Fetch server settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  }, []);

  // Scan for WiFi networks
  const scanWifi = async () => {
    setIsScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/network/wifi/scan`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setWifiNetworks(data);
        toast.success("WiFi scan complete");
      } else {
        toast.error("Failed to scan WiFi networks");
      }
    } catch (error) {
      toast.error("Failed to scan WiFi networks");
    } finally {
      setIsScanning(false);
    }
  };

  // Connect to WiFi
  const connectWifi = async (ssid: string) => {
    if (!wifiPassword) {
      toast.error("Please enter the WiFi password");
      return;
    }
    
    setIsConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/api/network/wifi/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password: wifiPassword })
      });
      
      if (res.ok) {
        toast.success(`Connected to ${ssid}`);
        setWifiPassword('');
        setSelectedNetwork(null);
        fetchInterfaces();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to connect");
      }
    } catch (error) {
      toast.error("Failed to connect to WiFi");
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect from WiFi
  const disconnectWifi = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/network/wifi/disconnect`, { method: 'POST' });
      if (res.ok) {
        toast.success("Disconnected from WiFi");
        fetchInterfaces();
      }
    } catch (error) {
      toast.error("Failed to disconnect");
    }
  };

  // Save settings
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
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

  // Copy webhook secret
  const copySecret = async () => {
    await navigator.clipboard.writeText(settings.webhookSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate new webhook secret
  const generateSecret = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/generate-secret`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, webhookSecret: data.secret }));
        toast.success("New webhook secret generated");
      }
    } catch (error) {
      toast.error("Failed to generate secret");
    }
  };

  useEffect(() => {
    fetchInterfaces();
    fetchSettings();
  }, [fetchInterfaces, fetchSettings]);

  const getSignalIcon = (signal: number) => {
    if (signal >= 70) return "●●●●";
    if (signal >= 50) return "●●●○";
    if (signal >= 30) return "●●○○";
    return "●○○○";
  };

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
              <h1 className="text-xl font-bold text-foreground">Server Settings</h1>
              <p className="text-xs text-muted-foreground">Configure your PhoneDeploy server</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="network" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="network" className="gap-2">
              <Globe className="w-4 h-4" />
              Network
            </TabsTrigger>
            <TabsTrigger value="server" className="gap-2">
              <Server className="w-4 h-4" />
              Server
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="w-4 h-4" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Network Settings */}
          <TabsContent value="network" className="space-y-6">
            {/* Network Interfaces */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-primary" />
                      Network Interfaces
                    </CardTitle>
                    <CardDescription>
                      View and manage network connections
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchInterfaces}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {interfaces.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No network interfaces found</p>
                ) : (
                  interfaces.map((iface) => (
                    <motion.div
                      key={iface.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border"
                    >
                      <div className="flex items-center gap-4">
                        {iface.type === 'wifi' ? (
                          <Wifi className="w-5 h-5 text-primary" />
                        ) : (
                          <Cable className="w-5 h-5 text-primary" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{iface.name}</p>
                          {iface.ssid && (
                            <p className="text-sm text-muted-foreground">SSID: {iface.ssid}</p>
                          )}
                          {iface.ip && (
                            <p className="text-sm text-muted-foreground">IP: {iface.ip}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {iface.signal && (
                          <span className="text-sm text-muted-foreground font-mono">
                            {getSignalIcon(iface.signal)}
                          </span>
                        )}
                        <Badge 
                          variant={iface.status === 'connected' ? 'default' : 'secondary'}
                          className={iface.status === 'connected' ? 'bg-green-500/20 text-green-400' : ''}
                        >
                          {iface.status}
                        </Badge>
                      </div>
                    </motion.div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* WiFi Networks */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wifi className="w-5 h-5 text-primary" />
                      WiFi Networks
                    </CardTitle>
                    <CardDescription>
                      Scan and connect to available WiFi networks
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={scanWifi}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Scan
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {wifiNetworks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Click "Scan" to search for available networks
                  </p>
                ) : (
                  wifiNetworks.map((network) => (
                    <motion.div
                      key={network.ssid}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-lg bg-muted/50 border border-border space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Wifi className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground">{network.ssid}</p>
                            <p className="text-xs text-muted-foreground">
                              {network.security} • Signal: {network.signal}%
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-muted-foreground">
                            {getSignalIcon(network.signal)}
                          </span>
                          {network.connected ? (
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={disconnectWifi}
                            >
                              Disconnect
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedNetwork(
                                selectedNetwork === network.ssid ? null : network.ssid
                              )}
                            >
                              {selectedNetwork === network.ssid ? 'Cancel' : 'Connect'}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {selectedNetwork === network.ssid && !network.connected && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="flex gap-2"
                        >
                          <Input
                            type="password"
                            placeholder="Enter password"
                            value={wifiPassword}
                            onChange={(e) => setWifiPassword(e.target.value)}
                            className="bg-background"
                          />
                          <Button 
                            onClick={() => connectWifi(network.ssid)}
                            disabled={isConnecting}
                          >
                            {isConnecting ? 'Connecting...' : 'Connect'}
                          </Button>
                        </motion.div>
                      )}
                    </motion.div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Ethernet Settings */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cable className="w-5 h-5 text-primary" />
                  Ethernet Settings
                </CardTitle>
                <CardDescription>
                  Configure wired network connection (USB-C to Ethernet adapter)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <p className="text-sm text-muted-foreground">
                    Connect a USB-C to Ethernet adapter to enable wired networking. 
                    The connection will be automatically detected.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Server Settings */}
          <TabsContent value="server" className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  Server Configuration
                </CardTitle>
                <CardDescription>
                  Configure deployment and hosting settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="baseDomain">Base Domain</Label>
                    <Input
                      id="baseDomain"
                      placeholder="e.g., myserver.local or example.com"
                      value={settings.baseDomain}
                      onChange={(e) => setSettings(prev => ({ ...prev, baseDomain: e.target.value }))}
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Apps will be available at [app-name].{settings.baseDomain || 'localhost'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="startPort">Starting Port</Label>
                    <Input
                      id="startPort"
                      type="number"
                      value={settings.startPort}
                      onChange={(e) => setSettings(prev => ({ ...prev, startPort: parseInt(e.target.value) || 4000 }))}
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Port allocation starts from this number
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-start Apps on Boot</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically start all apps when server restarts
                      </p>
                    </div>
                    <Switch
                      checked={settings.autoStartApps}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoStartApps: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enable HTTPS</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically obtain SSL certificates via Caddy
                      </p>
                    </div>
                    <Switch
                      checked={settings.enableHttps}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enableHttps: checked }))}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="logRetention">Log Retention (days)</Label>
                  <Select
                    value={String(settings.logRetentionDays)}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, logRetentionDays: parseInt(value) }))}
                  >
                    <SelectTrigger className="w-48 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4">
                  <Button onClick={saveSettings} disabled={isSaving} className="gap-2">
                    {isSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Webhook Security
                </CardTitle>
                <CardDescription>
                  Configure GitHub webhook authentication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        value={settings.webhookSecret}
                        readOnly
                        className="bg-background pr-20 font-mono text-sm"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setShowSecret(!showSecret)}
                        >
                          {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={copySecret}
                        >
                          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button variant="outline" onClick={generateSecret}>
                      Generate New
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use this secret in your GitHub webhook configuration
                  </p>
                </div>

                <Separator />

                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <h4 className="font-medium mb-2">GitHub Webhook Setup</h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Go to your GitHub repository → Settings → Webhooks</li>
                    <li>Click "Add webhook"</li>
                    <li>
                      Set Payload URL to: <code className="bg-background px-1 rounded">
                        http://[your-server-ip]:3001/webhook
                      </code>
                    </li>
                    <li>Set Content type to: <code className="bg-background px-1 rounded">application/json</code></li>
                    <li>Paste the webhook secret above</li>
                    <li>Select "Just the push event"</li>
                    <li>Click "Add webhook"</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
