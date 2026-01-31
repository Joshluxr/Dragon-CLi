/**
 * Tools Index
 *
 * Exports all tool definitions and utility functions
 */

export { sandboxTools, sandboxToolNames } from "./sandbox.js";
export { databaseTools, databaseToolNames } from "./database.js";
export { agentTools, agentToolNames } from "./agent.js";
export { storageTools, storageToolNames } from "./storage.js";
export { githubTools, githubToolNames } from "./github.js";
export { memoryTools, memoryToolNames } from "./memory.js";

import { sandboxTools } from "./sandbox.js";
import { databaseTools } from "./database.js";
import { agentTools } from "./agent.js";
import { storageTools } from "./storage.js";
import { githubTools } from "./github.js";
import { memoryTools } from "./memory.js";
import type { ToolDefinition } from "../types/index.js";

/**
 * All tool definitions combined
 */
export const allTools: ToolDefinition[] = [
  ...sandboxTools,
  ...databaseTools,
  ...agentTools,
  ...storageTools,
  ...githubTools,
  ...memoryTools,
];

/**
 * Get a tool by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return allTools.find((t) => t.name === name);
}

/**
 * Check if a tool name exists
 */
export function isValidToolName(name: string): boolean {
  return allTools.some((t) => t.name === name);
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return allTools.map((t) => t.name);
}

/**
 * Tool categories for organization
 */
export const toolCategories = {
  sandbox: sandboxTools.map((t) => t.name),
  database: databaseTools.map((t) => t.name),
  agent: agentTools.map((t) => t.name),
  storage: storageTools.map((t) => t.name),
  github: githubTools.map((t) => t.name),
  memory: memoryTools.map((t) => t.name),
} as const;

/**
 * Get category for a tool name
 */
export function getToolCategory(
  name: string,
): keyof typeof toolCategories | undefined {
  for (const [category, tools] of Object.entries(toolCategories)) {
    if (tools.includes(name)) {
      return category as keyof typeof toolCategories;
    }
  }
  return undefined;
}
