"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ChevronDown, ChevronRight } from "lucide-react";
import type { TDDGuardConfig } from "@dragon/shared";
import { defaultTDDGuardConfig } from "@dragon/shared";
import { updateEnvironmentTDDGuardAction } from "@/server-actions/environment";

interface TDDGuardSettingsProps {
  repoFullName: string;
  enabled: boolean;
  config: TDDGuardConfig | null;
}

export function TDDGuardSettings({
  repoFullName,
  enabled,
  config: initialConfig,
}: TDDGuardSettingsProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [config, setConfig] = useState<TDDGuardConfig>(
    initialConfig || defaultTDDGuardConfig,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showCustomCommands, setShowCustomCommands] = useState(false);

  const updateConfig = (updates: Partial<TDDGuardConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateEnvironmentTDDGuardAction({
        repoFullName,
        enabled: isEnabled,
        config,
      });

      if (result.errorMessage) {
        toast.error(result.errorMessage);
      } else {
        toast.success("TDD Guard settings saved");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>TDD Guard</CardTitle>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
            aria-label="Enable TDD Guard"
          />
        </div>
        <CardDescription>
          Enforce code quality checks before commits. Runs TypeScript, linting,
          and tests automatically.
        </CardDescription>
      </CardHeader>

      {isEnabled && (
        <CardContent className="space-y-6">
          {/* Check Types */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Quality Checks</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="typeCheck">TypeScript Check</Label>
                <Switch
                  id="typeCheck"
                  checked={config.typeCheck}
                  onCheckedChange={(v) => updateConfig({ typeCheck: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="lint">Linting</Label>
                <Switch
                  id="lint"
                  checked={config.lint}
                  onCheckedChange={(v) => updateConfig({ lint: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="lintAutoFix">Auto-fix Lint Issues</Label>
                <Switch
                  id="lintAutoFix"
                  checked={config.lintAutoFix}
                  onCheckedChange={(v) => updateConfig({ lintAutoFix: v })}
                  disabled={!config.lint}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="tests">Run Tests</Label>
                <Switch
                  id="tests"
                  checked={config.tests}
                  onCheckedChange={(v) => updateConfig({ tests: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="coverage">Coverage Check</Label>
                <Switch
                  id="coverage"
                  checked={config.coverage}
                  onCheckedChange={(v) => updateConfig({ coverage: v })}
                />
              </div>
            </div>
          </div>

          {/* Coverage Threshold */}
          {config.coverage && (
            <div className="space-y-2">
              <Label htmlFor="minCoverage">
                Minimum Coverage: {config.minCoverage}%
              </Label>
              <input
                id="minCoverage"
                type="range"
                min={0}
                max={100}
                step={5}
                value={config.minCoverage}
                onChange={(e) =>
                  updateConfig({ minCoverage: parseInt(e.target.value, 10) })
                }
                className="w-full"
              />
            </div>
          )}

          {/* Behavior */}
          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium">Behavior on Failure</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="block"
                  name="behavior"
                  checked={config.blockOnFailure && !config.warnOnly}
                  onChange={() =>
                    updateConfig({ blockOnFailure: true, warnOnly: false })
                  }
                />
                <Label htmlFor="block">Block commits on failure</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="warn"
                  name="behavior"
                  checked={config.warnOnly}
                  onChange={() =>
                    updateConfig({ blockOnFailure: false, warnOnly: true })
                  }
                />
                <Label htmlFor="warn">Warn only (allow commits)</Label>
              </div>
            </div>
          </div>

          {/* Test Timeout */}
          <div className="space-y-2">
            <Label htmlFor="maxTestDuration">
              Max Test Duration: {config.maxTestDuration}s
            </Label>
            <input
              id="maxTestDuration"
              type="range"
              min={30}
              max={600}
              step={30}
              value={config.maxTestDuration}
              onChange={(e) =>
                updateConfig({ maxTestDuration: parseInt(e.target.value, 10) })
              }
              className="w-full"
            />
          </div>

          {/* Custom Commands */}
          <div className="border-t pt-4">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium w-full"
              onClick={() => setShowCustomCommands(!showCustomCommands)}
            >
              {showCustomCommands ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Custom Commands
            </button>

            {showCustomCommands && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="typeCheckCommand">TypeScript Command</Label>
                  <Input
                    id="typeCheckCommand"
                    placeholder="pnpm tsc-check"
                    value={config.typeCheckCommand || ""}
                    onChange={(e) =>
                      updateConfig({
                        typeCheckCommand: e.target.value || undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lintCommand">Lint Command</Label>
                  <Input
                    id="lintCommand"
                    placeholder="pnpm eslint . --fix"
                    value={config.lintCommand || ""}
                    onChange={(e) =>
                      updateConfig({ lintCommand: e.target.value || undefined })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="testCommand">Test Command</Label>
                  <Input
                    id="testCommand"
                    placeholder="pnpm test"
                    value={config.testCommand || ""}
                    onChange={(e) =>
                      updateConfig({ testCommand: e.target.value || undefined })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coverageCommand">Coverage Command</Label>
                  <Input
                    id="coverageCommand"
                    placeholder="pnpm test --coverage"
                    value={config.coverageCommand || ""}
                    onChange={(e) =>
                      updateConfig({
                        coverageCommand: e.target.value || undefined,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? "Saving..." : "Save TDD Guard Settings"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
