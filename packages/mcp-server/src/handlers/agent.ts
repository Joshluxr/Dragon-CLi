/**
 * Agent Handler
 *
 * Handles agent-related MCP tool calls for spawning and managing
 * specialized AI agents (code-reviewer, tester, researcher, etc.)
 */

import type {
  ToolResult,
  RunAgentArgs,
  GetAgentStatusArgs,
} from "../types/index.js";

// Agent task state
interface AgentTask {
  id: string;
  agentType: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const agentTasks = new Map<string, AgentTask>();

/**
 * Generate a task ID
 */
function generateTaskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Run an agent task
 */
export async function handleRunAgent(args: RunAgentArgs): Promise<ToolResult> {
  const {
    agentType,
    task,
    // context is available for production use
    sandboxId,
    async: isAsync = false,
    timeout = 300,
  } = args;

  // Validate agent type
  const validTypes = [
    "code-reviewer",
    "tester",
    "researcher",
    "debugger",
    "planner",
  ];
  if (!validTypes.includes(agentType)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Invalid agent type: ${agentType}`,
            validTypes,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate sandbox requirement for certain agents
  if ((agentType === "tester" || agentType === "debugger") && !sandboxId) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `${agentType} agent requires a sandboxId for code execution.`,
            suggestion: "Create a sandbox first using CreateSandbox.",
          }),
        },
      ],
      isError: true,
    };
  }

  const taskId = generateTaskId();
  const now = new Date();

  // Create task entry
  const agentTask: AgentTask = {
    id: taskId,
    agentType,
    task,
    status: isAsync ? "pending" : "running",
    createdAt: now,
    startedAt: isAsync ? undefined : now,
  };

  agentTasks.set(taskId, agentTask);

  // In production, this would spawn the actual agent:
  // const agent = AgentFactory.create(agentType);
  // if (isAsync) {
  //   agent.runAsync(task, context, sandboxId);
  // } else {
  //   const result = await agent.run(task, context, sandboxId);
  // }

  if (isAsync) {
    // Simulate async task starting
    setTimeout(() => {
      const task = agentTasks.get(taskId);
      if (task && task.status === "pending") {
        task.status = "running";
        task.startedAt = new Date();
        task.progress = 0;
      }
    }, 100);

    // Simulate task completion after some time
    setTimeout(() => {
      const task = agentTasks.get(taskId);
      if (task && task.status === "running") {
        task.status = "completed";
        task.completedAt = new Date();
        task.progress = 100;
        task.result = getSimulatedAgentResult(agentType, task.task);
      }
    }, 3000);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            taskId,
            agentType,
            status: "pending",
            message: `Agent task queued. Use GetAgentStatus to check progress.`,
            timeout,
          }),
        },
      ],
    };
  }

  // Synchronous execution - simulate result
  agentTask.status = "completed";
  agentTask.completedAt = new Date();
  agentTask.result = getSimulatedAgentResult(agentType, task);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          taskId,
          agentType,
          status: "completed",
          result: agentTask.result,
          duration: `${Math.floor(Math.random() * 5000 + 1000)}ms`,
        }),
      },
    ],
  };
}

/**
 * Get agent task status
 */
export async function handleGetAgentStatus(
  args: GetAgentStatusArgs,
): Promise<ToolResult> {
  const extendedArgs = args as GetAgentStatusArgs & {
    waitForCompletion?: boolean;
    timeout?: number;
  };
  const { taskId, waitForCompletion = false } = extendedArgs;
  // timeout available for production use with actual waiting

  const task = agentTasks.get(taskId);
  if (!task) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Task not found: ${taskId}`,
            suggestion: "Use ListAgentTasks to see available tasks.",
          }),
        },
      ],
      isError: true,
    };
  }

  // If waiting for completion, simulate blocking wait
  if (
    waitForCompletion &&
    task.status !== "completed" &&
    task.status !== "failed"
  ) {
    // In production, this would actually wait
    // await waitForTaskCompletion(taskId, timeout);
  }

  const response: Record<string, unknown> = {
    taskId,
    agentType: task.agentType,
    task: task.task,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
  };

  if (task.startedAt) {
    response.startedAt = task.startedAt.toISOString();
  }

  if (task.progress !== undefined) {
    response.progress = task.progress;
  }

  if (task.status === "completed") {
    response.completedAt = task.completedAt?.toISOString();
    response.result = task.result;
    response.duration =
      task.completedAt && task.startedAt
        ? `${task.completedAt.getTime() - task.startedAt.getTime()}ms`
        : undefined;
  }

  if (task.status === "failed") {
    response.error = task.error;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response),
      },
    ],
  };
}

/**
 * Cancel agent task
 */
export async function handleCancelAgent(args: {
  taskId: string;
  reason?: string;
}): Promise<ToolResult> {
  const { taskId, reason } = args;

  const task = agentTasks.get(taskId);
  if (!task) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Task not found: ${taskId}`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (task.status === "completed" || task.status === "failed") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Cannot cancel task with status: ${task.status}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // In production:
  // await agentService.cancel(taskId);

  task.status = "cancelled";
  task.completedAt = new Date();
  task.error = reason || "Cancelled by user";

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          taskId,
          status: "cancelled",
          reason: reason || "Cancelled by user",
          message: "Task cancelled successfully.",
        }),
      },
    ],
  };
}

/**
 * List agent tasks
 */
export async function handleListAgentTasks(args: {
  status?: string;
  limit?: number;
  agentType?: string;
}): Promise<ToolResult> {
  const { status = "all", limit = 20, agentType } = args;

  let tasks = Array.from(agentTasks.values());

  // Filter by status
  if (status !== "all") {
    tasks = tasks.filter((t) => t.status === status);
  }

  // Filter by agent type
  if (agentType) {
    tasks = tasks.filter((t) => t.agentType === agentType);
  }

  // Sort by creation date (newest first)
  tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Limit results
  tasks = tasks.slice(0, limit);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          totalCount: tasks.length,
          filter: { status, agentType },
          tasks: tasks.map((t) => ({
            id: t.id,
            agentType: t.agentType,
            task: t.task.substring(0, 100) + (t.task.length > 100 ? "..." : ""),
            status: t.status,
            progress: t.progress,
            createdAt: t.createdAt.toISOString(),
          })),
        }),
      },
    ],
  };
}

/**
 * Route agent tool calls
 */
export async function handleAgentTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "RunAgent":
      return handleRunAgent(args as unknown as RunAgentArgs);
    case "GetAgentStatus":
      return handleGetAgentStatus(args as unknown as GetAgentStatusArgs);
    case "CancelAgent":
      return handleCancelAgent(
        args as unknown as { taskId: string; reason?: string },
      );
    case "ListAgentTasks":
      return handleListAgentTasks(
        args as unknown as {
          status?: string;
          limit?: number;
          agentType?: string;
        },
      );
    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown agent tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
}

/**
 * Get simulated agent results for standalone mode
 */
function getSimulatedAgentResult(agentType: string, task: string): unknown {
  switch (agentType) {
    case "code-reviewer":
      return {
        summary: "Code review completed",
        findings: [
          {
            severity: "warning",
            file: "src/index.ts",
            line: 42,
            message: "Consider adding error handling for edge cases",
          },
          {
            severity: "info",
            file: "src/utils.ts",
            line: 15,
            message: "This function could be simplified using array methods",
          },
        ],
        overallScore: 8.5,
        recommendations: [
          "Add unit tests for new functions",
          "Consider extracting repeated logic into a helper",
        ],
      };

    case "tester":
      return {
        summary: "Test execution completed",
        totalTests: 25,
        passed: 23,
        failed: 2,
        skipped: 0,
        coverage: {
          lines: 85.5,
          functions: 90.2,
          branches: 78.3,
        },
        failures: [
          {
            test: "should handle empty input",
            error: "Expected undefined to equal ''",
          },
          {
            test: "should validate email format",
            error: "Timeout exceeded",
          },
        ],
      };

    case "researcher":
      return {
        summary: "Research completed",
        topic: task,
        findings: [
          "The recommended approach involves using X library",
          "Common patterns include A, B, and C",
          "Potential pitfalls to avoid: P1, P2",
        ],
        resources: [
          { title: "Official Documentation", url: "https://docs.example.com" },
          { title: "Best Practices Guide", url: "https://guide.example.com" },
        ],
        recommendations:
          "Based on the research, implementing option B would be most suitable",
      };

    case "debugger":
      return {
        summary: "Debug analysis completed",
        issue: task,
        rootCause:
          "The error occurs due to unhandled null reference in async callback",
        stackTrace: [
          "at processData (src/processor.ts:45)",
          "at async handleRequest (src/handler.ts:23)",
        ],
        suggestedFix: "Add null check before accessing the property",
        relatedIssues: ["Similar issue fixed in commit abc123"],
      };

    case "planner":
      return {
        summary: "Implementation plan created",
        task,
        phases: [
          {
            phase: 1,
            name: "Setup and Configuration",
            tasks: ["Initialize project", "Configure dependencies"],
            estimatedComplexity: "low",
          },
          {
            phase: 2,
            name: "Core Implementation",
            tasks: ["Implement main logic", "Add data models"],
            estimatedComplexity: "medium",
          },
          {
            phase: 3,
            name: "Testing and Validation",
            tasks: ["Write unit tests", "Integration testing"],
            estimatedComplexity: "medium",
          },
        ],
        dependencies: ["Database setup", "API authentication"],
        risks: ["External API rate limits", "Data migration complexity"],
      };

    default:
      return { message: "Agent task completed", task };
  }
}
