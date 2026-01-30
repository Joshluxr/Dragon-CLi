/**
 * Usage Dashboard Model Functions
 *
 * Database operations for usage analytics and cost tracking.
 */

import { and, eq, gte, asc, sum, sql } from "drizzle-orm";
import { dailyUsageStats, userCostLimit } from "../db/schema";
import { DB } from "../db";
import type {
  AgentStats,
  DailyUsageData,
  UsageSummary,
  CostLimits,
  UsageTrackingData,
} from "./usage-tracker";
import {
  calculateCost,
  getCurrentDateString,
  calculateTrend,
} from "./usage-tracker";
import type { AIAgent } from "@terragon/agent/types";

export interface UpdateDailyStatsArgs {
  db: DB;
  userId: string;
  date: string;
  data: {
    tasks: number;
    successful: number;
    failed: number;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    durationMs: number;
    agent: AIAgent;
  };
}

export async function updateDailyStats({
  db,
  userId,
  date,
  data,
}: UpdateDailyStatsArgs): Promise<void> {
  const existing = await db.query.dailyUsageStats.findFirst({
    where: and(
      eq(dailyUsageStats.userId, userId),
      eq(dailyUsageStats.date, date),
    ),
  });

  if (existing) {
    // Update existing stats
    const byAgent = (existing.byAgent as Record<string, AgentStats>) || {};
    const agentKey = data.agent;

    if (!byAgent[agentKey]) {
      byAgent[agentKey] = {
        tasks: 0,
        successful: 0,
        failed: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        durationMs: 0,
      };
    }

    byAgent[agentKey].tasks += data.tasks;
    byAgent[agentKey].successful += data.successful;
    byAgent[agentKey].failed += data.failed;
    byAgent[agentKey].inputTokens += data.inputTokens;
    byAgent[agentKey].outputTokens += data.outputTokens;
    byAgent[agentKey].costCents += data.costCents;
    byAgent[agentKey].durationMs += data.durationMs;

    await db
      .update(dailyUsageStats)
      .set({
        totalTasks: (existing.totalTasks || 0) + data.tasks,
        successfulTasks: (existing.successfulTasks || 0) + data.successful,
        failedTasks: (existing.failedTasks || 0) + data.failed,
        totalInputTokens: (existing.totalInputTokens || 0) + data.inputTokens,
        totalOutputTokens:
          (existing.totalOutputTokens || 0) + data.outputTokens,
        totalCostCents: (existing.totalCostCents || 0) + data.costCents,
        totalDurationMs: (existing.totalDurationMs || 0) + data.durationMs,
        byAgent,
        updatedAt: new Date(),
      })
      .where(eq(dailyUsageStats.id, existing.id));
  } else {
    // Create new stats
    const byAgent: Record<string, AgentStats> = {
      [data.agent]: {
        tasks: data.tasks,
        successful: data.successful,
        failed: data.failed,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        costCents: data.costCents,
        durationMs: data.durationMs,
      },
    };

    await db.insert(dailyUsageStats).values({
      userId,
      date,
      totalTasks: data.tasks,
      successfulTasks: data.successful,
      failedTasks: data.failed,
      totalInputTokens: data.inputTokens,
      totalOutputTokens: data.outputTokens,
      totalCostCents: data.costCents,
      totalDurationMs: data.durationMs,
      byAgent,
    });
  }
}

export interface TrackUsageArgs {
  db: DB;
  data: UsageTrackingData;
}

export async function trackUsage({ db, data }: TrackUsageArgs): Promise<void> {
  const costCents = calculateCost(data.model, data.usage);
  const date = getCurrentDateString();

  await updateDailyStats({
    db,
    userId: data.userId,
    date,
    data: {
      tasks: 1,
      successful: data.success ? 1 : 0,
      failed: data.success ? 0 : 1,
      inputTokens: data.usage.inputTokens,
      outputTokens: data.usage.outputTokens,
      costCents,
      durationMs: data.durationMs,
      agent: data.agent,
    },
  });
}

export interface GetDailyStatsArgs {
  db: DB;
  userId: string;
  startDate: string;
  endDate?: string;
}

export async function getDailyStats({
  db,
  userId,
  startDate,
  endDate,
}: GetDailyStatsArgs): Promise<DailyUsageData[]> {
  const conditions = [
    eq(dailyUsageStats.userId, userId),
    gte(dailyUsageStats.date, startDate),
  ];

  if (endDate) {
    const lessThanOrEq = sql`${dailyUsageStats.date} <= ${endDate}`;
    conditions.push(lessThanOrEq);
  }

  const stats = await db.query.dailyUsageStats.findMany({
    where: and(...conditions),
    orderBy: [asc(dailyUsageStats.date)],
  });

  return stats.map((s) => ({
    date: s.date,
    tasks: s.totalTasks || 0,
    successRate: s.totalTasks
      ? ((s.successfulTasks || 0) / s.totalTasks) * 100
      : 0,
    tokens: (s.totalInputTokens || 0) + (s.totalOutputTokens || 0),
    cost: (s.totalCostCents || 0) / 100,
    avgDuration: s.totalTasks
      ? (s.totalDurationMs || 0) / s.totalTasks / 1000
      : 0,
    byAgent: s.byAgent as Record<string, AgentStats> | null,
  }));
}

export interface GetUsageSummaryArgs {
  db: DB;
  userId: string;
  days: number;
}

export async function getUsageSummary({
  db,
  userId,
  days,
}: GetUsageSummaryArgs): Promise<UsageSummary> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - days);
  const startDateParts = startDate.toISOString().split("T");
  const startDateStr =
    startDateParts[0] ?? startDate.toISOString().slice(0, 10);

  // Previous period for trend calculation
  const prevStartDate = new Date(startDate);
  prevStartDate.setDate(startDate.getDate() - days);
  const prevStartDateParts = prevStartDate.toISOString().split("T");
  const prevStartDateStr =
    prevStartDateParts[0] ?? prevStartDate.toISOString().slice(0, 10);

  const currentStats = await getDailyStats({
    db,
    userId,
    startDate: startDateStr,
  });

  const previousStats = await getDailyStats({
    db,
    userId,
    startDate: prevStartDateStr,
    endDate: startDateStr,
  });

  const currentTotals = currentStats.reduce(
    (acc, s) => ({
      tasks: acc.tasks + s.tasks,
      successful: acc.successful + Math.round((s.successRate / 100) * s.tasks),
      tokens: acc.tokens + s.tokens,
      cost: acc.cost + s.cost,
    }),
    { tasks: 0, successful: 0, tokens: 0, cost: 0 },
  );

  const previousTotals = previousStats.reduce(
    (acc, s) => ({
      tasks: acc.tasks + s.tasks,
      successful: acc.successful + Math.round((s.successRate / 100) * s.tasks),
      cost: acc.cost + s.cost,
    }),
    { tasks: 0, successful: 0, cost: 0 },
  );

  const currentSuccessRate =
    currentTotals.tasks > 0
      ? (currentTotals.successful / currentTotals.tasks) * 100
      : 0;
  const previousSuccessRate =
    previousTotals.tasks > 0
      ? (previousTotals.successful / previousTotals.tasks) * 100
      : 0;

  return {
    tasks: currentTotals.tasks,
    tasksTrend: calculateTrend(currentTotals.tasks, previousTotals.tasks),
    successRate: currentSuccessRate,
    successRateTrend: calculateTrend(currentSuccessRate, previousSuccessRate),
    tokens: currentTotals.tokens,
    inputTokens: 0, // Would need additional tracking
    outputTokens: 0, // Would need additional tracking
    cacheReadTokens: 0, // Would need additional tracking
    cost: currentTotals.cost,
    costTrend: calculateTrend(currentTotals.cost, previousTotals.cost),
  };
}

export interface GetCostLimitsArgs {
  db: DB;
  userId: string;
}

export async function getCostLimits({
  db,
  userId,
}: GetCostLimitsArgs): Promise<CostLimits | null> {
  const limits = await db.query.userCostLimit.findFirst({
    where: eq(userCostLimit.userId, userId),
  });

  if (!limits) return null;

  return {
    dailyLimitCents: limits.dailyLimitCents,
    monthlyLimitCents: limits.monthlyLimitCents,
    alertThresholdPercent: limits.alertThresholdPercent,
    lastAlertAt: limits.lastAlertAt,
  };
}

export interface SetCostLimitsArgs {
  db: DB;
  userId: string;
  limits: Partial<CostLimits>;
}

export async function setCostLimits({
  db,
  userId,
  limits,
}: SetCostLimitsArgs): Promise<void> {
  const existing = await db.query.userCostLimit.findFirst({
    where: eq(userCostLimit.userId, userId),
  });

  if (existing) {
    await db
      .update(userCostLimit)
      .set({
        dailyLimitCents: limits.dailyLimitCents ?? existing.dailyLimitCents,
        monthlyLimitCents:
          limits.monthlyLimitCents ?? existing.monthlyLimitCents,
        alertThresholdPercent:
          limits.alertThresholdPercent ?? existing.alertThresholdPercent,
      })
      .where(eq(userCostLimit.id, existing.id));
  } else {
    await db.insert(userCostLimit).values({
      userId,
      dailyLimitCents: limits.dailyLimitCents ?? null,
      monthlyLimitCents: limits.monthlyLimitCents ?? null,
      alertThresholdPercent: limits.alertThresholdPercent ?? 80,
    });
  }
}

export interface CheckCostLimitsArgs {
  db: DB;
  userId: string;
}

export interface CostLimitCheck {
  exceededDaily: boolean;
  exceededMonthly: boolean;
  dailySpent: number;
  monthlySpent: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  alertRequired: boolean;
}

export async function checkCostLimits({
  db,
  userId,
}: CheckCostLimitsArgs): Promise<CostLimitCheck> {
  const limits = await getCostLimits({ db, userId });

  if (!limits) {
    return {
      exceededDaily: false,
      exceededMonthly: false,
      dailySpent: 0,
      monthlySpent: 0,
      dailyLimit: null,
      monthlyLimit: null,
      alertRequired: false,
    };
  }

  const today = getCurrentDateString();
  const monthStart = today.slice(0, 7) + "-01";

  // Get daily spending
  const dailyStats = await db.query.dailyUsageStats.findFirst({
    where: and(
      eq(dailyUsageStats.userId, userId),
      eq(dailyUsageStats.date, today),
    ),
  });

  // Get monthly spending
  const monthlyResult = await db
    .select({ total: sum(dailyUsageStats.totalCostCents) })
    .from(dailyUsageStats)
    .where(
      and(
        eq(dailyUsageStats.userId, userId),
        gte(dailyUsageStats.date, monthStart),
      ),
    );

  const dailySpent = dailyStats?.totalCostCents || 0;
  const monthlySpent = Number(monthlyResult[0]?.total || 0);

  const threshold = limits.alertThresholdPercent / 100;

  const exceededDaily = limits.dailyLimitCents
    ? dailySpent >= limits.dailyLimitCents
    : false;
  const exceededMonthly = limits.monthlyLimitCents
    ? monthlySpent >= limits.monthlyLimitCents
    : false;

  const dailyAlertRequired = limits.dailyLimitCents
    ? dailySpent >= limits.dailyLimitCents * threshold
    : false;
  const monthlyAlertRequired = limits.monthlyLimitCents
    ? monthlySpent >= limits.monthlyLimitCents * threshold
    : false;

  return {
    exceededDaily,
    exceededMonthly,
    dailySpent,
    monthlySpent,
    dailyLimit: limits.dailyLimitCents,
    monthlyLimit: limits.monthlyLimitCents,
    alertRequired: dailyAlertRequired || monthlyAlertRequired,
  };
}
