/**
 * Custom MCP Tools Database Operations
 */

import { eq, and, desc, sql } from "drizzle-orm";
import type { DB } from "../db";
import { customTool, toolExecutionLog } from "../db/schema";
import type {
  ToolCategory,
  ToolRuntime,
  ToolStatus,
  JSONSchema,
  ToolDefinition,
  ToolExecutionResult,
} from "./custom-tools";

/**
 * Create a new custom tool
 */
export async function createCustomTool({
  db,
  userId,
  definition,
  environmentId,
  createdByAgentId,
  createdInThreadId,
}: {
  db: DB;
  userId: string;
  definition: ToolDefinition;
  environmentId?: string;
  createdByAgentId?: string;
  createdInThreadId?: string;
}): Promise<{ id: string }> {
  const result = await db
    .insert(customTool)
    .values({
      userId,
      environmentId,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      implementation: definition.implementation,
      runtime: definition.runtime,
      createdByAgentId,
      createdInThreadId,
      status: "draft",
    })
    .returning({ id: customTool.id });

  return result[0]!;
}

/**
 * Get a custom tool by ID
 */
export async function getCustomTool({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<{
  id: string;
  userId: string;
  environmentId: string | null;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema | null;
  implementation: string;
  runtime: ToolRuntime;
  version: number;
  status: ToolStatus;
  createdByAgentId: string | null;
  createdInThreadId: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  usageCount: number;
  lastUsedAt: Date | null;
  errorCount: number;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const result = await db
    .select()
    .from(customTool)
    .where(eq(customTool.id, id))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get a custom tool by name for a user
 */
export async function getCustomToolByName({
  db,
  userId,
  name,
}: {
  db: DB;
  userId: string;
  name: string;
}): Promise<{
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: JSONSchema;
  implementation: string;
  runtime: ToolRuntime;
  status: ToolStatus;
} | null> {
  const result = await db
    .select({
      id: customTool.id,
      name: customTool.name,
      description: customTool.description,
      category: customTool.category,
      inputSchema: customTool.inputSchema,
      implementation: customTool.implementation,
      runtime: customTool.runtime,
      status: customTool.status,
    })
    .from(customTool)
    .where(and(eq(customTool.userId, userId), eq(customTool.name, name)))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get all custom tools for a user
 */
export async function getUserCustomTools({
  db,
  userId,
  status,
  category,
  limit = 50,
}: {
  db: DB;
  userId: string;
  status?: ToolStatus;
  category?: ToolCategory;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    name: string;
    description: string;
    category: ToolCategory;
    runtime: ToolRuntime;
    status: ToolStatus;
    usageCount: number;
    errorCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  const conditions = [eq(customTool.userId, userId)];

  if (status) {
    conditions.push(eq(customTool.status, status));
  }
  if (category) {
    conditions.push(eq(customTool.category, category));
  }

  return db
    .select({
      id: customTool.id,
      name: customTool.name,
      description: customTool.description,
      category: customTool.category,
      runtime: customTool.runtime,
      status: customTool.status,
      usageCount: customTool.usageCount,
      errorCount: customTool.errorCount,
      createdAt: customTool.createdAt,
      updatedAt: customTool.updatedAt,
    })
    .from(customTool)
    .where(and(...conditions))
    .orderBy(desc(customTool.updatedAt))
    .limit(limit);
}

/**
 * Get approved tools available for use
 */
export async function getApprovedTools({
  db,
  userId,
  environmentId,
}: {
  db: DB;
  userId: string;
  environmentId?: string;
}): Promise<
  Array<{
    id: string;
    name: string;
    description: string;
    category: ToolCategory;
    inputSchema: JSONSchema;
    outputSchema: JSONSchema | null;
    implementation: string;
    runtime: ToolRuntime;
  }>
> {
  const conditions = [
    eq(customTool.userId, userId),
    eq(customTool.status, "approved"),
  ];

  if (environmentId) {
    conditions.push(eq(customTool.environmentId, environmentId));
  }

  return db
    .select({
      id: customTool.id,
      name: customTool.name,
      description: customTool.description,
      category: customTool.category,
      inputSchema: customTool.inputSchema,
      outputSchema: customTool.outputSchema,
      implementation: customTool.implementation,
      runtime: customTool.runtime,
    })
    .from(customTool)
    .where(and(...conditions))
    .orderBy(customTool.name);
}

/**
 * Update tool status
 */
export async function updateToolStatus({
  db,
  id,
  status,
  approvedBy,
}: {
  db: DB;
  id: string;
  status: ToolStatus;
  approvedBy?: string;
}): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === "approved" && approvedBy) {
    updates.approvedAt = new Date();
    updates.approvedBy = approvedBy;
  }

  await db.update(customTool).set(updates).where(eq(customTool.id, id));
}

/**
 * Update tool implementation
 */
export async function updateToolImplementation({
  db,
  id,
  implementation,
  inputSchema,
  outputSchema,
  description,
}: {
  db: DB;
  id: string;
  implementation?: string;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;
  description?: string;
}): Promise<void> {
  const updates: Record<string, unknown> = {
    status: "pending_review", // Reset status when implementation changes
  };

  if (implementation !== undefined) {
    updates.implementation = implementation;
  }
  if (inputSchema !== undefined) {
    updates.inputSchema = inputSchema;
  }
  if (outputSchema !== undefined) {
    updates.outputSchema = outputSchema;
  }
  if (description !== undefined) {
    updates.description = description;
  }

  // Increment version
  await db
    .update(customTool)
    .set({
      ...updates,
      version: sql`${customTool.version} + 1`,
    })
    .where(eq(customTool.id, id));
}

/**
 * Record tool execution
 */
export async function recordToolExecution({
  db,
  toolId,
  threadId,
  input,
  result,
}: {
  db: DB;
  toolId: string;
  threadId: string;
  input: Record<string, unknown>;
  result: ToolExecutionResult;
}): Promise<{ id: string }> {
  // Insert execution log
  const logResult = await db
    .insert(toolExecutionLog)
    .values({
      toolId,
      threadId,
      input,
      output: result.output,
      error: result.error,
      durationMs: result.durationMs,
      success: result.success,
    })
    .returning({ id: toolExecutionLog.id });

  // Update tool stats
  if (result.success) {
    await db
      .update(customTool)
      .set({
        usageCount: sql`${customTool.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(customTool.id, toolId));
  } else {
    await db
      .update(customTool)
      .set({
        usageCount: sql`${customTool.usageCount} + 1`,
        errorCount: sql`${customTool.errorCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(customTool.id, toolId));
  }

  return logResult[0]!;
}

/**
 * Get tool execution history
 */
export async function getToolExecutionHistory({
  db,
  toolId,
  limit = 20,
}: {
  db: DB;
  toolId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    threadId: string;
    input: Record<string, unknown>;
    output: unknown;
    error: string | null;
    durationMs: number;
    success: boolean;
    executedAt: Date;
  }>
> {
  return db
    .select({
      id: toolExecutionLog.id,
      threadId: toolExecutionLog.threadId,
      input: toolExecutionLog.input,
      output: toolExecutionLog.output,
      error: toolExecutionLog.error,
      durationMs: toolExecutionLog.durationMs,
      success: toolExecutionLog.success,
      executedAt: toolExecutionLog.executedAt,
    })
    .from(toolExecutionLog)
    .where(eq(toolExecutionLog.toolId, toolId))
    .orderBy(desc(toolExecutionLog.executedAt))
    .limit(limit);
}

/**
 * Delete a custom tool
 */
export async function deleteCustomTool({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<void> {
  await db.delete(customTool).where(eq(customTool.id, id));
}

/**
 * Get tools created by an agent in a thread
 */
export async function getAgentCreatedTools({
  db,
  threadId,
}: {
  db: DB;
  threadId: string;
}): Promise<
  Array<{
    id: string;
    name: string;
    description: string;
    status: ToolStatus;
    createdAt: Date;
  }>
> {
  return db
    .select({
      id: customTool.id,
      name: customTool.name,
      description: customTool.description,
      status: customTool.status,
      createdAt: customTool.createdAt,
    })
    .from(customTool)
    .where(eq(customTool.createdInThreadId, threadId))
    .orderBy(desc(customTool.createdAt));
}

/**
 * Deprecate a tool
 */
export async function deprecateTool({
  db,
  id,
}: {
  db: DB;
  id: string;
}): Promise<void> {
  await db
    .update(customTool)
    .set({ status: "deprecated" })
    .where(eq(customTool.id, id));
}

/**
 * Get pending tools awaiting review
 */
export async function getPendingReviewTools({
  db,
  userId,
  limit = 20,
}: {
  db: DB;
  userId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    name: string;
    description: string;
    category: ToolCategory;
    runtime: ToolRuntime;
    createdByAgentId: string | null;
    createdAt: Date;
  }>
> {
  return db
    .select({
      id: customTool.id,
      name: customTool.name,
      description: customTool.description,
      category: customTool.category,
      runtime: customTool.runtime,
      createdByAgentId: customTool.createdByAgentId,
      createdAt: customTool.createdAt,
    })
    .from(customTool)
    .where(
      and(
        eq(customTool.userId, userId),
        eq(customTool.status, "pending_review"),
      ),
    )
    .orderBy(customTool.createdAt)
    .limit(limit);
}
