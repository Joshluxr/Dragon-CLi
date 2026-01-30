/**
 * Sandbox Management Tools
 *
 * These tools allow AI agents to create, manage, and execute commands
 * in isolated development environments (E2B or Daytona sandboxes).
 */

import type { ToolDefinition } from "../types/index.js";

export const sandboxTools: ToolDefinition[] = [
  {
    name: "CreateSandbox",
    description: `Create a new development sandbox for code execution.

Use this when:
- User wants to run code in an isolated environment
- Need to test code changes safely
- Setting up a new development environment

Returns: sandboxId, status, and connection details`,
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["e2b", "daytona"],
          description:
            "Sandbox provider. 'e2b' for cloud sandboxes, 'daytona' for local/self-hosted. Default: e2b",
        },
        size: {
          type: "string",
          enum: ["small", "medium", "large"],
          description:
            "Resource allocation. small: 1 CPU/2GB RAM, medium: 2 CPU/4GB RAM, large: 4 CPU/8GB RAM. Default: small",
        },
        template: {
          type: "string",
          description:
            "Base template/image for the sandbox (e.g., 'node', 'python', 'rust'). Default: node",
        },
        timeout: {
          type: "number",
          description: "Sandbox timeout in minutes. Default: 60, Max: 480",
        },
      },
    },
  },
  {
    name: "ExecuteInSandbox",
    description: `Execute a command in an existing sandbox.

Use this when:
- Running build commands (npm install, cargo build, etc.)
- Executing tests (npm test, pytest, etc.)
- Running scripts or applications
- Git operations within the sandbox

IMPORTANT: Commands run with the sandbox's default shell.
Long-running commands should use appropriate timeouts.

Returns: stdout, stderr, exitCode, duration`,
    inputSchema: {
      type: "object",
      properties: {
        sandboxId: {
          type: "string",
          description: "ID of the target sandbox (from CreateSandbox)",
        },
        command: {
          type: "string",
          description: "Shell command to execute",
        },
        workingDir: {
          type: "string",
          description:
            "Working directory for command execution. Default: /home/user/project",
        },
        timeout: {
          type: "number",
          description: "Command timeout in seconds. Default: 300 (5 min)",
        },
      },
      required: ["sandboxId", "command"],
    },
  },
  {
    name: "GetSandboxStatus",
    description: `Get the current status and details of a sandbox.

Returns: status, uptime, resource usage, and connection info`,
    inputSchema: {
      type: "object",
      properties: {
        sandboxId: {
          type: "string",
          description: "ID of the sandbox to check",
        },
      },
      required: ["sandboxId"],
    },
  },
  {
    name: "StopSandbox",
    description: `Stop and clean up a sandbox.

Use this when:
- Task is complete and sandbox is no longer needed
- Need to free up resources
- Want to save a snapshot before stopping

IMPORTANT: This action is irreversible unless saveSnapshot is true.

Returns: confirmation and optional snapshot ID`,
    inputSchema: {
      type: "object",
      properties: {
        sandboxId: {
          type: "string",
          description: "ID of the sandbox to stop",
        },
        saveSnapshot: {
          type: "boolean",
          description:
            "Whether to save a snapshot before stopping. Default: false",
        },
      },
      required: ["sandboxId"],
    },
  },
  {
    name: "WriteFileToSandbox",
    description: `Write a file to the sandbox filesystem.

Use this when:
- Creating new source files
- Writing configuration files
- Updating existing files

Returns: success status and file path`,
    inputSchema: {
      type: "object",
      properties: {
        sandboxId: {
          type: "string",
          description: "ID of the target sandbox",
        },
        path: {
          type: "string",
          description: "File path within the sandbox",
        },
        content: {
          type: "string",
          description: "File content to write",
        },
        encoding: {
          type: "string",
          enum: ["utf-8", "base64"],
          description: "Content encoding. Default: utf-8",
        },
      },
      required: ["sandboxId", "path", "content"],
    },
  },
  {
    name: "ReadFileFromSandbox",
    description: `Read a file from the sandbox filesystem.

Returns: file content and metadata`,
    inputSchema: {
      type: "object",
      properties: {
        sandboxId: {
          type: "string",
          description: "ID of the target sandbox",
        },
        path: {
          type: "string",
          description: "File path within the sandbox",
        },
        encoding: {
          type: "string",
          enum: ["utf-8", "base64"],
          description: "Output encoding. Default: utf-8",
        },
      },
      required: ["sandboxId", "path"],
    },
  },
];

export const sandboxToolNames = sandboxTools.map((t) => t.name);
