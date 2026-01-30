"use client";

import { useState, useCallback } from "react";
import {
  SettingsSection,
  SettingsCheckbox,
  SettingsWithCTA,
} from "./settings-row";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  type AutoReviewConfig,
  type PRReviewTrigger,
  type PRReviewFocusArea,
  defaultAutoReviewConfig,
} from "@terragon/shared";
import { updateEnvironmentAutoReviewAction } from "@/server-actions/environment";

interface AutoReviewSettingsProps {
  repoFullName: string;
  enabled: boolean;
  config: AutoReviewConfig | null;
}

const triggerOptions: { value: PRReviewTrigger; label: string }[] = [
  { value: "opened", label: "PR Opened" },
  { value: "synchronize", label: "New Commits Pushed" },
  { value: "ready_for_review", label: "Ready for Review" },
];

const focusAreaOptions: {
  value: PRReviewFocusArea;
  label: string;
  emoji: string;
}[] = [
  { value: "security", label: "Security", emoji: "🔒" },
  { value: "performance", label: "Performance", emoji: "⚡" },
  { value: "style", label: "Style", emoji: "📝" },
  { value: "logic", label: "Logic", emoji: "🧠" },
  { value: "tests", label: "Tests", emoji: "🧪" },
];

export function AutoReviewSettings({
  repoFullName,
  enabled: initialEnabled,
  config: initialConfig,
}: AutoReviewSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [config, setConfig] = useState<AutoReviewConfig>(
    initialConfig || defaultAutoReviewConfig,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleToggleTrigger = useCallback(
    (trigger: PRReviewTrigger, checked: boolean) => {
      setConfig((prev) => ({
        ...prev,
        enabledTriggers: checked
          ? [...prev.enabledTriggers, trigger]
          : prev.enabledTriggers.filter((t) => t !== trigger),
      }));
    },
    [],
  );

  const handleToggleFocusArea = useCallback(
    (area: PRReviewFocusArea, checked: boolean) => {
      setConfig((prev) => ({
        ...prev,
        focusAreas: checked
          ? [...prev.focusAreas, area]
          : prev.focusAreas.filter((a) => a !== area),
      }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const result = await updateEnvironmentAutoReviewAction({
        repoFullName,
        enabled,
        config,
      });

      if (result.success) {
        toast.success("Auto-review settings have been updated.");
      } else {
        toast.error(result.errorMessage || "Failed to save settings.");
      }
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }, [repoFullName, enabled, config]);

  return (
    <SettingsSection
      label="Automatic PR Reviews"
      description="Configure automatic code reviews for pull requests in this repository"
      cta={
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">
              Enable automatic reviews
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically review pull requests when they are opened or updated
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <>
            {/* Trigger Options */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Trigger on</Label>
              <div className="space-y-2">
                {triggerOptions.map((option) => (
                  <SettingsCheckbox
                    key={option.value}
                    label={option.label}
                    value={config.enabledTriggers.includes(option.value)}
                    onCheckedChange={(checked) =>
                      handleToggleTrigger(option.value, checked)
                    }
                  />
                ))}
              </div>
            </div>

            {/* Focus Areas */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">
                Review Focus Areas
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {focusAreaOptions.map((option) => (
                  <SettingsCheckbox
                    key={option.value}
                    label={`${option.emoji} ${option.label}`}
                    value={config.focusAreas.includes(option.value)}
                    onCheckedChange={(checked) =>
                      handleToggleFocusArea(option.value, checked)
                    }
                  />
                ))}
              </div>
            </div>

            {/* Skip Conditions */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Skip Conditions</Label>
              <div className="space-y-2">
                <SettingsCheckbox
                  label="Skip draft PRs"
                  description="Don't review PRs that are still in draft"
                  value={config.skipDraftPRs}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => ({ ...prev, skipDraftPRs: checked }))
                  }
                />
                <SettingsCheckbox
                  label="Skip bot PRs"
                  description="Don't review PRs created by bots"
                  value={config.skipBots}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => ({ ...prev, skipBots: checked }))
                  }
                />
              </div>
            </div>

            {/* Max Files Changed */}
            <SettingsWithCTA
              label="Maximum files changed"
              description="Skip review if PR exceeds this number of files"
              direction="col"
            >
              <Input
                type="number"
                value={config.maxFilesChanged}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    maxFilesChanged: parseInt(e.target.value, 10) || 50,
                  }))
                }
                min={1}
                max={500}
                className="w-24"
              />
            </SettingsWithCTA>

            {/* Custom Rules */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Custom Review Rules (one per line)
              </Label>
              <Textarea
                value={config.customRules.join("\n")}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    customRules: e.target.value
                      .split("\n")
                      .filter((r) => r.trim()),
                  }))
                }
                placeholder="Check for console.log statements
Verify error boundaries are used
Ensure API endpoints have rate limiting..."
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Add custom rules for the reviewer to check. These will be
                included in the review prompt.
              </p>
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
