"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  getDailyStats,
  getUsageSummary,
  getCostLimits,
  setCostLimits,
} from "@terragon/shared/model/usage-dashboard";
import { getPostHogServer } from "@/lib/posthog-server";
import type {
  DailyUsageData,
  UsageSummary,
  CostLimits,
} from "@terragon/shared";

export const getUsageDataAction = userOnlyAction(
  async function getUsageDataAction(
    userId: string,
    { days }: { days: number },
  ): Promise<{ data: DailyUsageData[]; summary: UsageSummary }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateParts = startDate.toISOString().split("T");
    const startDateStr =
      startDateParts[0] ?? startDate.toISOString().slice(0, 10);

    const [data, summary] = await Promise.all([
      getDailyStats({ db, userId, startDate: startDateStr }),
      getUsageSummary({ db, userId, days }),
    ]);

    return { data, summary };
  },
  { defaultErrorMessage: "Failed to get usage data" },
);

export const getCostLimitsAction = userOnlyAction(
  async function getCostLimitsAction(
    userId: string,
  ): Promise<CostLimits | null> {
    return getCostLimits({ db, userId });
  },
  { defaultErrorMessage: "Failed to get cost limits" },
);

export const updateCostLimitsAction = userOnlyAction(
  async function updateCostLimitsAction(
    userId: string,
    limits: {
      dailyLimitCents: number | null;
      monthlyLimitCents: number | null;
      alertThresholdPercent: number;
    },
  ): Promise<void> {
    getPostHogServer().capture({
      distinctId: userId,
      event: "update_cost_limits",
      properties: {
        dailyLimitCents: limits.dailyLimitCents,
        monthlyLimitCents: limits.monthlyLimitCents,
        alertThresholdPercent: limits.alertThresholdPercent,
      },
    });

    await setCostLimits({ db, userId, limits });
  },
  { defaultErrorMessage: "Failed to update cost limits" },
);
