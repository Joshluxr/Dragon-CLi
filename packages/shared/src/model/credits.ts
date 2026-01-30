import { and, desc, eq, inArray, sql, sum } from "drizzle-orm";
import type { DB } from "../db";
import * as schema from "../db/schema";
import type {
  UsageEventType,
  UsageSku,
  UserCredit,
  UserCreditGrantType,
} from "../db/types";
import { calculateUsageCostUsd } from "./usage-pricing";
import { publishBroadcastUserMessage } from "../broadcast-server";

export type UserBalanceSummary = {
  totalCreditsCents: number;
  totalUsageCents: number;
  balanceCents: number;
};

export const BILLABLE_EVENT_TYPES: UsageEventType[] = [
  "billable_openai_usd",
  "billable_anthropic_usd",
  "billable_openrouter_usd",
  "billable_google_usd",
];

export type UserCreditGrant = {
  userId: string;
  amountCents: number;
  description?: string | null;
  referenceId?: string | null;
  grantType: UserCreditGrantType;
};

export async function grantUserCredits({
  db,
  grants,
}: {
  db: DB;
  grants: UserCreditGrant;
}): Promise<void> {
  await db.insert(schema.userCredits).values(grants);
  await publishBroadcastUserMessage({
    type: "user",
    id: grants.userId,
    data: {
      userCredits: true,
    },
  });
}

export async function getUserCreditBalance({
  db,
  userId,
  skipAggCache,
}: {
  db: DB;
  userId: string;
  skipAggCache?: boolean;
}): Promise<UserBalanceSummary> {
  const upToDate = new Date();
  const usageAggregatesPromise = skipAggCache
    ? getUsageAggregatesFromUsageEvents({ db, userId })
    : getUsageAggregatesFromCache({ db, userId, upToDate });

  const [credits, usageAggregates] = await Promise.all([
    db
      .select({ amountCents: schema.userCredits.amountCents })
      .from(schema.userCredits)
      .where(eq(schema.userCredits.userId, userId)),
    usageAggregatesPromise,
  ]);
  const totalCreditsCents = credits.reduce(
    (sum, credit) => sum + Number(credit.amountCents ?? 0),
    0,
  );
  const totalUsageCents = sumAggregatedUsageCents(usageAggregates);
  const balanceCents = totalCreditsCents - totalUsageCents;
  return {
    totalCreditsCents,
    totalUsageCents,
    balanceCents,
  };
}

export function decimalValueToCents(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const raw = typeof value === "number" ? value.toString() : `${value}`;
  const trimmed = raw.trim();
  if (!trimmed) {
    return 0;
  }

  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [wholePartRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const wholePart = wholePartRaw.replace(/\D/g, "") || "0";
  const fractionDigits = (fractionRaw.replace(/\D/g, "") + "000").slice(0, 3);
  const centsDigits = fractionDigits.slice(0, 2) || "00";
  const roundingDigit = fractionDigits[2] ? Number(fractionDigits[2]) : 0;

  let cents = BigInt(wholePart) * 100n + BigInt(centsDigits);
  if (roundingDigit >= 5) {
    cents += 1n;
  }

  if (negative) {
    cents = -cents;
  }

  return Number(cents);
}

export function usdNumberToCents(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }
  const normalized = value.toFixed(6);
  return decimalValueToCents(normalized);
}

export function sumAggregatedUsageCents(
  aggregates: {
    sku: UsageSku | null;
    inputTokens: number | string | bigint | null;
    cachedInputTokens: number | string | bigint | null;
    cacheCreationInputTokens: number | string | bigint | null;
    outputTokens: number | string | bigint | null;
  }[],
) {
  let total = 0;

  for (const aggregate of aggregates) {
    const sku = (aggregate.sku ?? null) as UsageSku | null;
    const cachedReads = Number(aggregate.cachedInputTokens ?? 0);
    const usage = {
      inputTokens: Number(aggregate.inputTokens ?? 0),
      cachedInputTokens: cachedReads,
      cacheCreationInputTokens: Number(aggregate.cacheCreationInputTokens ?? 0),
      outputTokens: Number(aggregate.outputTokens ?? 0),
    };

    if (!sku) {
      continue;
    }

    const costUsd = calculateUsageCostUsd({ sku, usage });
    total += usdNumberToCents(costUsd);
  }

  return total;
}

export async function getUserCredits({
  db,
  userId,
  grantType,
  referenceId,
  limit = 5,
}: {
  db: DB;
  userId: string;
  grantType?: UserCreditGrantType;
  referenceId?: string;
  limit?: number;
}): Promise<UserCredit[]> {
  const where = [eq(schema.userCredits.userId, userId)];
  if (referenceId) {
    where.push(eq(schema.userCredits.referenceId, referenceId));
  }
  if (grantType) {
    where.push(eq(schema.userCredits.grantType, grantType));
  }
  const credits = await db.query.userCredits.findMany({
    where: and(...where),
    orderBy: desc(schema.userCredits.createdAt),
    limit,
  });
  return credits;
}

export async function updateUsageEventsAggCacheForUser({
  db,
  userId,
  upToDate,
}: {
  db: DB;
  userId: string;
  upToDate: Date;
}) {
  const billableEventTypesSql = sql.join(
    BILLABLE_EVENT_TYPES.map((eventType) => sql`${eventType}`),
    sql`, `,
  );
  const upToDateTimestampSql = sql`(${upToDate}) AT TIME ZONE 'UTC'`;

  await db.transaction(async (tx) => {
    // 1) Ensure cache rows exist for every (sku,event_type) we might touch up to upToDate
    await tx.execute(sql`
      INSERT INTO usage_events_agg_cache_sku (user_id, sku, event_type)
      SELECT DISTINCT ue.user_id, ue.sku, ue.event_type
      FROM usage_events ue
      WHERE ue.user_id = ${userId}
        AND ue.event_type IN (${billableEventTypesSql})
        AND ue.created_at <= ${upToDateTimestampSql}
      ON CONFLICT (user_id, sku, event_type) DO NOTHING
    `);

    // 2) Lock all cache rows for this user (serializes per (user,sku,eventType))
    await tx.execute(sql`
      SELECT 1
      FROM usage_events_agg_cache_sku
      WHERE user_id = ${userId}
      FOR UPDATE
    `);

    // 3) Compute deltas since each row’s watermark and apply them in one UPDATE
    await tx.execute(sql`
      WITH locked AS (
        SELECT user_id, sku, event_type, last_usage_ts, last_usage_id
        FROM usage_events_agg_cache_sku
        WHERE user_id = ${userId}
        FOR UPDATE
      ),
      deltas AS (
        SELECT
          l.user_id,
          l.sku,
          l.event_type,
          COALESCE(SUM(ue.input_tokens), 0)::bigint                 AS sum_input,
          COALESCE(SUM(ue.cached_input_tokens), 0)::bigint         AS sum_cached_input,
          COALESCE(SUM(ue.cache_creation_input_tokens), 0)::bigint AS sum_cache_create_input,
          COALESCE(SUM(ue.output_tokens), 0)::bigint               AS sum_output,
          MAX(ue.created_at)                                       AS max_ts,
          -- deterministic pick among rows at the max timestamp
          (CASE WHEN MAX(ue.created_at) IS NULL THEN NULL
                ELSE (ARRAY_AGG(ue.id ORDER BY ue.created_at DESC, ue.id DESC))[1]
           END)                                                    AS max_id
        FROM locked l
        LEFT JOIN usage_events ue
         ON ue.user_id = l.user_id
        AND ue.sku IS NOT DISTINCT FROM l.sku
        AND ue.event_type = l.event_type
        AND ue.event_type IN (${billableEventTypesSql})
        AND ue.created_at <= ${upToDateTimestampSql}
        AND (
             (l.last_usage_ts IS NULL AND l.last_usage_id IS NULL)
          OR (ue.created_at, ue.id) > (l.last_usage_ts, l.last_usage_id)
         )
        GROUP BY l.user_id, l.sku, l.event_type
      )
      UPDATE usage_events_agg_cache_sku c
      SET
        input_tokens                 = c.input_tokens                 + d.sum_input,
        cached_input_tokens          = c.cached_input_tokens          + d.sum_cached_input,
        cache_creation_input_tokens  = c.cache_creation_input_tokens  + d.sum_cache_create_input,
        output_tokens                = c.output_tokens                + d.sum_output,
        last_usage_ts                = GREATEST(c.last_usage_ts, d.max_ts),
        last_usage_id                = CASE
                                         WHEN d.max_ts IS NULL THEN c.last_usage_id
                                         WHEN c.last_usage_ts IS DISTINCT FROM d.max_ts THEN d.max_id
                                         ELSE GREATEST(c.last_usage_id, d.max_id)
                                       END,
        updated_at = now()
      FROM deltas d
      WHERE c.user_id = d.user_id
        AND c.sku IS NOT DISTINCT FROM d.sku
        AND c.event_type = d.event_type
    `);
  });
}

async function getUsageAggregatesFromCache({
  db,
  userId,
  upToDate,
}: {
  db: DB;
  userId: string;
  upToDate: Date;
}) {
  await updateUsageEventsAggCacheForUser({ db, userId, upToDate });

  return db
    .select({
      sku: schema.usageEventsAggCacheSku.sku,
      inputTokens: schema.usageEventsAggCacheSku.inputTokens,
      cachedInputTokens: schema.usageEventsAggCacheSku.cachedInputTokens,
      cacheCreationInputTokens:
        schema.usageEventsAggCacheSku.cacheCreationInputTokens,
      outputTokens: schema.usageEventsAggCacheSku.outputTokens,
    })
    .from(schema.usageEventsAggCacheSku)
    .where(
      and(
        eq(schema.usageEventsAggCacheSku.userId, userId),
        inArray(schema.usageEventsAggCacheSku.eventType, BILLABLE_EVENT_TYPES),
      ),
    );
}

async function getUsageAggregatesFromUsageEvents({
  db,
  userId,
}: {
  db: DB;
  userId: string;
}) {
  return db
    .select({
      sku: schema.usageEvents.sku,
      inputTokens: sum(schema.usageEvents.inputTokens),
      cachedInputTokens: sum(schema.usageEvents.cachedInputTokens),
      cacheCreationInputTokens: sum(
        schema.usageEvents.cacheCreationInputTokens,
      ),
      outputTokens: sum(schema.usageEvents.outputTokens),
    })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        inArray(schema.usageEvents.eventType, BILLABLE_EVENT_TYPES),
      ),
    )
    .groupBy(schema.usageEvents.eventType, schema.usageEvents.sku);
}
