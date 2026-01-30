"use client";

import {
  SettingsSection,
  SettingsWithCTA,
} from "@/components/settings/settings-row";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getStripeBillingPortalUrl,
  getStripeCheckoutUrl,
  setSignupTrialPlan,
} from "@/server-actions/billing";
import { useBillingInfoQuery } from "@/queries/billing-queries";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  SUBSCRIPTION_PLAN_CONFIG,
  type SubscriptionPlanConfig,
} from "@/lib/subscription-plan-config";
import { SubscriptionStatus } from "@terragon/shared/db/schema";
import { SignupTrialInfo, SubscriptionInfo } from "@terragon/shared/db/types";
import { useUserCreditBalanceQuery } from "@/queries/user-credit-balance-queries";
import { CreditsSection } from "../credits";
import { useServerActionMutation } from "@/queries/server-action-helpers";
import { publicDocsUrl } from "@terragon/env/next-public";

const CORE_PLAN = SUBSCRIPTION_PLAN_CONFIG.core;
const PRO_PLAN = SUBSCRIPTION_PLAN_CONFIG.pro;

type BillingPlanOption = Pick<
  SubscriptionPlanConfig,
  "name" | "price" | "features"
> & { id: "core" | "pro"; blurb: string };

const BILLING_PLAN_OPTIONS: BillingPlanOption[] = [
  {
    id: CORE_PLAN.id as "core",
    name: CORE_PLAN.name,
    price: CORE_PLAN.price,
    blurb: CORE_PLAN.billingBlurb ?? CORE_PLAN.description,
    features: CORE_PLAN.features,
  },
  {
    id: PRO_PLAN.id as "pro",
    name: PRO_PLAN.name,
    price: PRO_PLAN.price,
    blurb: PRO_PLAN.billingBlurb ?? PRO_PLAN.description,
    features: PRO_PLAN.features,
  },
];

const statusBadgeVariant: Record<
  SubscriptionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  trialing: "secondary",
  past_due: "destructive",
  unpaid: "destructive",
  incomplete: "secondary",
  incomplete_expired: "outline",
  canceled: "outline",
  paused: "secondary",
} as const;

// Treat only truly active-like statuses as having an active plan for highlighting/CTA hiding.
const ACTIVE_LIKE_STATUSES = new Set<SubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
]);

function UnusedSubscriptionCouponAlert() {
  return (
    <Alert className="mx-auto flex w-full max-w-2xl items-start gap-3 rounded-xl border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-background/40 shadow-sm">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="space-y-1">
        <AlertTitle className="text-base font-semibold text-foreground">
          Enjoy two months free
        </AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          As a thanks for using us during early access enjoy two months on us.
          The discount will be automatically applied during checkout.
        </AlertDescription>
      </div>
    </Alert>
  );
}

function ShutdownNotice() {
  return (
    <Card className="mx-auto w-full max-w-2xl border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base text-destructive">
          Terragon is Shutting Down
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          New subscriptions are no longer available. Terragon will shut down on
          February 9th, 2026.{" "}
          <a
            href={`${publicDocsUrl()}/docs/resources/shutdown`}
            className="underline text-foreground hover:text-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function useBillingInfo() {
  const { data, isLoading, refetch, isFetching } = useBillingInfoQuery();
  const hasSubscription = !!data?.subscription;
  const hasUnusedCoupon = !!data?.unusedPromotionCode;
  const signupTrialDaysRemaining = data?.signupTrial?.daysRemaining ?? 0;
  const isSignupTrialActive = !hasSubscription && signupTrialDaysRemaining > 0;

  let activePlanOrNull: "core" | "pro" | null = null;
  if (isSignupTrialActive) {
    if (
      data?.signupTrial?.plan === "core" ||
      data?.signupTrial?.plan === "pro"
    ) {
      activePlanOrNull = data.signupTrial.plan as "core" | "pro";
    }
  } else if (
    hasSubscription &&
    ACTIVE_LIKE_STATUSES.has(data?.subscription?.status as SubscriptionStatus)
  ) {
    if (
      data?.subscription?.plan === "core" ||
      data?.subscription?.plan === "pro"
    ) {
      activePlanOrNull = data.subscription.plan as "core" | "pro";
    }
  }

  const openBillingPortalMutation = useServerActionMutation({
    mutationFn: getStripeBillingPortalUrl,
  });
  const openBillingPortal = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const url = await openBillingPortalMutation.mutateAsync();
    if (e.metaKey || e.ctrlKey) {
      window.open(url, "_blank");
    } else {
      window.location.href = url;
    }
  };

  const startCheckoutMutation = useServerActionMutation({
    mutationFn: getStripeCheckoutUrl,
  });
  const startCheckout = async (planToPurchase: "core" | "pro") => {
    const url = await startCheckoutMutation.mutateAsync({
      plan: planToPurchase,
    });
    window.location.href = url;
  };

  const selectSignupTrialPlanMutation = useServerActionMutation({
    mutationFn: setSignupTrialPlan,
  });
  const selectPlan = async (plan: "core" | "pro") => {
    if (isSignupTrialActive) {
      await selectSignupTrialPlanMutation.mutateAsync(plan);
      toast.success(`Plan updated`);
      refetch();
      return;
    }
    await startCheckout(plan);
  };
  const selectPlanPending = isSignupTrialActive
    ? selectSignupTrialPlanMutation.isPending
    : startCheckoutMutation.isPending;
  return {
    data,
    isLoading,
    refetch,
    isFetching,
    hasSubscription,
    activePlanOrNull,
    hasUnusedCoupon,
    isShutdownMode: !!data?.isShutdownMode,
    openBillingPortal,
    openBillingPortalPending: openBillingPortalMutation.isPending,
    startCheckout,
    startCheckoutPending: startCheckoutMutation.isPending,
    selectPlan,
    selectPlanPending,
  };
}

function SubscriptionPlanStatus({
  subscriptionInfo,
  signupTrialInfo,
}: {
  subscriptionInfo: SubscriptionInfo | null;
  signupTrialInfo: SignupTrialInfo | null;
}) {
  if (subscriptionInfo) {
    const parts: React.ReactNode[] = [];
    const status = subscriptionInfo.status;
    if (subscriptionInfo.plan && status) {
      parts.push(
        <div key="plan-status" className="inline-flex items-center gap-1">
          <span>{subscriptionInfo.plan.toUpperCase()}</span>
          <Badge variant={statusBadgeVariant[status]} className="align-middle">
            {status.replace(/_/g, " ")}
          </Badge>
        </div>,
      );
    }
    if (status && ACTIVE_LIKE_STATUSES.has(status)) {
      if (subscriptionInfo.periodEnd) {
        parts.push(
          <span key="dot-separator" className="text-muted-foreground">
            ·
          </span>,
        );
        parts.push(
          <span key="renews" className="text-muted-foreground">
            {subscriptionInfo.cancelAtPeriodEnd ? "Cancels on " : "Renews on "}
            {subscriptionInfo.periodEnd.toLocaleDateString()}
          </span>,
        );
      }
    } else if (status === "canceled") {
      if (subscriptionInfo.periodEnd) {
        parts.push(
          <span key="dot-separator" className="text-muted-foreground">
            ·
          </span>,
        );
        parts.push(
          <span key="ended" className="text-muted-foreground">
            Ended on {subscriptionInfo.periodEnd.toLocaleDateString()}
          </span>,
        );
      }
    } else if (status === "incomplete") {
      parts.push(
        <span key="dot-separator" className="text-muted-foreground">
          ·
        </span>,
      );
      parts.push(
        <span key="incomplete" className="text-muted-foreground">
          Checkout not completed
        </span>,
      );
    } else if (status === "incomplete_expired") {
      parts.push(
        <span key="dot-separator" className="text-muted-foreground">
          ·
        </span>,
      );
      parts.push(
        <span key="expired" className="text-muted-foreground">
          Checkout session expired
        </span>,
      );
    }
    return (
      <span className="text-muted-foreground inline-flex items-center flex-wrap gap-y-1 gap-x-2">
        {parts}
      </span>
    );
  }
  if (signupTrialInfo && signupTrialInfo.daysRemaining > 0) {
    const parts: React.ReactNode[] = [
      <span key="trial-remaining" className="inline-flex items-center gap-1">
        <span>{signupTrialInfo.plan.toUpperCase()}</span>
        <Badge variant={statusBadgeVariant["trialing"]}>Trial</Badge>
      </span>,
    ];
    parts.push(<span className="text-muted-foreground">·</span>);
    parts.push(
      <span>
        {signupTrialInfo.daysRemaining} day
        {signupTrialInfo.daysRemaining === 1 ? "" : "s"} left
      </span>,
    );
    if (signupTrialInfo.trialEndsAt) {
      parts.push(
        <span key="dot-separator" className="text-muted-foreground">
          ·
        </span>,
      );
      parts.push(
        <span key="trial-ends" className="text-muted-foreground">
          Ends on {new Date(signupTrialInfo.trialEndsAt).toLocaleDateString()}
        </span>,
      );
    }
    return (
      <span className="text-muted-foreground inline-flex items-center flex-wrap gap-y-1 gap-x-2">
        {parts}
      </span>
    );
  }
  if (signupTrialInfo?.daysRemaining === 0) {
    return (
      <span className="text-muted-foreground">
        Trial Expired — Please select a plan to continue using Terragon.
      </span>
    );
  }
  return null;
}

function SubscriptionPlans({
  activePlan,
  selectPlan,
  selectPlanPending,
}: {
  activePlan: "core" | "pro" | null;
  selectPlan: (plan: "core" | "pro") => void;
  selectPlanPending: boolean;
}) {
  return (
    <Card className="mx-auto w-full max-w-2xl gap-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {!activePlan ? "Choose your plan" : "Subscription Plans"}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2">
          {BILLING_PLAN_OPTIONS.map((option) => {
            const isActive = activePlan === option.id;
            return (
              <div
                key={option.id}
                className={
                  "relative flex h-full flex-col gap-4 rounded-lg border p-4 " +
                  (isActive ? "border-primary bg-primary/5" : "border-border")
                }
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {option.name}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {option.blurb}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">
                      {option.price}
                    </span>
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
                <ul className="flex-1 space-y-2 text-sm">
                  {option.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                {isActive ? null : (
                  <Button
                    className="w-full"
                    onClick={() => selectPlan(option.id)}
                    disabled={selectPlanPending}
                  >
                    {selectPlanPending
                      ? "Redirecting…"
                      : !activePlan
                        ? `Select ${option.name}`
                        : `Switch to ${option.name}`}
                  </Button>
                )}
                {isActive && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                      Current Plan
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionPlanAction({
  subscriptionInfo,
  openBillingPortal,
  openBillingPortalPending,
  startCheckout,
  startCheckoutPending,
}: {
  subscriptionInfo: SubscriptionInfo | null;
  openBillingPortal: (e: React.MouseEvent<HTMLButtonElement>) => void;
  openBillingPortalPending: boolean;
  startCheckout: (planToPurchase: "core" | "pro") => void;
  startCheckoutPending: boolean;
}) {
  if (!subscriptionInfo) {
    return null;
  }
  const targetPlan = subscriptionInfo.plan === "pro" ? "pro" : "core";
  if (
    subscriptionInfo.status === "incomplete_expired" ||
    subscriptionInfo.status === "canceled"
  ) {
    return (
      <Button
        size="sm"
        onClick={() => startCheckout(targetPlan)}
        disabled={startCheckoutPending}
      >
        {startCheckoutPending
          ? "Redirecting…"
          : `Upgrade to ${targetPlan === "pro" ? "Pro" : "Core"}`}
      </Button>
    );
  }
  if (subscriptionInfo.status === "incomplete") {
    return (
      <Button
        size="sm"
        onClick={() => startCheckout(targetPlan)}
        disabled={startCheckoutPending}
      >
        {startCheckoutPending ? "Redirecting…" : "Resume Checkout"}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={openBillingPortal}
      disabled={openBillingPortalPending}
    >
      {openBillingPortalPending ? "Opening…" : "Manage Subscription"}
    </Button>
  );
}

export function BillingSettings({
  hasPaymentMethod,
}: {
  hasPaymentMethod: boolean;
}) {
  const {
    data,
    isLoading,
    refetch: refetchBillingInfo,
    isFetching,
    hasUnusedCoupon,
    isShutdownMode,
    activePlanOrNull,
    openBillingPortal,
    openBillingPortalPending,
    startCheckout,
    startCheckoutPending,
    selectPlan,
    selectPlanPending,
  } = useBillingInfo();
  const { data: creditBalance, isLoading: isCreditBalanceLoading } =
    useUserCreditBalanceQuery();

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        label="Credits"
        description="These credits will be used for agent requests when you don't have a provider account linked."
      >
        {isCreditBalanceLoading ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin" /> Loading credit
            balance...
          </div>
        ) : (
          <CreditsSection
            creditBalance={creditBalance!}
            hasPaymentMethod={hasPaymentMethod}
          />
        )}
      </SettingsSection>
      <div className="space-y-4">
        <SettingsSection
          label="Subscription"
          description="Your subscription lets you run tasks on the Terragon platform."
        >
          <div className="flex flex-col gap-4">
            <SettingsWithCTA
              label="Current plan"
              description={
                isLoading ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading billing
                    status...
                  </span>
                ) : (
                  <SubscriptionPlanStatus
                    subscriptionInfo={data?.subscription ?? null}
                    signupTrialInfo={data?.signupTrial ?? null}
                  />
                )
              }
            >
              <SubscriptionPlanAction
                subscriptionInfo={data?.subscription ?? null}
                openBillingPortal={openBillingPortal}
                openBillingPortalPending={openBillingPortalPending}
                startCheckout={startCheckout}
                startCheckoutPending={startCheckoutPending}
              />
            </SettingsWithCTA>
          </div>
        </SettingsSection>

        {!data?.subscription && hasUnusedCoupon && !isShutdownMode && (
          <UnusedSubscriptionCouponAlert />
        )}

        {isShutdownMode && !activePlanOrNull ? (
          <ShutdownNotice />
        ) : (
          <SubscriptionPlans
            activePlan={activePlanOrNull}
            selectPlan={selectPlan}
            selectPlanPending={selectPlanPending}
          />
        )}

        <div className="text-xs text-muted-foreground">
          Having trouble? Refresh this page after managing your subscription.{" "}
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={() => refetchBillingInfo()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh status"}
          </button>
        </div>
      </div>
    </div>
  );
}
