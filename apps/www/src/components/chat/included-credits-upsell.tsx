import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AIAgent } from "@terragon/agent/types";
import {
  getAgentProviderDisplayName,
  isConnectedCredentialsSupported,
} from "@terragon/agent/utils";

export function IncludedCreditsUpsell({ agent }: { agent: AIAgent }) {
  const providerName = getAgentProviderDisplayName(agent);
  const isCredentialsSupported = isConnectedCredentialsSupported(agent);
  return (
    <div className="p-2 mx-2 border border-primary/30 bg-primary/5 rounded-md text-sm">
      <div className="flex flex-col gap-2 font-mono">
        <p className="text-xs font-medium flex items-center gap-2">
          You're out of included credits
        </p>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {isCredentialsSupported
              ? `Top up credits or connect your ${providerName} account to keep running Terragon tasks.`
              : `Top up credits to keep running Terragon tasks.`}
          </p>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="self-start font-sans">
              <Link href="/settings/billing">Top up credits</Link>
            </Button>
            {isCredentialsSupported && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="self-start font-sans"
              >
                <Link href="/settings/agent#agent-providers">
                  Connect {providerName} account
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
