import Stripe from "stripe";
import { env } from "@terragon/env/apps-www";

export function isStripeConfigured(): boolean {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    console.warn(
      "Stripe is not configured - missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET",
    );
    return false;
  }
  if (!env.STRIPE_PRICE_CORE_MONTHLY || !env.STRIPE_PRICE_PRO_MONTHLY) {
    console.warn(
      "Stripe is not configured - missing STRIPE_PRICE_CORE_MONTHLY or STRIPE_PRICE_PRO_MONTHLY",
    );
    return false;
  }
  return true;
}

export function isStripeConfiguredForCredits(): boolean {
  if (!isStripeConfigured()) {
    return false;
  }
  if (!env.STRIPE_PRICE_CREDIT_PACK) {
    console.warn("Stripe is not configured - missing STRIPE_PRICE_CREDIT_PACK");
    return false;
  }
  return true;
}

export function assertStripeConfigured(): void {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured");
  }
}

export function assertStripeConfiguredForCredits(): void {
  if (!isStripeConfiguredForCredits()) {
    throw new Error("Stripe is not configured for credits");
  }
}

export function getStripeClient(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured");
  }
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export const STRIPE_PLAN_CONFIGS = [
  ...(env.STRIPE_PRICE_CORE_MONTHLY
    ? [{ name: "core", priceId: env.STRIPE_PRICE_CORE_MONTHLY }]
    : []),
  ...(env.STRIPE_PRICE_PRO_MONTHLY
    ? [{ name: "pro", priceId: env.STRIPE_PRICE_PRO_MONTHLY }]
    : []),
];

export function getStripeWebhookSecret(): string {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured");
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

export function getStripeCreditPackPriceId(): string {
  if (!isStripeConfiguredForCredits()) {
    throw new Error("Stripe is not configured for credits");
  }
  return env.STRIPE_PRICE_CREDIT_PACK;
}

/**
 * Wrappers for Stripe API methods to make them easier to mock in tests
 */
export async function stripeCheckoutSessionsCreate(
  params: Stripe.Checkout.SessionCreateParams,
) {
  return getStripeClient().checkout.sessions.create(params);
}

export async function stripeCustomersCreate(
  params: Stripe.CustomerCreateParams,
) {
  return getStripeClient().customers.create(params);
}

export function stripeInvoicesCreate(params: Stripe.InvoiceCreateParams) {
  return getStripeClient().invoices.create(params);
}

export function stripeInvoiceItemsCreate(
  params: Stripe.InvoiceItemCreateParams,
) {
  return getStripeClient().invoiceItems.create(params);
}

export function stripeInvoicesFinalizeInvoice(invoiceId: string) {
  return getStripeClient().invoices.finalizeInvoice(invoiceId);
}

export function stripeInvoicesPay(
  invoiceId: string,
  params: Stripe.InvoicePayParams,
) {
  return getStripeClient().invoices.pay(invoiceId, params);
}

export function stripeCouponsCreate(params: Stripe.CouponCreateParams) {
  return getStripeClient().coupons.create(params);
}

export function stripePromotionCodesCreate(
  params: Stripe.PromotionCodeCreateParams,
  options?: Stripe.RequestOptions,
) {
  return getStripeClient().promotionCodes.create(params, options);
}
