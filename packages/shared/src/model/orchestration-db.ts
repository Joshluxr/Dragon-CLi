/**
 * Multi-Agent Orchestration Database Operations
 */

import { eq, and, isNull, desc, asc } from "drizzle-orm";
import type { DB } from "../db";
import {
  orchestrationSession,
  orchestrationAgent,
  fileLock,
} from "../db/schema";
import type {
  OrchestrationConfig,
  OrchestrationMode,
  OrchestrationSessionStatus,
  OrchestrationAgentStatus,
  TaskDecomposition,
  AgentResult,
  FileLockType,
} from "./orchestration";
import { validateOrchestrationConfig } from "./orchestration";

/**
 * Create a new orchestration session
 */
export async function createOrchestrationSession({
  db,
  parentThreadId,
  userId,
  mode,
  config,
  taskDecomposition,
}: {
  db: DB;
  parentThreadId: string;
  userId: string;
  mode?: OrchestrationMode;
  config: Partial<OrchestrationConfig>;
  taskDecomposition?: TaskDecomposition;
}): Promise<{ id: string }> {
  const validatedConfig = validateOrchestrationConfig(config);

  const result = await db
    .insert(orchestrationSession)
    .values({
      parentThreadId,
      userId,
      mode: mode ?? validatedConfig.mode,
      status: "planning",
      config: validatedConfig,
      taskDecomposition,
    })
    .returning({ id: orchestrationSession.id });

  return result[0]!;
}

/**
 * Get an orchestration session by ID
 */
export async function getOrchestrationSession({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<{
  id: string;
  parentThreadId: string;
  userId: string;
  mode: OrchestrationMode;
  status: OrchestrationSessionStatus;
  config: OrchestrationConfig;
  taskDecomposition: TaskDecomposition | null;
  createdAt: Date;
  completedAt: Date | null;
} | null> {
  const result = await db
    .select({
      id: orchestrationSession.id,
      parentThreadId: orchestrationSession.parentThreadId,
      userId: orchestrationSession.userId,
      mode: orchestrationSession.mode,
      status: orchestrationSession.status,
      config: orchestrationSession.config,
      taskDecomposition: orchestrationSession.taskDecomposition,
      createdAt: orchestrationSession.createdAt,
      completedAt: orchestrationSession.completedAt,
    })
    .from(orchestrationSession)
    .where(eq(orchestrationSession.id, id))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Update orchestration session status
 */
export async function updateOrchestrationSessionStatus({
  db,
  id,
  status,
}: {
  db: DB;
  id: string;
  status: OrchestrationSessionStatus;
}): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (status === "completed" || status === "failed" || status === "cancelled") {
    updates.completedAt = new Date();
  }

  await db
    .update(orchestrationSession)
    .set(updates)
    .where(eq(orchestrationSession.id, id));
}

/**
 * Update task decomposition for a session
 */
export async function updateTaskDecomposition({
  db,
  id,
  taskDecomposition,
}: {
  db: DB;
  id: string;
  taskDecomposition: TaskDecomposition;
}): Promise<void> {
  await db
    .update(orchestrationSession)
    .set({ taskDecomposition })
    .where(eq(orchestrationSession.id, id));
}

/**
 * Create an orchestration agent
 */
export async function createOrchestrationAgent({
  db,
  sessionId,
  role,
  task,
  ownedFiles,
  dependencies,
  order,
}: {
  db: DB;
  sessionId: string;
  role: string;
  task: string;
  ownedFiles?: string[];
  dependencies?: string[];
  order?: number;
}): Promise<{ id: string }> {
  const result = await db
    .insert(orchestrationAgent)
    .values({
      sessionId,
      role,
      task,
      ownedFiles: ownedFiles ?? [],
      dependencies: dependencies ?? [],
      order,
      status: "pending",
    })
    .returning({ id: orchestrationAgent.id });

  return result[0]!;
}

/**
 * Get all agents for a session
 */
export async function getOrchestrationAgents({
  db,
  sessionId,
}: {
  db: DB;
  sessionId: string;
}): Promise<
  Array<{
    id: string;
    sessionId: string;
    threadId: string | null;
    role: string;
    task: string;
    ownedFiles: string[];
    dependencies: string[];
    status: OrchestrationAgentStatus;
    order: number | null;
    result: AgentResult | null;
    startedAt: Date | null;
    completedAt: Date | null;
  }>
> {
  const results = await db
    .select({
      id: orchestrationAgent.id,
      sessionId: orchestrationAgent.sessionId,
      threadId: orchestrationAgent.threadId,
      role: orchestrationAgent.role,
      task: orchestrationAgent.task,
      ownedFiles: orchestrationAgent.ownedFiles,
      dependencies: orchestrationAgent.dependencies,
      status: orchestrationAgent.status,
      order: orchestrationAgent.order,
      result: orchestrationAgent.result,
      startedAt: orchestrationAgent.startedAt,
      completedAt: orchestrationAgent.completedAt,
    })
    .from(orchestrationAgent)
    .where(eq(orchestrationAgent.sessionId, sessionId))
    .orderBy(asc(orchestrationAgent.order));

  return results.map((r) => ({
    ...r,
    ownedFiles: r.ownedFiles ?? [],
    dependencies: r.dependencies ?? [],
  }));
}

/**
 * Get an agent by ID
 */
export async function getOrchestrationAgent({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<{
  id: string;
  sessionId: string;
  threadId: string | null;
  role: string;
  task: string;
  ownedFiles: string[];
  dependencies: string[];
  status: OrchestrationAgentStatus;
  order: number | null;
  result: AgentResult | null;
  startedAt: Date | null;
  completedAt: Date | null;
} | null> {
  const results = await db
    .select({
      id: orchestrationAgent.id,
      sessionId: orchestrationAgent.sessionId,
      threadId: orchestrationAgent.threadId,
      role: orchestrationAgent.role,
      task: orchestrationAgent.task,
      ownedFiles: orchestrationAgent.ownedFiles,
      dependencies: orchestrationAgent.dependencies,
      status: orchestrationAgent.status,
      order: orchestrationAgent.order,
      result: orchestrationAgent.result,
      startedAt: orchestrationAgent.startedAt,
      completedAt: orchestrationAgent.completedAt,
    })
    .from(orchestrationAgent)
    .where(eq(orchestrationAgent.id, id))
    .limit(1);

  const r = results[0];
  if (!r) return null;

  return {
    ...r,
    ownedFiles: r.ownedFiles ?? [],
    dependencies: r.dependencies ?? [],
  };
}

/**
 * Update agent status
 */
export async function updateOrchestrationAgentStatus({
  db,
  id,
  status,
  threadId,
  result,
}: {
  db: DB;
  id: string;
  status: OrchestrationAgentStatus;
  threadId?: string;
  result?: AgentResult;
}): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === "running" && !updates.startedAt) {
    updates.startedAt = new Date();
  }
  if (status === "completed" || status === "failed") {
    updates.completedAt = new Date();
  }
  if (threadId) {
    updates.threadId = threadId;
  }
  if (result) {
    updates.result = result;
  }

  await db
    .update(orchestrationAgent)
    .set(updates)
    .where(eq(orchestrationAgent.id, id));
}

/**
 * Acquire a file lock
 */
export async function acquireFileLock({
  db,
  sessionId,
  agentId,
  filePath,
  lockType = "exclusive",
}: {
  db: DB;
  sessionId: string;
  agentId: string;
  filePath: string;
  lockType?: FileLockType;
}): Promise<{ id: string } | null> {
  // Check for existing active lock
  const existing = await db
    .select({ id: fileLock.id, agentId: fileLock.agentId })
    .from(fileLock)
    .where(
      and(
        eq(fileLock.sessionId, sessionId),
        eq(fileLock.filePath, filePath),
        isNull(fileLock.releasedAt),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (existing[0].agentId === agentId) {
      // Already own the lock
      return { id: existing[0].id };
    }
    // Lock held by another agent
    return null;
  }

  // Acquire new lock
  const result = await db
    .insert(fileLock)
    .values({
      sessionId,
      agentId,
      filePath,
      lockType,
    })
    .returning({ id: fileLock.id });

  return result[0]!;
}

/**
 * Release a file lock
 */
export async function releaseFileLock({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<void> {
  await db
    .update(fileLock)
    .set({ releasedAt: new Date() })
    .where(eq(fileLock.id, id));
}

/**
 * Release all locks for an agent
 */
export async function releaseAgentFileLocks({
  db,
  agentId,
}: {
  db: DB;
  agentId: string;
}): Promise<void> {
  await db
    .update(fileLock)
    .set({ releasedAt: new Date() })
    .where(and(eq(fileLock.agentId, agentId), isNull(fileLock.releasedAt)));
}

/**
 * Release all locks for a session
 */
export async function releaseSessionFileLocks({
  db,
  sessionId,
}: {
  db: DB;
  sessionId: string;
}): Promise<void> {
  await db
    .update(fileLock)
    .set({ releasedAt: new Date() })
    .where(and(eq(fileLock.sessionId, sessionId), isNull(fileLock.releasedAt)));
}

/**
 * Get active locks for a session
 */
export async function getActiveFileLocks({
  db,
  sessionId,
}: {
  db: DB;
  sessionId: string;
}): Promise<
  Array<{
    id: string;
    agentId: string;
    filePath: string;
    lockType: FileLockType;
    acquiredAt: Date;
  }>
> {
  return db
    .select({
      id: fileLock.id,
      agentId: fileLock.agentId,
      filePath: fileLock.filePath,
      lockType: fileLock.lockType,
      acquiredAt: fileLock.acquiredAt,
    })
    .from(fileLock)
    .where(and(eq(fileLock.sessionId, sessionId), isNull(fileLock.releasedAt)));
}

/**
 * Get recent orchestration sessions for a user
 */
export async function getRecentOrchestrationSessions({
  db,
  userId,
  limit = 10,
}: {
  db: DB;
  userId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    parentThreadId: string;
    mode: OrchestrationMode;
    status: OrchestrationSessionStatus;
    createdAt: Date;
    completedAt: Date | null;
  }>
> {
  return db
    .select({
      id: orchestrationSession.id,
      parentThreadId: orchestrationSession.parentThreadId,
      mode: orchestrationSession.mode,
      status: orchestrationSession.status,
      createdAt: orchestrationSession.createdAt,
      completedAt: orchestrationSession.completedAt,
    })
    .from(orchestrationSession)
    .where(eq(orchestrationSession.userId, userId))
    .orderBy(desc(orchestrationSession.createdAt))
    .limit(limit);
}

/**
 * Get active orchestration session for a thread
 */
export async function getActiveOrchestrationSession({
  db,
  parentThreadId,
}: {
  db: DB;
  parentThreadId: string;
}): Promise<{
  id: string;
  mode: OrchestrationMode;
  status: OrchestrationSessionStatus;
  config: OrchestrationConfig;
} | null> {
  const result = await db
    .select({
      id: orchestrationSession.id,
      mode: orchestrationSession.mode,
      status: orchestrationSession.status,
      config: orchestrationSession.config,
    })
    .from(orchestrationSession)
    .where(
      and(
        eq(orchestrationSession.parentThreadId, parentThreadId),
        eq(orchestrationSession.status, "running"),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}
