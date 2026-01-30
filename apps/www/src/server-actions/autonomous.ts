"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  createAutonomousExecution,
  getAutonomousExecution,
  getActiveAutonomousExecution,
  updateAutonomousExecutionMetrics,
  completeAutonomousExecution,
  stopAutonomousExecution,
  getRecentAutonomousExecutions,
} from "@terragon/shared/model/autonomous-db";
import { validateAutonomousConfig } from "@terragon/shared/model/autonomous";
import { getPostHogServer } from "@/lib/posthog-server";
import type {
  AutonomousConfig,
  AutonomousExecutionStatus,
  CompletionSignal,
} from "@terragon/shared";

export const startAutonomousExecutionAction = userOnlyAction(
  async function startAutonomousExecutionAction(
    userId: string,
    {
      threadId,
      chatId,
      config,
    }: {
      threadId: string;
      chatId?: string;
      config: Partial<AutonomousConfig>;
    },
  ): Promise<{ id: string }> {
    const validatedConfig = validateAutonomousConfig(config);

    getPostHogServer().capture({
      distinctId: userId,
      event: "start_autonomous_execution",
      properties: {
        threadId,
        chatId,
        maxDurationMinutes: validatedConfig.maxDurationMinutes,
        maxLoops: validatedConfig.maxLoops,
        maxCostDollars: validatedConfig.maxCostDollars,
        requireExplicitSignal: validatedConfig.requireExplicitSignal,
      },
    });

    return createAutonomousExecution({
      db,
      threadId,
      chatId,
      config: validatedConfig,
    });
  },
  { defaultErrorMessage: "Failed to start autonomous execution" },
);

export const getAutonomousExecutionAction = userOnlyAction(
  async function getAutonomousExecutionAction(
    _userId: string,
    { id }: { id: string },
  ): Promise<{
    id: string;
    threadId: string;
    chatId: string | null;
    status: AutonomousExecutionStatus;
    config: AutonomousConfig;
    startedAt: Date;
    lastActivityAt: Date;
    completedAt: Date | null;
    loopCount: number;
    toolCallCount: number;
    tokensUsed: number;
    estimatedCost: string;
    completionSignals: CompletionSignal[];
    exitReason: string | null;
  } | null> {
    return getAutonomousExecution({ db, id });
  },
  { defaultErrorMessage: "Failed to get autonomous execution" },
);

export const getActiveAutonomousExecutionAction = userOnlyAction(
  async function getActiveAutonomousExecutionAction(
    _userId: string,
    { threadId, chatId }: { threadId: string; chatId?: string },
  ): Promise<{
    id: string;
    status: AutonomousExecutionStatus;
    config: AutonomousConfig;
    startedAt: Date;
    lastActivityAt: Date;
    loopCount: number;
    toolCallCount: number;
    tokensUsed: number;
    estimatedCost: string;
    completionSignals: CompletionSignal[];
  } | null> {
    return getActiveAutonomousExecution({ db, threadId, chatId });
  },
  { defaultErrorMessage: "Failed to get active autonomous execution" },
);

export const updateAutonomousMetricsAction = userOnlyAction(
  async function updateAutonomousMetricsAction(
    _userId: string,
    {
      id,
      loopCount,
      toolCallCount,
      tokensUsed,
      estimatedCost,
      completionSignals,
    }: {
      id: string;
      loopCount?: number;
      toolCallCount?: number;
      tokensUsed?: number;
      estimatedCost?: number;
      completionSignals?: CompletionSignal[];
    },
  ): Promise<void> {
    await updateAutonomousExecutionMetrics({
      db,
      id,
      loopCount,
      toolCallCount,
      tokensUsed,
      estimatedCost,
      completionSignals,
    });
  },
  { defaultErrorMessage: "Failed to update autonomous metrics" },
);

export const completeAutonomousExecutionAction = userOnlyAction(
  async function completeAutonomousExecutionAction(
    userId: string,
    {
      id,
      status,
      exitReason,
      completionSignals,
    }: {
      id: string;
      status: AutonomousExecutionStatus;
      exitReason?: string;
      completionSignals?: CompletionSignal[];
    },
  ): Promise<void> {
    getPostHogServer().capture({
      distinctId: userId,
      event: "complete_autonomous_execution",
      properties: {
        executionId: id,
        status,
        exitReason,
        signalCount: completionSignals?.length ?? 0,
      },
    });

    await completeAutonomousExecution({
      db,
      id,
      status,
      exitReason,
      completionSignals,
    });
  },
  { defaultErrorMessage: "Failed to complete autonomous execution" },
);

export const stopAutonomousExecutionAction = userOnlyAction(
  async function stopAutonomousExecutionAction(
    userId: string,
    { id }: { id: string },
  ): Promise<void> {
    getPostHogServer().capture({
      distinctId: userId,
      event: "stop_autonomous_execution",
      properties: {
        executionId: id,
      },
    });

    await stopAutonomousExecution({ db, id });
  },
  { defaultErrorMessage: "Failed to stop autonomous execution" },
);

export const getRecentAutonomousExecutionsAction = userOnlyAction(
  async function getRecentAutonomousExecutionsAction(
    userId: string,
    { limit = 10 }: { limit?: number },
  ): Promise<
    Array<{
      id: string;
      threadId: string;
      chatId: string | null;
      status: AutonomousExecutionStatus;
      startedAt: Date;
      completedAt: Date | null;
      loopCount: number;
      estimatedCost: string;
      exitReason: string | null;
    }>
  > {
    return getRecentAutonomousExecutions({ db, userId, limit });
  },
  { defaultErrorMessage: "Failed to get recent autonomous executions" },
);
