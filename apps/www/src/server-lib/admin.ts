import { db } from "@/lib/db";
import * as schema from "@terragon/shared/db/schema";
import { User } from "@terragon/shared";
import { inArray, eq, count, sql } from "drizzle-orm";
import { getSignupTrialInfo } from "@terragon/shared/model/subscription";

export type UserForAdminPage<T extends User = User> = T & {
  numThreads: number;
  mostRecentThreadDate: Date | null;
  threadsCreatedPastDay: number;
  threadsCreatedPastWeek: number;
  onboardingCompleted: boolean;
  signupTrialDaysRemaining: number;
  accessTierInfo: string | null;
};

export async function getUserListForAdminPage<T extends User = User>(
  users: T[],
): Promise<UserForAdminPage<T>[]> {
  const [userInfoArray, userInfoAgg] = await Promise.all([
    db
      .select({
        userId: schema.user.id,
        onboardingCompleted: schema.userFlags.hasSeenOnboarding,
        subscription: schema.subscription,
      })
      .from(schema.user)
      .where(
        inArray(
          schema.user.id,
          users.map((user) => user.id),
        ),
      )
      .leftJoin(schema.userFlags, eq(schema.user.id, schema.userFlags.userId))
      .leftJoin(
        schema.subscription,
        eq(schema.user.id, schema.subscription.referenceId),
      ),
    db
      .select({
        userId: schema.thread.userId,
        numThreads: count(schema.thread.id),
        threadsCreatedPastDay: sql<number>`COUNT(CASE WHEN ${schema.thread.createdAt} >= NOW() - INTERVAL '1 day' THEN 1 END)::int`,
        threadsCreatedPastWeek: sql<number>`COUNT(CASE WHEN ${schema.thread.createdAt} >= NOW() - INTERVAL '7 days' THEN 1 END)::int`,
        mostRecentThreadDate:
          sql<Date>`MAX(${schema.thread.createdAt} AT TIME ZONE 'UTC')`.as(
            "most_recent_thread_date",
          ),
      })
      .from(schema.user)
      .where(
        inArray(
          schema.user.id,
          users.map((user) => user.id),
        ),
      )
      .leftJoin(schema.thread, eq(schema.user.id, schema.thread.userId))
      .groupBy(schema.thread.userId),
  ]);

  const userInfoMap: Record<string, (typeof userInfoArray)[number]> = {};
  for (const row of userInfoArray) {
    userInfoMap[row.userId] = row;
  }
  const userInfoAggMap: Record<string, (typeof userInfoAgg)[number]> = {};
  for (const row of userInfoAgg) {
    userInfoAggMap[row.userId!] = row;
  }

  return users.map((user) => {
    const info = userInfoMap[user.id]!;
    const infoAgg = userInfoAggMap[user.id];

    let accessTierInfo: string | null = null;
    const signupTrial = getSignupTrialInfo(user);
    const subscription = info.subscription;
    if (subscription) {
      const isActive =
        (subscription.status === "active" ||
          subscription.status === "past_due") &&
        subscription.periodEnd &&
        subscription.periodEnd >= new Date();
      accessTierInfo = isActive
        ? subscription.plan
        : `${subscription.plan} (${subscription.status})`;
    } else if (signupTrial?.isActive) {
      accessTierInfo = `${signupTrial.plan} (trial)`;
    }
    return {
      ...user,
      mostRecentThreadDate: infoAgg?.mostRecentThreadDate ?? null,
      numThreads: infoAgg?.numThreads ?? 0,
      threadsCreatedPastDay: infoAgg?.threadsCreatedPastDay ?? 0,
      threadsCreatedPastWeek: infoAgg?.threadsCreatedPastWeek ?? 0,
      onboardingCompleted: info.onboardingCompleted ?? false,
      signupTrialDaysRemaining: signupTrial?.daysRemaining ?? 0,
      accessTierInfo,
    };
  });
}
