"use server";

import { headers } from "next/headers";
import { userOnlyAction } from "@/lib/auth-server";
import { auth } from "@/lib/auth";
import { publicAppUrl } from "@terragon/env/next-public";
import { db } from "@/lib/db";
import { assertStripeConfigured } from "@/server-lib/stripe";
import { getBillingInfo as getBillingInfoInternal } from "@/lib/subscription";
import { AccessTier } from "@terragon/shared";
import {
  getSubscriptionInfoForUser,
  setSignupTrialPlanForUser,
} from "@terragon/shared/model/subscription";
import { UserFacingError } from "@/lib/server-actions";
import { getFeatureFlagsGlobal } from "@terragon/shared/model/feature-flags";

export const getBillingInfoAction = userOnlyAction(
  async function getBillingInfoAction() {
    return await getBillingInfoInternal();
  },
  { defaultErrorMessage: "Failed to get billing info" },
);

export const getStripeCheckoutUrl = userOnlyAction(
  async function getStripeCheckoutUrl(
    userId: string,
    { plan = "core" }: { plan?: AccessTier } = {},
  ): Promise<string> {
    // Check if shutdown mode is enabled
    const flags = await getFeatureFlagsGlobal({ db });
    if (flags.shutdownMode) {
      throw new UserFacingError(
        "New subscriptions are no longer available. Terragon is shutting down on February 14th, 2026.",
      );
    }

    assertStripeConfigured();
    const subscription = await getSubscriptionInfoForUser({
      db,
      userId,
    });
    const normalizedPlan = plan === "pro" ? "pro" : "core";
    const successUrl = `${publicAppUrl()}/settings/billing?checkout=success`;
    const cancelUrl = `${publicAppUrl()}/settings/billing?checkout=cancelled`;

    // Use Better Auth's Stripe plugin to create the checkout session
    const res = await auth.api.upgradeSubscription({
      body: {
        plan: normalizedPlan,
        successUrl,
        cancelUrl,
        disableRedirect: true,
        subscriptionId: subscription?.id,
      },
      headers: await headers(),
    });
    // The stripe plugin may return either a redirect object or a Checkout Session.
    const url: string | null | undefined =
      ("redirect" in res ? (res as { url: string }).url : undefined) ??
      ("id" in res && (res as any).object === "checkout.session"
        ? (res as { url?: string | null }).url
        : undefined);
    if (!url) {
      throw new UserFacingError("Failed to get Stripe checkout URL");
    }
    return url;
  },
  { defaultErrorMessage: "Failed to get Stripe checkout URL" },
);

export const getStripeBillingPortalUrl = userOnlyAction(
  async function getStripeBillingPortalUrl(): Promise<string> {
    assertStripeConfigured();

    const returnUrl = `${publicAppUrl()}/settings/billing`;
    const res = await auth.api.createBillingPortal({
      body: {
        returnUrl,
        locale: "auto",
      },
      headers: await headers(),
    });
    const url: string | undefined = res?.url;
    if (!url) {
      throw new UserFacingError("Failed to get Stripe billing portal URL");
    }
    return url;
  },
  { defaultErrorMessage: "Failed to get Stripe billing portal URL" },
);

export const setSignupTrialPlan = userOnlyAction(
  async function setSignupTrialPlan(userId: string, plan: AccessTier) {
    console.log("setSignupTrialPlan", userId, plan);
    await setSignupTrialPlanForUser({ db, userId, plan });
  },
  { defaultErrorMessage: "Failed to set signup trial plan" },
);
