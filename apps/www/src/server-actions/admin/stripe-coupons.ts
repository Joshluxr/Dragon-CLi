"use server";

import { randomBytes } from "node:crypto";
import * as z from "zod/v4";
import { adminOnly } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  user as userTable,
  userStripePromotionCode,
} from "@terragon/shared/db/schema";
import { asc, inArray, lt } from "drizzle-orm";
import {
  stripeCouponsCreate,
  stripePromotionCodesCreate,
} from "@/server-lib/stripe";
import { assertStripeConfigured } from "@/server-lib/stripe";

type GenerateCouponsInput = {
  beforeDate: string;
};

export type GenerateCouponsResult = {
  created: number;
  skipped: number;
  couponId: string | null;
  promotionCodes: Array<{
    id: string;
    userId: string;
    email: string;
    code: string;
    stripePromotionCodeId: string;
    stripeCouponId: string;
    createdAt: string;
  }>;
};

const inputSchema = z.object({
  beforeDate: z.coerce.date(),
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PREFIX = "TERRAGON";
const CODE_LENGTH = 10;

function generateCouponCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let body = "";
  for (const byte of bytes) {
    body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `${CODE_PREFIX}-${body}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPromotionCodeWithRetry(
  args: {
    couponId: string;
    userId: string;
    adminUserId: string;
    code: string;
  },
  opts?: { maxRetries?: number; baseDelayMs?: number },
) {
  const { couponId, userId, adminUserId, code } = args;
  const maxRetries = opts?.maxRetries ?? 5;
  const baseDelayMs = opts?.baseDelayMs ?? 800; // backoff base

  let attempt = 0;
  // Use a stable idempotency key so retries don't duplicate creations
  const idempotencyKey = `promo_${couponId}_${userId}`;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await stripePromotionCodesCreate(
        {
          coupon: couponId,
          code,
          metadata: {
            user_id: userId,
            created_by_user_id: adminUserId,
          },
          max_redemptions: 1,
        },
        { idempotencyKey },
      );
    } catch (err) {
      attempt += 1;
      const isRateLimit =
        (err as any)?.statusCode === 429 ||
        (err as any)?.type === "rate_limit_error";

      if (!isRateLimit || attempt > maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1); // exponential backoff
      await sleep(delay);
    }
  }
}

export const generateStripeCouponsForUsers = adminOnly(
  async (
    adminUser,
    input: GenerateCouponsInput,
  ): Promise<GenerateCouponsResult> => {
    assertStripeConfigured();
    const { beforeDate } = inputSchema.parse(input);

    // Include the entire selected day by comparing with the next day's start (UTC).
    const cutoff = new Date(beforeDate);
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() + 1);

    const eligibleUsers = await db
      .select({
        id: userTable.id,
        email: userTable.email,
      })
      .from(userTable)
      .where(lt(userTable.createdAt, cutoff))
      .orderBy(asc(userTable.createdAt));

    if (eligibleUsers.length === 0) {
      return {
        created: 0,
        skipped: 0,
        couponId: null,
        promotionCodes: [],
      };
    }

    const userIds = eligibleUsers.map((user) => user.id);

    const existingCodes =
      userIds.length === 0
        ? []
        : await db
            .select({ userId: userStripePromotionCode.userId })
            .from(userStripePromotionCode)
            .where(inArray(userStripePromotionCode.userId, userIds));

    const existingUserIds = new Set(existingCodes.map((row) => row.userId));
    const usersToProcess = eligibleUsers.filter(
      (user) => !existingUserIds.has(user.id),
    );

    const skipped = eligibleUsers.length - usersToProcess.length;

    if (usersToProcess.length === 0) {
      return {
        created: 0,
        skipped,
        couponId: null,
        promotionCodes: [],
      };
    }

    const coupon = await stripeCouponsCreate({
      duration: "repeating",
      duration_in_months: 2,
      percent_off: 100,
      name: "Two months free",
      metadata: {
        created_by_user_id: adminUser.id,
        created_for: "legacy-users",
      },
    });

    const emailByUserId = new Map(
      usersToProcess.map((record) => [record.id, record.email] as const),
    );
    const insertedRecords: Array<{
      id: string;
      userId: string;
      code: string;
      stripePromotionCodeId: string;
      stripeCouponId: string;
      createdAt: Date | null;
    }> = [];

    // Throttle creation to avoid Stripe rate limits.
    // We create codes sequentially with periodic sleeps and retry on 429s.
    const BATCH_SIZE = 25;
    const BATCH_SLEEP_MS = 1500;

    for (let i = 0; i < usersToProcess.length; i++) {
      const user = usersToProcess[i]!;
      const code = generateCouponCode();

      const promotion = await createPromotionCodeWithRetry(
        {
          couponId: coupon.id,
          userId: user.id,
          adminUserId: adminUser.id,
          code,
        },
        { maxRetries: 5, baseDelayMs: 800 },
      );

      const [inserted] = await db
        .insert(userStripePromotionCode)
        .values({
          userId: user.id,
          stripeCouponId: coupon.id,
          stripePromotionCodeId: promotion.id,
          code: promotion.code ?? code,
          createdByUserId: adminUser.id,
        })
        .onConflictDoNothing({ target: userStripePromotionCode.userId })
        .returning({
          id: userStripePromotionCode.id,
          userId: userStripePromotionCode.userId,
          code: userStripePromotionCode.code,
          stripePromotionCodeId: userStripePromotionCode.stripePromotionCodeId,
          stripeCouponId: userStripePromotionCode.stripeCouponId,
          createdAt: userStripePromotionCode.createdAt,
        });

      if (inserted) {
        insertedRecords.push(inserted);
      }

      if ((i + 1) % BATCH_SIZE === 0) {
        await sleep(BATCH_SLEEP_MS);
      }
    }

    return {
      created: insertedRecords.length,
      skipped,
      couponId: coupon.id,
      promotionCodes: insertedRecords.map((record) => ({
        id: record.id,
        userId: record.userId,
        email: emailByUserId.get(record.userId) ?? "",
        code: record.code,
        stripePromotionCodeId: record.stripePromotionCodeId,
        stripeCouponId: record.stripeCouponId,
        createdAt: (record.createdAt ?? new Date()).toISOString(),
      })),
    };
  },
);
