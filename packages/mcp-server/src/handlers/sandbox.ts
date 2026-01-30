/**
 * Sandbox Handler
 *
 * Handles sandbox-related MCP tool calls by delegating to the sandbox service.
 * In production, this connects to the actual sandbox infrastructure.
 * For MCP server standalone mode, it provides simulated responses.
 */

import type {
  ToolResult,
  CreateSandboxArgs,
  ExecuteInSandboxArgs,
  GetSandboxStatusArgs,
  StopSandboxArgs,
} from "../types/index.js";

// Simulated sandbox state for standalone MCP server mode
const sandboxes = new Map<
  string,
  {
    id: string;
    provider: string;
    status: "creating" | "running" | "stopped";
    createdAt: Date;
    template: string;
    size: string;
  }
>();

/**
 * Generate a sandbox ID
 */
function generateSandboxId(): string {
  return `sbx_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Create a new sandbox
 */
export async function handleCreateSandbox(
  args: CreateSandboxArgs,
): Promise<ToolResult> {
  const {
    provider = "e2b",
    size = "small",
    template = "node",
    timeout = 60,
  } = args;

  // Validate timeout
  if (timeout < 1 || timeout > 480) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Invalid timeout. Must be between 1 and 480 minutes.",
          }),
        },
      ],
      isError: true,
    };
  }

  const sandboxId = generateSandboxId();

  // Store sandbox state
  sandboxes.set(sandboxId, {
    id: sandboxId,
    provider,
    status: "running",
    createdAt: new Date(),
    template,
    size,
  });

  // In production, this would call the actual sandbox service:
  // const sandbox = await sandboxService.create({ provider, size, template, timeout });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sandboxId,
          status: "running",
          provider,
          size,
          template,
          timeout,
          message: `Sandbox created successfully. Provider: ${provider}, Template: ${template}`,
          connectionInfo: {
            sshHost: `${sandboxId}.sandbox.terragon.dev`,
            sshPort: 22,
            webUrl: `https://${sandboxId}.sandbox.terragon.dev`,
          },
        }),
      },
    ],
  };
}

/**
 * Execute command in sandbox
 */
export async function handleExecuteInSandbox(
  args: ExecuteInSandboxArgs,
): Promise<ToolResult> {
  const { sandboxId, command, workingDir = "/home/user/project" } = args;
  // timeout available for production use

  // Check if sandbox exists
  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Sandbox not found: ${sandboxId}`,
            suggestion: "Use CreateSandbox to create a new sandbox first.",
          }),
        },
      ],
      isError: true,
    };
  }

  if (sandbox.status !== "running") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Sandbox is not running. Current status: ${sandbox.status}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // In production, this would execute the command in the sandbox:
  // const result = await sandboxService.execute(sandboxId, command, { workingDir, timeout });

  // Simulated response
  const simulatedOutput = getSimulatedOutput(command);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sandboxId,
          command,
          workingDir,
          exitCode: simulatedOutput.exitCode,
          stdout: simulatedOutput.stdout,
          stderr: simulatedOutput.stderr,
          duration: simulatedOutput.duration,
        }),
      },
    ],
  };
}

/**
 * Get sandbox status
 */
export async function handleGetSandboxStatus(
  args: GetSandboxStatusArgs,
): Promise<ToolResult> {
  const { sandboxId } = args;

  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Sandbox not found: ${sandboxId}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const uptime = Math.floor((Date.now() - sandbox.createdAt.getTime()) / 1000);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sandboxId,
          status: sandbox.status,
          provider: sandbox.provider,
          template: sandbox.template,
          size: sandbox.size,
          createdAt: sandbox.createdAt.toISOString(),
          uptime: `${uptime}s`,
          resources: {
            cpuUsage: "12%",
            memoryUsage: "256MB / 2048MB",
            diskUsage: "1.2GB / 10GB",
          },
        }),
      },
    ],
  };
}

/**
 * Stop sandbox
 */
export async function handleStopSandbox(
  args: StopSandboxArgs,
): Promise<ToolResult> {
  const { sandboxId, saveSnapshot = false } = args;

  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Sandbox not found: ${sandboxId}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Update status
  sandbox.status = "stopped";

  // In production:
  // if (saveSnapshot) {
  //   const snapshotId = await sandboxService.snapshot(sandboxId);
  // }
  // await sandboxService.stop(sandboxId);

  const response: Record<string, unknown> = {
    sandboxId,
    status: "stopped",
    message: "Sandbox stopped successfully.",
  };

  if (saveSnapshot) {
    response.snapshotId = `snap_${Date.now().toString(36)}`;
    response.snapshotMessage = "Snapshot saved successfully.";
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
 * Write file to sandbox
 */
export async function handleWriteFileToSandbox(args: {
  sandboxId: string;
  path: string;
  content: string;
  encoding?: string;
}): Promise<ToolResult> {
  const { sandboxId, path, content, encoding = "utf-8" } = args;

  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Sandbox not found: ${sandboxId}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // In production:
  // await sandboxService.writeFile(sandboxId, path, content, encoding);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          sandboxId,
          path,
          size: Buffer.byteLength(content, encoding as BufferEncoding),
          message: `File written successfully: ${path}`,
        }),
      },
    ],
  };
}

/**
 * Read file from sandbox
 */
export async function handleReadFileFromSandbox(args: {
  sandboxId: string;
  path: string;
  encoding?: string;
}): Promise<ToolResult> {
  const { sandboxId, path, encoding = "utf-8" } = args;

  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Sandbox not found: ${sandboxId}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // In production:
  // const content = await sandboxService.readFile(sandboxId, path, encoding);

  // Simulated response
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sandboxId,
          path,
          encoding,
          content: `// File content from ${path}\n// This is simulated content in MCP standalone mode`,
          size: 100,
        }),
      },
    ],
  };
}

/**
 * Route sandbox tool calls
 */
export async function handleSandboxTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "CreateSandbox":
      return handleCreateSandbox(args as unknown as CreateSandboxArgs);
    case "ExecuteInSandbox":
      return handleExecuteInSandbox(args as unknown as ExecuteInSandboxArgs);
    case "GetSandboxStatus":
      return handleGetSandboxStatus(args as unknown as GetSandboxStatusArgs);
    case "StopSandbox":
      return handleStopSandbox(args as unknown as StopSandboxArgs);
    case "WriteFileToSandbox":
      return handleWriteFileToSandbox(
        args as {
          sandboxId: string;
          path: string;
          content: string;
          encoding?: string;
        },
      );
    case "ReadFileFromSandbox":
      return handleReadFileFromSandbox(
        args as { sandboxId: string; path: string; encoding?: string },
      );
    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown sandbox tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
}

/**
 * Get simulated command output for standalone mode
 */
function getSimulatedOutput(command: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: string;
} {
  const duration = `${Math.floor(Math.random() * 1000 + 100)}ms`;

  // Simulate common commands
  if (command.includes("npm install") || command.includes("pnpm install")) {
    return {
      exitCode: 0,
      stdout:
        "added 150 packages in 3.2s\n\n50 packages are looking for funding\n  run `npm fund` for details",
      stderr: "",
      duration,
    };
  }

  if (command.includes("npm test") || command.includes("pnpm test")) {
    return {
      exitCode: 0,
      stdout:
        "PASS  src/index.test.ts\n  ✓ should work correctly (5ms)\n\nTest Suites: 1 passed, 1 total\nTests:       3 passed, 3 total",
      stderr: "",
      duration,
    };
  }

  if (command.includes("npm run build") || command.includes("pnpm build")) {
    return {
      exitCode: 0,
      stdout: "Build completed successfully.\nOutput: ./dist",
      stderr: "",
      duration,
    };
  }

  if (command.startsWith("ls")) {
    return {
      exitCode: 0,
      stdout: "node_modules\npackage.json\nsrc\ntsconfig.json",
      stderr: "",
      duration,
    };
  }

  if (command.startsWith("cat ") || command.startsWith("head ")) {
    return {
      exitCode: 0,
      stdout:
        "// File content\nexport function main() {\n  console.log('Hello');\n}",
      stderr: "",
      duration,
    };
  }

  if (command.startsWith("git ")) {
    return {
      exitCode: 0,
      stdout: "Git operation completed.",
      stderr: "",
      duration,
    };
  }

  // Default response
  return {
    exitCode: 0,
    stdout: `Command executed: ${command}`,
    stderr: "",
    duration,
  };
}
