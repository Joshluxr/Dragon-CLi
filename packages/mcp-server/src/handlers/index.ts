/**
 * Handlers Index
 *
 * Exports all handler functions and routing utilities
 */

export { handleSandboxTool } from "./sandbox.js";
export { handleDatabaseTool } from "./database.js";
export { handleAgentTool } from "./agent.js";
export { handleStorageTool } from "./storage.js";
export { handleGithubTool } from "./github.js";
export { handleMemoryTool } from "./memory.js";

import { handleSandboxTool } from "./sandbox.js";
import { handleDatabaseTool } from "./database.js";
import { handleAgentTool } from "./agent.js";
import { handleStorageTool } from "./storage.js";
import { handleGithubTool } from "./github.js";
import { handleMemoryTool } from "./memory.js";
import { sandboxToolNames } from "../tools/sandbox.js";
import { databaseToolNames } from "../tools/database.js";
import { agentToolNames } from "../tools/agent.js";
import { storageToolNames } from "../tools/storage.js";
import { githubToolNames } from "../tools/github.js";
import { memoryToolNames } from "../tools/memory.js";
import type { ToolResult } from "../types/index.js";

/**
 * Route a tool call to the appropriate handler
 */
export async function routeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // Route based on tool name
  if (sandboxToolNames.includes(name)) {
    return handleSandboxTool(name, args);
  }

  if (databaseToolNames.includes(name)) {
    return handleDatabaseTool(name, args);
  }

  if (agentToolNames.includes(name)) {
    return handleAgentTool(name, args);
  }

  if (storageToolNames.includes(name)) {
    return handleStorageTool(name, args);
  }

  if (githubToolNames.includes(name)) {
    return handleGithubTool(name, args);
  }

  if ((memoryToolNames as readonly string[]).includes(name)) {
    return handleMemoryTool(name as (typeof memoryToolNames)[number], args);
  }

  // Unknown tool
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: `Unknown tool: ${name}`,
          suggestion: "Use ListTools to see available tools.",
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Get the category of a tool
 */
export function getToolHandler(name: string): string | undefined {
  if (sandboxToolNames.includes(name)) return "sandbox";
  if (databaseToolNames.includes(name)) return "database";
  if (agentToolNames.includes(name)) return "agent";
  if (storageToolNames.includes(name)) return "storage";
  if (githubToolNames.includes(name)) return "github";
  if ((memoryToolNames as readonly string[]).includes(name)) return "memory";
  return undefined;
}
