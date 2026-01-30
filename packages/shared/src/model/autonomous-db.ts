/**
 * Database operations for Autonomous Execution
 */

import { eq, and, desc } from "drizzle-orm";
import { autonomousExecution, thread, threadChat } from "../db/schema";
import { DB } from "../db";
import type {
  AutonomousConfig,
  AutonomousExecutionStatus,
  CompletionSignal,
} from "./autonomous";

interface DbContext {
  db: DB;
}

/**
 * Create a new autonomous execution record
 */
export async function createAutonomousExecution({
  db,
  threadId,
  chatId,
  config,
}: DbContext & {
  threadId: string;
  chatId?: string;
  config: AutonomousConfig;
}): Promise<{ id: string }> {
  const [result] = await db
    .insert(autonomousExecution)
    .values({
      threadId,
      chatId,
      status: "running",
      config,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      loopCount: 0,
      toolCallCount: 0,
      tokensUsed: 0,
      estimatedCost: "0",
      completionSignals: [],
    })
    .returning({ id: autonomousExecution.id });

  if (!result) {
    throw new Error("Failed to create autonomous execution");
  }

  // Update the thread/chat to reference this execution
  if (chatId) {
    await db
      .update(threadChat)
      .set({
        autonomousMode: true,
        autonomousExecutionId: result.id,
      })
      .where(eq(threadChat.id, chatId));
  } else {
    await db
      .update(thread)
      .set({
        autonomousMode: true,
        autonomousExecutionId: result.id,
      })
      .where(eq(thread.id, threadId));
  }

  return result;
}

/**
 * Get an autonomous execution by ID
 */
export async function getAutonomousExecution({
  db,
  id,
}: DbContext & {
  id: string;
}): Promise<{
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
  const results = await db
    .select()
    .from(autonomousExecution)
    .where(eq(autonomousExecution.id, id))
    .limit(1);

  const result = results[0];
  if (!result) return null;

  return {
    id: result.id,
    threadId: result.threadId,
    chatId: result.chatId,
    status: result.status,
    config: result.config,
    startedAt: result.startedAt,
    lastActivityAt: result.lastActivityAt,
    completedAt: result.completedAt,
    loopCount: result.loopCount,
    toolCallCount: result.toolCallCount,
    tokensUsed: result.tokensUsed,
    estimatedCost: result.estimatedCost,
    completionSignals: result.completionSignals ?? [],
    exitReason: result.exitReason,
  };
}

/**
 * Get active autonomous execution for a thread/chat
 */
export async function getActiveAutonomousExecution({
  db,
  threadId,
  chatId,
}: DbContext & {
  threadId: string;
  chatId?: string;
}): Promise<{
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
  const whereClause = chatId
    ? and(
        eq(autonomousExecution.threadId, threadId),
        eq(autonomousExecution.chatId, chatId),
        eq(autonomousExecution.status, "running"),
      )
    : and(
        eq(autonomousExecution.threadId, threadId),
        eq(autonomousExecution.status, "running"),
      );

  const results = await db
    .select()
    .from(autonomousExecution)
    .where(whereClause)
    .orderBy(desc(autonomousExecution.startedAt))
    .limit(1);

  const result = results[0];
  if (!result) return null;

  return {
    id: result.id,
    status: result.status,
    config: result.config,
    startedAt: result.startedAt,
    lastActivityAt: result.lastActivityAt,
    loopCount: result.loopCount,
    toolCallCount: result.toolCallCount,
    tokensUsed: result.tokensUsed,
    estimatedCost: result.estimatedCost,
    completionSignals: result.completionSignals ?? [],
  };
}

/**
 * Update autonomous execution metrics
 */
export async function updateAutonomousExecutionMetrics({
  db,
  id,
  loopCount,
  toolCallCount,
  tokensUsed,
  estimatedCost,
  completionSignals,
}: DbContext & {
  id: string;
  loopCount?: number;
  toolCallCount?: number;
  tokensUsed?: number;
  estimatedCost?: number;
  completionSignals?: CompletionSignal[];
}): Promise<void> {
  const updates: Record<string, unknown> = {
    lastActivityAt: new Date(),
  };

  if (loopCount !== undefined) {
    updates.loopCount = loopCount;
  }
  if (toolCallCount !== undefined) {
    updates.toolCallCount = toolCallCount;
  }
  if (tokensUsed !== undefined) {
    updates.tokensUsed = tokensUsed;
  }
  if (estimatedCost !== undefined) {
    updates.estimatedCost = estimatedCost.toString();
  }
  if (completionSignals !== undefined) {
    updates.completionSignals = completionSignals;
  }

  await db
    .update(autonomousExecution)
    .set(updates)
    .where(eq(autonomousExecution.id, id));
}

/**
 * Complete an autonomous execution
 */
export async function completeAutonomousExecution({
  db,
  id,
  status,
  exitReason,
  completionSignals,
}: DbContext & {
  id: string;
  status: AutonomousExecutionStatus;
  exitReason?: string;
  completionSignals?: CompletionSignal[];
}): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    completedAt: new Date(),
    lastActivityAt: new Date(),
  };

  if (exitReason) {
    updates.exitReason = exitReason;
  }
  if (completionSignals) {
    updates.completionSignals = completionSignals;
  }

  await db
    .update(autonomousExecution)
    .set(updates)
    .where(eq(autonomousExecution.id, id));

  // Get the execution to update the thread/chat
  const execution = await getAutonomousExecution({ db, id });
  if (execution) {
    if (execution.chatId) {
      await db
        .update(threadChat)
        .set({ autonomousMode: false })
        .where(eq(threadChat.id, execution.chatId));
    } else {
      await db
        .update(thread)
        .set({ autonomousMode: false })
        .where(eq(thread.id, execution.threadId));
    }
  }
}

/**
 * Stop an autonomous execution (user-initiated)
 */
export async function stopAutonomousExecution({
  db,
  id,
}: DbContext & {
  id: string;
}): Promise<void> {
  await completeAutonomousExecution({
    db,
    id,
    status: "stopped",
    exitReason: "User requested stop",
    completionSignals: [
      {
        type: "user_stop",
        timestamp: Date.now(),
        details: "User requested stop",
      },
    ],
  });
}

/**
 * Get recent autonomous executions for a user's threads
 */
export async function getRecentAutonomousExecutions({
  db,
  userId,
  limit = 10,
}: DbContext & {
  userId: string;
  limit?: number;
}): Promise<
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
  const results = await db
    .select({
      id: autonomousExecution.id,
      threadId: autonomousExecution.threadId,
      chatId: autonomousExecution.chatId,
      status: autonomousExecution.status,
      startedAt: autonomousExecution.startedAt,
      completedAt: autonomousExecution.completedAt,
      loopCount: autonomousExecution.loopCount,
      estimatedCost: autonomousExecution.estimatedCost,
      exitReason: autonomousExecution.exitReason,
    })
    .from(autonomousExecution)
    .innerJoin(thread, eq(autonomousExecution.threadId, thread.id))
    .where(eq(thread.userId, userId))
    .orderBy(desc(autonomousExecution.startedAt))
    .limit(limit);

  return results;
}
