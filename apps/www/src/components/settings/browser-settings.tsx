"use client";

import { useState } from "react";
import { Monitor, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { BrowserConfig } from "@terragon/shared";
import { defaultBrowserConfig } from "@terragon/shared";
import { updateEnvironmentBrowserAction } from "@/server-actions/environment";

interface BrowserSettingsProps {
  repoFullName: string;
  enabled: boolean;
  config: BrowserConfig | null;
}

export function BrowserSettings({
  repoFullName,
  enabled: initialEnabled,
  config: initialConfig,
}: BrowserSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [config, setConfig] = useState<BrowserConfig>(
    initialConfig || defaultBrowserConfig,
  );
  const [newDomain, setNewDomain] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateEnvironmentBrowserAction({
        repoFullName,
        enabled,
        config,
      });
      toast.success("Browser automation settings saved");
    } catch (error) {
      toast.error("Failed to save browser automation settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDomain = () => {
    const domain = newDomain.trim();
    if (!domain) return;

    if (config.allowedDomains.includes(domain)) {
      toast.error("Domain already exists");
      return;
    }

    setConfig({
      ...config,
      allowedDomains: [...config.allowedDomains, domain],
    });
    setNewDomain("");
  };

  const handleRemoveDomain = (domain: string) => {
    setConfig({
      ...config,
      allowedDomains: config.allowedDomains.filter((d) => d !== domain),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Browser Automation
          </CardTitle>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enable headless browser automation for visual testing, screenshot
          capture, and UI verification.
        </p>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label>Allowed Domains</Label>
              <p className="text-xs text-muted-foreground">
                Browser can only navigate to these domains. Use *.domain.com for
                wildcards.
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {config.allowedDomains.map((domain) => (
                  <Badge
                    key={domain}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {domain}
                    <button
                      onClick={() => handleRemoveDomain(domain)}
                      className="hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="localhost"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddDomain();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddDomain}
                  disabled={!newDomain.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Viewport Width</Label>
                <Input
                  type="number"
                  value={config.defaultViewport.width}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      defaultViewport: {
                        ...config.defaultViewport,
                        width: parseInt(e.target.value, 10) || 1280,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Default Viewport Height</Label>
                <Input
                  type="number"
                  value={config.defaultViewport.height}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      defaultViewport: {
                        ...config.defaultViewport,
                        height: parseInt(e.target.value, 10) || 720,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Screenshot Size (MB)</Label>
                <Input
                  type="number"
                  value={config.maxScreenshotSize / (1024 * 1024)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      maxScreenshotSize:
                        (parseFloat(e.target.value) || 5) * 1024 * 1024,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max Session Duration (min)</Label>
                <Input
                  type="number"
                  value={config.maxSessionDuration / (60 * 1000)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      maxSessionDuration:
                        (parseFloat(e.target.value) || 5) * 60 * 1000,
                    })
                  }
                />
              </div>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
