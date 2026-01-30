import { TopBanner } from "@/components/system/top-banner";
import { BannerBar } from "@/components/system/banner-bar";
import { BannerPriorityGate } from "@/components/system/banner-container.client";
import { getUserIdOrNull } from "@/lib/auth-server";
import { isStripeConfigured } from "@/server-lib/stripe";
import { getBillingInfo } from "@/lib/subscription";
import { db } from "@/lib/db";
import { getFeatureFlagsGlobal } from "@terragon/shared/model/feature-flags";
import { publicDocsUrl } from "@terragon/env/next-public";
import Link from "next/link";

/**
 * Shows at most one banner, in priority order:
 * 1) Shutdown banner (if shutdown mode enabled)
 * 2) Impersonation banner (client-side, if admin is impersonating)
 * 3) Subscription banner if the logged-in user lacks active access
 * 4) Otherwise, the TopBanner (global/admin-configured or outage-driven)
 */
export async function BannerContainer() {
  const userId = await getUserIdOrNull();
  const flags = await getFeatureFlagsGlobal({ db });

  // Shutdown banner has highest priority
  if (flags.shutdownMode) {
    return (
      <BannerBar id="shutdown-banner">
        Terragon is shutting down on February 9th, 2026.{" "}
        <Link
          href={`${publicDocsUrl()}/docs/resources/shutdown`}
          className="underline"
        >
          Learn more
        </Link>
      </BannerBar>
    );
  }

  // Subscription priority (only when Stripe configured)
  if (userId) {
    if (isStripeConfigured()) {
      const billingInfo = await getBillingInfo();
      // Show a banner if the user is not subscribed and not on a signup trial
      if (
        !billingInfo.hasActiveSubscription &&
        !billingInfo.signupTrial?.isActive
      ) {
        const bannerText = billingInfo.unusedPromotionCode
          ? "Upgrade to continue using Terragon. Enjoy 2 months free applied at checkout."
          : "Upgrade to continue using Terragon.";
        // Render through the client priority gate so impersonation always wins.
        return (
          <BannerPriorityGate>
            <BannerBar
              className="subscription-banner"
              rightSlot={
                <Link
                  href="/settings/billing"
                  className="inline-flex items-center hover:opacity-80 transition-opacity"
                  aria-label="Upgrade on billing settings"
                >
                  Upgrade
                </Link>
              }
            >
              {bannerText}
            </BannerBar>
          </BannerPriorityGate>
        );
      }
    }
  }

  // Otherwise, render the configured global banner if present, still gated.
  return (
    <BannerPriorityGate>
      <TopBanner />
    </BannerPriorityGate>
  );
}
