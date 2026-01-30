"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Button } from "@/components/ui/button";
import {
  createCreditTopUpCheckoutSession,
  createManagePaymentsSession,
} from "@/server-actions/credits";
import type { UserCreditBreakdown } from "@/server-actions/credit-breakdown";
import { userCreditBreakdownQueryOptions } from "@/queries/user-credit-breakdown-queries";
import { UserBalanceSummary } from "@terragon/shared/model/credits";
import { userSettingsAtom, useUpdateUserSettingsMutation } from "@/atoms/user";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SettingsWithCTA } from "./settings-row";
import { useServerActionMutation } from "@/queries/server-action-helpers";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatUsd = (valueInCents: number) =>
  currencyFormatter.format(Math.round(valueInCents) / 100);

type CreditGrant = UserCreditBreakdown["recentGrants"][number];

function CreditActions({ hasPaymentMethod }: { hasPaymentMethod: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const userSettings = useAtomValue(userSettingsAtom);
  const userSettingsMutation = useUpdateUserSettingsMutation();
  const {
    data: breakdown,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    ...userCreditBreakdownQueryOptions(),
    enabled: expanded,
  });

  const autoReloadEnabled =
    hasPaymentMethod && !userSettings?.autoReloadDisabled;

  const handleAutoReloadToggle = async (checked: boolean) => {
    await userSettingsMutation.mutateAsync({
      autoReloadDisabled: !checked,
    });
  };

  return (
    <div className="space-y-4">
      {hasPaymentMethod && (
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="auto-reload" className="text-sm font-medium">
              Auto-reload credits
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically reload {formatUsd(2_000)} when your balance drops
              below {formatUsd(500)}
            </p>
          </div>
          <Switch
            id="auto-reload"
            checked={autoReloadEnabled}
            onCheckedChange={handleAutoReloadToggle}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <TopUpCreditsButton />
        <Button
          variant="link"
          size="sm"
          className="text-muted-foreground/80 -ml-3"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Hide breakdown" : "Show breakdown"}
        </Button>
      </div>
      {expanded && (
        <div className="rounded-lg border bg-card p-4">
          {isLoading || isFetching ? (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : isError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "Unable to load credit breakdown. Please try again."}
              </p>
              <Button
                onClick={() => void refetch()}
                size="sm"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          ) : breakdown ? (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">
                  Credit breakdown
                </h4>
                <div className="space-y-1">
                  <BreakdownRow
                    label="Total grants"
                    value={formatUsd(breakdown.totalCreditsCents)}
                  />
                  <BreakdownRow
                    label="Spend"
                    value={formatUsd(breakdown.totalUsageCents)}
                  />
                  <BreakdownRow
                    label="Remaining"
                    value={formatUsd(breakdown.balanceCents)}
                  />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">
                  Recent Credit Top-ups
                </h4>
                <div className="space-y-1">
                  {breakdown.recentGrants.length ? (
                    breakdown.recentGrants.map((grant) => (
                      <GrantRow key={grant.id} grant={grant} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No credit top-ups.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function TopUpCreditsButton() {
  const topUpCreditsMutation = useServerActionMutation({
    mutationFn: createCreditTopUpCheckoutSession,
  });
  const handleTopUp = async () => {
    const result = await topUpCreditsMutation.mutateAsync();
    window.location.href = result;
  };

  return (
    <Button
      onClick={handleTopUp}
      disabled={topUpCreditsMutation.isPending}
      size="sm"
      className="self-start"
    >
      {topUpCreditsMutation.isPending ? "Redirecting..." : "Top up credits"}
    </Button>
  );
}

export function ManagePaymentsButton() {
  const managePaymentsMutation = useServerActionMutation({
    mutationFn: createManagePaymentsSession,
  });
  const handleManagePayments = async (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const result = await managePaymentsMutation.mutateAsync();
    if (e.metaKey || e.ctrlKey) {
      window.open(result, "_blank");
    } else {
      window.location.href = result;
    }
  };
  return (
    <Button
      onClick={handleManagePayments}
      disabled={managePaymentsMutation.isPending}
      size="sm"
      variant="outline"
      className="self-start"
    >
      {managePaymentsMutation.isPending
        ? "Redirecting..."
        : "Manage payment method"}
    </Button>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function GrantRow({ grant }: { grant: CreditGrant }) {
  const createdAt = new Date(grant.createdAt);
  const createdAtLabel = Number.isNaN(createdAt.getTime())
    ? grant.createdAt
    : dateTimeFormatter.format(createdAt);
  return (
    <div className="text-sm pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2 font-medium text-foreground">
        <span>{formatUsd(grant.amountCents)}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {createdAtLabel}
        </span>
      </div>
      {grant.grantType ? (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          {grant.grantType.replace(/_/g, " ")}
        </p>
      ) : grant.description ? (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          {grant.description}
        </p>
      ) : null}
    </div>
  );
}

export function CreditsSection({
  creditBalance,
  hasPaymentMethod,
}: {
  creditBalance: UserBalanceSummary;
  hasPaymentMethod: boolean;
}) {
  return (
    <div className="space-y-4">
      <SettingsWithCTA
        label="Available balance"
        description={
          <p className="text-2xl font-semibold text-foreground">
            {formatUsd(creditBalance.balanceCents)}
          </p>
        }
      >
        {hasPaymentMethod ? <ManagePaymentsButton /> : null}
      </SettingsWithCTA>
      <CreditActions hasPaymentMethod={hasPaymentMethod} />
    </div>
  );
}
