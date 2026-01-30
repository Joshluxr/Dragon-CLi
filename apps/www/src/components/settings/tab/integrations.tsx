"use client";

import { useAtomValue } from "jotai";
import { userAtom } from "@/atoms/user";
import { SlackAccountSettings } from "../slack";
import { SlackAuthToasts } from "../slack-auth-toasts";
import { SlackAccountWithMetadata } from "@terragon/shared/db/types";
import { SettingsSection } from "../settings-row";
import Link from "next/link";

interface IntegrationsSettingsProps {
  slackAccounts?: SlackAccountWithMetadata[];
}

export function IntegrationsSettings({
  slackAccounts = [],
}: IntegrationsSettingsProps) {
  const user = useAtomValue(userAtom);
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Slack Integration */}
      <SettingsSection
        label="Slack"
        description={
          <>
            Connect your Slack workspace to interact with Terragon through
            Slack.{" "}
            <Link
              href="https://docs.terragonlabs.com/docs/integrations/slack-integration"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Learn more about the Slack integration.
            </Link>
          </>
        }
      >
        <SlackAuthToasts />
        <SlackAccountSettings accounts={slackAccounts} />
      </SettingsSection>
    </div>
  );
}
