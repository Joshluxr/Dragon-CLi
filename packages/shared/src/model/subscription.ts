import { DB } from "../db";
import * as schema from "../db/schema";
import {
  SubscriptionInfo,
  User,
  SignupTrialInfo,
  StripePromotionCode,
  AccessTier,
} from "../db/types";
import { getUser, updateUser } from "./user";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";

// Number of days a new account has free trial access
const SIGNUP_TRIAL_DAYS = 14;

function diffInDaysCeil(later: Date, earlier: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((later.getTime() - earlier.getTime()) / msPerDay);
}
/**
 * Returns remaining signup-trial days for a specific user id.
 * 0 when expired or user not found.
 */
export function getSignupTrialInfo(
  user: Pick<User, "createdAt" | "signupTrialPlan">,
): SignupTrialInfo | null {
  if (!user.createdAt) {
    return null;
  }
  const trialEndsAt = new Date(
    user.createdAt.getTime() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000,
  );
  const daysRemaining = Math.max(0, diffInDaysCeil(trialEndsAt, new Date()));
  const isActive = daysRemaining > 0;
  const plan = user.signupTrialPlan === "pro" ? "pro" : "core";
  return {
    isActive,
    daysRemaining,
    plan,
    trialEndsAt: trialEndsAt.toISOString(),
  };
}

export async function getSignupTrialInfoForUser({
  db,
  userId,
}: {
  db: DB;
  userId: string;
}): Promise<SignupTrialInfo | null> {
  const user = await getUser({ db, userId });
  if (!user) {
    return null;
  }
  return getSignupTrialInfo(user);
}

export async function getSubscriptionInfoForUser({
  db,
  userId,
  isActive = true,
}: {
  db: DB;
  userId: string;
  isActive?: boolean;
}): Promise<SubscriptionInfo | null> {
  const where = [eq(schema.subscription.referenceId, userId)];
  if (isActive) {
    where.push(inArray(schema.subscription.status, ["active", "past_due"]));
    where.push(gte(schema.subscription.periodEnd, new Date()));
  }
  const result = await db
    .select({
      id: schema.subscription.id,
      plan: schema.subscription.plan,
      status: schema.subscription.status,
      periodStart: schema.subscription.periodStart,
      periodEnd: schema.subscription.periodEnd,
      trialStart: schema.subscription.trialStart,
      trialEnd: schema.subscription.trialEnd,
      cancelAtPeriodEnd: schema.subscription.cancelAtPeriodEnd,
    })
    .from(schema.subscription)
    .where(and(...where))
    .limit(1);
  if (!result[0]) {
    return null;
  }
  const subscription = result[0]!;
  return {
    ...subscription,
    isActive:
      (subscription.status === "active" ||
        subscription.status === "past_due") &&
      !!subscription.periodEnd &&
      subscription.periodEnd >= new Date(),
  };
}

export async function getUnusedPromotionCodeForUser({
  db,
  userId,
}: {
  db: DB;
  userId: string;
}): Promise<StripePromotionCode | null> {
  const result = await db.query.userStripePromotionCode.findFirst({
    where: and(
      eq(schema.userStripePromotionCode.userId, userId),
      isNull(schema.userStripePromotionCode.redeemedAt),
    ),
    columns: {
      code: true,
      stripeCouponId: true,
      stripePromotionCodeId: true,
    },
  });
  return result ?? null;
}

export async function setSignupTrialPlanForUser({
  db,
  userId,
  plan,
}: {
  db: DB;
  userId: string;
  plan: AccessTier;
}): Promise<void> {
  const user = await getUser({ db, userId });
  if (!user) {
    throw new Error("User not found");
  }
  const signupTrialInfo = getSignupTrialInfo(user);
  if (!signupTrialInfo?.isActive) {
    throw new Error("User is not on a signup trial");
  }
  await updateUser({ db, userId, updates: { signupTrialPlan: plan } });
}
