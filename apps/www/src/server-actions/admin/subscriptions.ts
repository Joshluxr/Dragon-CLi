"use server";

import { adminOnly } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { User } from "@terragon/shared";
import { getStripeClient } from "@/server-lib/stripe";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import * as schema from "@terragon/shared/db/schema";

export type CancelAllResult = {
  success: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
};

export const getActiveSubscriptionCount = adminOnly(
  async function getActiveSubscriptionCount(_adminUser: User) {
    const subscriptions = await db
      .select({ id: schema.subscription.id })
      .from(schema.subscription)
      .where(
        and(
          inArray(schema.subscription.status, [
            "active",
            "trialing",
            "past_due",
          ]),
          isNotNull(schema.subscription.stripeSubscriptionId),
          eq(schema.subscription.cancelAtPeriodEnd, false),
        ),
      );
    return subscriptions.length;
  },
);

export const cancelAllSubscriptionsAtPeriodEnd = adminOnly(
  async function cancelAllSubscriptionsAtPeriodEnd(
    adminUser: User,
  ): Promise<CancelAllResult> {
    console.log(
      `[Admin] ${adminUser.email} initiated cancel all subscriptions at period end`,
    );

    const stripe = getStripeClient();

    const activeSubscriptions = await db
      .select()
      .from(schema.subscription)
      .where(
        and(
          inArray(schema.subscription.status, [
            "active",
            "trialing",
            "past_due",
          ]),
          isNotNull(schema.subscription.stripeSubscriptionId),
          eq(schema.subscription.cancelAtPeriodEnd, false),
        ),
      );

    const results: CancelAllResult = { success: 0, failed: 0, errors: [] };

    for (const sub of activeSubscriptions) {
      try {
        await stripe.subscriptions.update(sub.stripeSubscriptionId!, {
          cancel_at_period_end: true,
        });
        results.success++;
        console.log(
          `[Admin] Canceled subscription ${sub.id} (${sub.stripeSubscriptionId}) at period end`,
        );
      } catch (error) {
        results.failed++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.errors.push({ id: sub.id, error: errorMessage });
        console.error(
          `[Admin] Failed to cancel subscription ${sub.id}: ${errorMessage}`,
        );
      }
    }

    console.log(
      `[Admin] Cancel all subscriptions complete: ${results.success} success, ${results.failed} failed`,
    );

    return results;
  },
);
