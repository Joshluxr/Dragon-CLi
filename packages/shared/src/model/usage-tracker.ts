/**
 * Usage Tracker Types and Functions
 *
 * Types for tracking agent usage, costs, and analytics.
 */

import type { AIAgent } from "@dragon/agent/types";

export interface AgentStats {
  tasks: number;
  successful: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  durationMs: number;
}

export interface UsageTrackingData {
  userId: string;
  threadId: string;
  chatId: string;
  agent: AIAgent;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  durationMs: number;
  toolCallCount: number;
  success: boolean;
  errorType?: string;
}

export interface DailyUsageData {
  date: string;
  tasks: number;
  successRate: number;
  tokens: number;
  cost: number;
  avgDuration: number;
  byAgent: Record<string, AgentStats> | null;
}

export interface UsageSummary {
  tasks: number;
  tasksTrend: number;
  successRate: number;
  successRateTrend: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  costTrend: number;
}

export interface CostLimits {
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
  alertThresholdPercent: number;
  lastAlertAt: Date | null;
}

// Model pricing per million tokens (in cents)
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheRead?: number; cacheWrite?: number }
> = {
  "claude-opus-4-5-20251101": {
    input: 1500,
    output: 7500,
    cacheRead: 150,
    cacheWrite: 1875,
  },
  "claude-sonnet-4-20250514": {
    input: 300,
    output: 1500,
    cacheRead: 30,
    cacheWrite: 375,
  },
  "claude-haiku-3-5-20241022": {
    input: 100,
    output: 500,
    cacheRead: 10,
    cacheWrite: 125,
  },
  "gpt-4o": { input: 500, output: 1500 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "gemini-2.5-pro": { input: 125, output: 500 },
};

/**
 * Calculate cost in cents for a given model and usage
 */
export function calculateCost(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
): number {
  const defaultPricing = MODEL_PRICING["claude-sonnet-4-20250514"]!;
  const pricing = MODEL_PRICING[model] ?? defaultPricing;

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost =
    ((usage.cacheReadTokens || 0) / 1_000_000) * (pricing.cacheRead || 0);
  const cacheWriteCost =
    ((usage.cacheWriteTokens || 0) / 1_000_000) * (pricing.cacheWrite || 0);

  return Math.round(inputCost + outputCost + cacheReadCost + cacheWriteCost);
}

/**
 * Get the current date in YYYY-MM-DD format
 */
export function getCurrentDateString(): string {
  const parts = new Date().toISOString().split("T");
  return parts[0] ?? new Date().toISOString().slice(0, 10);
}

/**
 * Calculate trend percentage between two values
 */
export function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Format number with appropriate suffix (K, M, B)
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Aggregate usage data by week
 */
export function aggregateByWeek(data: DailyUsageData[]): Array<{
  week: string;
  tasks: number;
  successRate: number;
  tokens: number;
  cost: number;
  avgDuration: number;
}> {
  const weeks: Map<
    string,
    {
      tasks: number;
      successful: number;
      tokens: number;
      cost: number;
      duration: number;
    }
  > = new Map();

  for (const day of data) {
    const date = new Date(day.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKeyParts = weekStart.toISOString().split("T");
    const weekKey = weekKeyParts[0] ?? weekStart.toISOString().slice(0, 10);

    const existing = weeks.get(weekKey) || {
      tasks: 0,
      successful: 0,
      tokens: 0,
      cost: 0,
      duration: 0,
    };

    existing.tasks += day.tasks;
    existing.successful += Math.round((day.successRate / 100) * day.tasks);
    existing.tokens += day.tokens;
    existing.cost += day.cost;
    existing.duration += day.avgDuration * day.tasks;

    weeks.set(weekKey, existing);
  }

  return Array.from(weeks.entries()).map(([week, weekData]) => ({
    week,
    tasks: weekData.tasks,
    successRate:
      weekData.tasks > 0 ? (weekData.successful / weekData.tasks) * 100 : 0,
    tokens: weekData.tokens,
    cost: weekData.cost,
    avgDuration: weekData.tasks > 0 ? weekData.duration / weekData.tasks : 0,
  }));
}

/**
 * Aggregate usage data by agent
 */
export function aggregateByAgent(
  data: DailyUsageData[],
): Array<{ agent: string; tasks: number; cost: number }> {
  const agents: Map<string, { tasks: number; cost: number }> = new Map();

  for (const day of data) {
    if (!day.byAgent) continue;

    for (const [agent, stats] of Object.entries(day.byAgent)) {
      const existing = agents.get(agent) || { tasks: 0, cost: 0 };
      existing.tasks += stats.tasks;
      existing.cost += stats.costCents / 100;
      agents.set(agent, existing);
    }
  }

  return Array.from(agents.entries())
    .map(([agent, data]) => ({ agent, ...data }))
    .sort((a, b) => b.cost - a.cost);
}
