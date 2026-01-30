"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { UserFacingError } from "@/lib/server-actions";
import { publicAppUrl } from "@dragon/env/next-public";
import { CREDIT_TOP_UP_REASON } from "@/server-lib/stripe-credit-top-ups";
import { ensureStripeCustomer } from "@/server-lib/stripe-helpers";
import { getStripeCreditPackPriceId } from "@/server-lib/stripe";
import {
  stripeCheckoutSessionsCreate,
  getStripeClient,
} from "@/server-lib/stripe";
import { assertStripeConfiguredForCredits } from "@/server-lib/stripe";

export const createCreditTopUpCheckoutSession = userOnlyAction(
  async function createCreditTopUpCheckoutSession(userId: string) {
    assertStripeConfiguredForCredits();
    const { customerId } = await ensureStripeCustomer({ userId });
    const session = await stripeCheckoutSessionsCreate({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          price: getStripeCreditPackPriceId(),
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata: {
            dragon_user_id: userId,
            reason: CREDIT_TOP_UP_REASON,
          },
        },
      },
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          dragon_user_id: userId,
          reason: CREDIT_TOP_UP_REASON,
        },
      },
      metadata: {
        dragon_user_id: userId,
        reason: CREDIT_TOP_UP_REASON,
      },
      success_url: `${publicAppUrl()}/settings/agent?topup=success`,
      cancel_url: `${publicAppUrl()}/settings/agent?topup=cancelled`,
    });
    if (!session.url) {
      throw new UserFacingError("Failed to create Stripe checkout session");
    }
    return session.url;
  },
  { defaultErrorMessage: "Failed to create Stripe checkout session" },
);

export const createManagePaymentsSession = userOnlyAction(
  async function createManagePaymentsSession(userId: string) {
    assertStripeConfiguredForCredits();
    const stripe = getStripeClient();
    const { customerId } = await ensureStripeCustomer({ userId });
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${publicAppUrl()}/settings/agent`,
    });
    return session.url;
  },
  { defaultErrorMessage: "Failed to create Stripe billing portal session" },
);
