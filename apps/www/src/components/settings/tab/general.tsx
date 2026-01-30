"use client";

import { useAtomValue } from "jotai";
import {
  userAtom,
  userSettingsAtom,
  useUpdateUserSettingsMutation,
} from "@/atoms/user";
import {
  SettingsCheckbox,
  SettingsWithCTA,
  SettingsSection,
} from "@/components/settings/settings-row";
import { ThemeSelector } from "@/components/settings/theme-selector";
import { NotificationSettings } from "../notification-settings";
import { ExternalLink } from "lucide-react";
import { ThreadVisibilitySelector } from "../thread-visibility-selector";

export function GeneralSettings() {
  const user = useAtomValue(userAtom);
  const userSettings = useAtomValue(userSettingsAtom);
  const userSettingsMutation = useUpdateUserSettingsMutation();
  if (!user || !userSettings) {
    return null;
  }
  return (
    <div className="flex flex-col gap-8">
      {/* Appearance Section */}
      <SettingsSection label="General">
        <div className="flex flex-col gap-4">
          <SettingsWithCTA
            label="Theme"
            description="Choose between light, dark, or system theme"
          >
            <ThemeSelector />
          </SettingsWithCTA>
          <SettingsWithCTA
            label="Default task visibility"
            description="Set the default visibility of new tasks. You can always change this within a task."
          >
            <ThreadVisibilitySelector />
          </SettingsWithCTA>
          <NotificationSettings />
        </div>
      </SettingsSection>

      {/* Advanced Section */}
      <SettingsSection label="Early Access">
        <div id="preview-features" className="scroll-mt-24">
          <SettingsCheckbox
            label="Enable early access features"
            description={
              <>
                Opt in to new features while they are being developed. They will
                change frequently and may be unstable.{" "}
                <a
                  href="https://docs.terragonlabs.com/docs/resources/early-access-features"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  See which features are in early access
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            }
            value={!!userSettings.previewFeaturesOptIn}
            onCheckedChange={async (checked) => {
              await userSettingsMutation.mutateAsync({
                previewFeaturesOptIn: !!checked,
              });
              window.location.reload();
            }}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
