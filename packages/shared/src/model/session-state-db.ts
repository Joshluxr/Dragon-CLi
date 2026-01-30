/**
 * Session State and Checkpoint Database Operations
 */

import { eq, and, desc, asc, or } from "drizzle-orm";
import type { DB } from "../db";
import { sessionCheckpoint, agentHandoff, thread } from "../db/schema";
import type { AIAgent } from "@terragon/agent/types";
import type {
  CheckpointType,
  CheckpointMetadata,
  AgentHandoff,
  HandoffChainEntry,
} from "./session-state";

/**
 * Create a new session checkpoint
 */
export async function createSessionCheckpoint({
  db,
  threadId,
  chatId,
  name,
  description,
  type,
  stateKey,
  stateSize,
  contextSummary,
  messageCount,
  agent,
  model,
}: {
  db: DB;
  threadId: string;
  chatId?: string;
  name: string;
  description?: string;
  type: CheckpointType;
  stateKey: string;
  stateSize: number;
  contextSummary?: string;
  messageCount: number;
  agent?: string;
  model?: string;
}): Promise<{ id: string }> {
  const result = await db
    .insert(sessionCheckpoint)
    .values({
      threadId,
      chatId,
      name,
      description,
      type,
      stateKey,
      stateSize,
      contextSummary,
      messageCount,
      agent,
      model,
    })
    .returning({ id: sessionCheckpoint.id });

  return result[0]!;
}

/**
 * Get a checkpoint by ID
 */
export async function getSessionCheckpoint({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<CheckpointMetadata | null> {
  const result = await db
    .select({
      id: sessionCheckpoint.id,
      threadId: sessionCheckpoint.threadId,
      chatId: sessionCheckpoint.chatId,
      name: sessionCheckpoint.name,
      description: sessionCheckpoint.description,
      type: sessionCheckpoint.type,
      stateKey: sessionCheckpoint.stateKey,
      stateSize: sessionCheckpoint.stateSize,
      contextSummary: sessionCheckpoint.contextSummary,
      messageCount: sessionCheckpoint.messageCount,
      agent: sessionCheckpoint.agent,
      model: sessionCheckpoint.model,
      createdAt: sessionCheckpoint.createdAt,
    })
    .from(sessionCheckpoint)
    .where(eq(sessionCheckpoint.id, id))
    .limit(1);

  const r = result[0];
  if (!r) return null;

  return {
    id: r.id,
    threadId: r.threadId,
    chatId: r.chatId ?? "",
    name: r.name,
    description: r.description ?? undefined,
    type: r.type as CheckpointType,
    stateSize: r.stateSize,
    messageCount: r.messageCount,
    contextSummary: r.contextSummary ?? undefined,
    agent: (r.agent as AIAgent) ?? "claudeCode",
    model: r.model ?? undefined,
    createdAt: r.createdAt,
  };
}

/**
 * Get checkpoints for a thread
 */
export async function getThreadCheckpoints({
  db,
  threadId,
  chatId,
  limit = 20,
}: {
  db: DB;
  threadId: string;
  chatId?: string;
  limit?: number;
}): Promise<CheckpointMetadata[]> {
  let query = db
    .select({
      id: sessionCheckpoint.id,
      threadId: sessionCheckpoint.threadId,
      chatId: sessionCheckpoint.chatId,
      name: sessionCheckpoint.name,
      description: sessionCheckpoint.description,
      type: sessionCheckpoint.type,
      stateKey: sessionCheckpoint.stateKey,
      stateSize: sessionCheckpoint.stateSize,
      contextSummary: sessionCheckpoint.contextSummary,
      messageCount: sessionCheckpoint.messageCount,
      agent: sessionCheckpoint.agent,
      model: sessionCheckpoint.model,
      createdAt: sessionCheckpoint.createdAt,
    })
    .from(sessionCheckpoint)
    .where(
      chatId
        ? and(
            eq(sessionCheckpoint.threadId, threadId),
            eq(sessionCheckpoint.chatId, chatId),
          )
        : eq(sessionCheckpoint.threadId, threadId),
    )
    .orderBy(desc(sessionCheckpoint.createdAt))
    .limit(limit);

  const results = await query;

  return results.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    chatId: r.chatId ?? "",
    name: r.name,
    description: r.description ?? undefined,
    type: r.type as CheckpointType,
    stateSize: r.stateSize,
    messageCount: r.messageCount,
    contextSummary: r.contextSummary ?? undefined,
    agent: (r.agent as AIAgent) ?? "claudeCode",
    model: r.model ?? undefined,
    createdAt: r.createdAt,
  }));
}

/**
 * Delete a checkpoint
 */
export async function deleteSessionCheckpoint({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<void> {
  await db.delete(sessionCheckpoint).where(eq(sessionCheckpoint.id, id));
}

/**
 * Get checkpoint state key for R2 retrieval
 */
export async function getCheckpointStateKey({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<string | null> {
  const result = await db
    .select({ stateKey: sessionCheckpoint.stateKey })
    .from(sessionCheckpoint)
    .where(eq(sessionCheckpoint.id, id))
    .limit(1);

  return result[0]?.stateKey ?? null;
}

/**
 * Create an agent handoff record
 */
export async function createAgentHandoff({
  db,
  fromThreadId,
  toThreadId,
  fromAgent,
  toAgent,
  checkpointId,
  reason,
  context,
}: {
  db: DB;
  fromThreadId: string;
  toThreadId: string;
  fromAgent: string;
  toAgent: string;
  checkpointId?: string;
  reason?: string;
  context?: string;
}): Promise<{ id: string }> {
  const result = await db
    .insert(agentHandoff)
    .values({
      fromThreadId,
      toThreadId,
      fromAgent,
      toAgent,
      checkpointId,
      reason,
      context,
    })
    .returning({ id: agentHandoff.id });

  return result[0]!;
}

/**
 * Get handoff by ID
 */
export async function getAgentHandoff({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<AgentHandoff | null> {
  const result = await db
    .select({
      id: agentHandoff.id,
      fromThreadId: agentHandoff.fromThreadId,
      toThreadId: agentHandoff.toThreadId,
      fromAgent: agentHandoff.fromAgent,
      toAgent: agentHandoff.toAgent,
      checkpointId: agentHandoff.checkpointId,
      reason: agentHandoff.reason,
      context: agentHandoff.context,
      createdAt: agentHandoff.createdAt,
    })
    .from(agentHandoff)
    .where(eq(agentHandoff.id, id))
    .limit(1);

  const r = result[0];
  if (!r) return null;

  return {
    id: r.id,
    fromThreadId: r.fromThreadId,
    toThreadId: r.toThreadId,
    fromAgent: r.fromAgent as AIAgent,
    toAgent: r.toAgent as AIAgent,
    checkpointId: r.checkpointId ?? "",
    reason: r.reason ?? undefined,
    context: r.context ?? undefined,
    createdAt: r.createdAt,
  };
}

/**
 * Get handoff chain for a thread (shows history of agent transfers)
 */
export async function getHandoffChain({
  db,
  threadId,
}: {
  db: DB;
  threadId: string;
}): Promise<HandoffChainEntry[]> {
  const handoffs = await db
    .select({
      id: agentHandoff.id,
      fromThreadId: agentHandoff.fromThreadId,
      toThreadId: agentHandoff.toThreadId,
      fromAgent: agentHandoff.fromAgent,
      toAgent: agentHandoff.toAgent,
      reason: agentHandoff.reason,
      createdAt: agentHandoff.createdAt,
    })
    .from(agentHandoff)
    .where(
      or(
        eq(agentHandoff.fromThreadId, threadId),
        eq(agentHandoff.toThreadId, threadId),
      ),
    )
    .orderBy(asc(agentHandoff.createdAt));

  // Build chain starting from the earliest
  const chain: HandoffChainEntry[] = [];

  for (const h of handoffs) {
    chain.push({
      fromThreadId: h.fromThreadId,
      toThreadId: h.toThreadId,
      fromAgent: h.fromAgent as AIAgent,
      toAgent: h.toAgent as AIAgent,
      reason: h.reason ?? undefined,
      createdAt: h.createdAt,
    });
  }

  return chain;
}

/**
 * Get recent handoffs for a user
 */
export async function getRecentHandoffs({
  db,
  userId,
  limit = 10,
}: {
  db: DB;
  userId: string;
  limit?: number;
}): Promise<AgentHandoff[]> {
  const results = await db
    .select({
      id: agentHandoff.id,
      fromThreadId: agentHandoff.fromThreadId,
      toThreadId: agentHandoff.toThreadId,
      fromAgent: agentHandoff.fromAgent,
      toAgent: agentHandoff.toAgent,
      checkpointId: agentHandoff.checkpointId,
      reason: agentHandoff.reason,
      context: agentHandoff.context,
      createdAt: agentHandoff.createdAt,
    })
    .from(agentHandoff)
    .innerJoin(thread, eq(agentHandoff.fromThreadId, thread.id))
    .where(eq(thread.userId, userId))
    .orderBy(desc(agentHandoff.createdAt))
    .limit(limit);

  return results.map((r) => ({
    id: r.id,
    fromThreadId: r.fromThreadId,
    toThreadId: r.toThreadId,
    fromAgent: r.fromAgent as AIAgent,
    toAgent: r.toAgent as AIAgent,
    checkpointId: r.checkpointId ?? "",
    reason: r.reason ?? undefined,
    context: r.context ?? undefined,
    createdAt: r.createdAt,
  }));
}

/**
 * Count checkpoints for a thread (for limit enforcement)
 */
export async function countThreadCheckpoints({
  db,
  threadId,
}: {
  db: DB;
  threadId: string;
}): Promise<number> {
  const result = await db
    .select({ id: sessionCheckpoint.id })
    .from(sessionCheckpoint)
    .where(eq(sessionCheckpoint.threadId, threadId));

  return result.length;
}

/**
 * Delete oldest checkpoints beyond limit
 */
export async function pruneOldCheckpoints({
  db,
  threadId,
  keepCount,
}: {
  db: DB;
  threadId: string;
  keepCount: number;
}): Promise<number> {
  // Get all checkpoints ordered by creation date
  const checkpoints = await db
    .select({
      id: sessionCheckpoint.id,
      createdAt: sessionCheckpoint.createdAt,
    })
    .from(sessionCheckpoint)
    .where(eq(sessionCheckpoint.threadId, threadId))
    .orderBy(desc(sessionCheckpoint.createdAt));

  if (checkpoints.length <= keepCount) {
    return 0;
  }

  // Delete checkpoints beyond the keep limit
  const toDelete = checkpoints.slice(keepCount).map((c) => c.id);
  let deleted = 0;

  for (const id of toDelete) {
    await db.delete(sessionCheckpoint).where(eq(sessionCheckpoint.id, id));
    deleted++;
  }

  return deleted;
}
