/**
 * Agent Tools
 *
 * These tools allow AI agents to spawn and manage specialized sub-agents
 * for tasks like code review, testing, research, and debugging.
 */

import type { ToolDefinition } from "../types/index.js";

export const agentTools: ToolDefinition[] = [
  {
    name: "RunAgent",
    description: `Spawn a specialized AI agent to perform a task.

Use this when:
- Delegating complex tasks to specialized agents
- Running parallel workloads
- Performing long-running operations
- Need specialized expertise (code review, testing, etc.)

Available agent types:
- code-reviewer: Review code for quality, bugs, security issues
- tester: Write and run tests, analyze coverage
- researcher: Research technical topics, find documentation
- debugger: Debug issues, analyze logs, trace errors
- planner: Create implementation plans, design architecture

Returns: taskId for async tasks, or result for sync tasks`,
    inputSchema: {
      type: "object",
      properties: {
        agentType: {
          type: "string",
          enum: [
            "code-reviewer",
            "tester",
            "researcher",
            "debugger",
            "planner",
          ],
          description: "Type of specialized agent to spawn",
        },
        task: {
          type: "string",
          description:
            "Detailed task description for the agent. Be specific about what you want.",
        },
        context: {
          type: "object",
          description:
            "Additional context for the agent (files, previous results, etc.)",
          properties: {
            files: {
              type: "array",
              items: { type: "string" },
              description: "List of file paths relevant to the task",
            },
            previousResults: {
              type: "string",
              description: "Results from previous agent runs",
            },
            constraints: {
              type: "string",
              description: "Constraints or requirements for the task",
            },
          },
        },
        sandboxId: {
          type: "string",
          description:
            "Sandbox ID if agent needs to execute code. Required for tester and debugger agents.",
        },
        async: {
          type: "boolean",
          description:
            "Run agent asynchronously. Returns taskId immediately. Default: false",
        },
        timeout: {
          type: "number",
          description: "Task timeout in seconds. Default: 300 (5 min)",
        },
      },
      required: ["agentType", "task"],
    },
  },
  {
    name: "GetAgentStatus",
    description: `Check the status of a running agent task.

Use this when:
- Checking progress of async agent tasks
- Retrieving results of completed tasks
- Monitoring long-running operations

Returns: status, progress, result (if completed), error (if failed)`,
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "ID of the agent task (from RunAgent with async: true)",
        },
        waitForCompletion: {
          type: "boolean",
          description:
            "Block until task completes. Default: false (returns current status)",
        },
        timeout: {
          type: "number",
          description:
            "Timeout in seconds if waitForCompletion is true. Default: 60",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "CancelAgent",
    description: `Cancel a running agent task.

Use this when:
- Task is taking too long
- Results are no longer needed
- Need to free up resources

Returns: confirmation of cancellation`,
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "ID of the agent task to cancel",
        },
        reason: {
          type: "string",
          description: "Reason for cancellation (for logging)",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "ListAgentTasks",
    description: `List recent agent tasks and their statuses.

Use this when:
- Need overview of all running/recent tasks
- Finding a specific task ID
- Monitoring system activity

Returns: array of tasks with id, type, status, and timestamps`,
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "pending",
            "running",
            "completed",
            "failed",
            "cancelled",
            "all",
          ],
          description: "Filter by status. Default: 'all'",
        },
        limit: {
          type: "number",
          description: "Maximum tasks to return. Default: 20",
        },
        agentType: {
          type: "string",
          enum: [
            "code-reviewer",
            "tester",
            "researcher",
            "debugger",
            "planner",
          ],
          description: "Filter by agent type",
        },
      },
    },
  },
];

export const agentToolNames = agentTools.map((t) => t.name);
