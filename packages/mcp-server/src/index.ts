#!/usr/bin/env node
/**
 * Terragon MCP Server
 *
 * Enhanced MCP server providing AI agents with access to:
 * - Sandbox management (E2B/Daytona)
 * - Database operations (PostgreSQL)
 * - Agent delegation (specialized AI agents)
 * - Cloud storage (R2/S3)
 * - GitHub operations (PRs, issues, repos)
 *
 * Based on patterns from InsForge, adapted for Terragon.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { allTools } from "./tools/index.js";
import { routeToolCall } from "./handlers/index.js";

// Create the MCP server
const server = new Server(
  {
    name: "terragon-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// Original tools from the existing implementation
const followupTaskDescription = `
Suggest a follow-up task to the user. The user will have the option to spin up another copy of Terry to run and process this task.
Give all of the context required to do this task effectively. Use this tool anytime you think there are tasks the user should do but
don't make sense to do in the current thread. Examples of these include:

- Different options of approaches a user could take to solve a problem.
- Different steps in a long term plan.
- A follow up task to a previous task in the current thread.
- If the user asks for a task suggestion.
`;

const originalTools = [
  {
    name: "SuggestFollowupTask",
    description: followupTaskDescription,
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "A concise title for the follow-up task",
        },
        description: {
          type: "string",
          description:
            "A detailed description of what the follow-up task entails. Include all of the context required to do this task effectively.",
        },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "PermissionPrompt",
    description: "Internal permission handler for plan mode operations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tool_name: {
          type: "string",
          description: "The name of the tool requesting permission",
        },
      },
      required: ["tool_name"],
    },
  },
];

// Combine all tools
const combinedTools = [
  ...originalTools,
  ...allTools.map((tool) => ({
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      type: "object" as const,
    },
  })),
];

/**
 * Handle ListTools request
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: combinedTools,
  };
});

/**
 * Handle CallTool request
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const typedArgs = (args || {}) as Record<string, unknown>;

  // Handle original tools
  if (name === "SuggestFollowupTask") {
    return {
      content: [
        {
          type: "text",
          text: "✅ Task suggestion presented to the user.",
        },
      ],
    };
  }

  if (name === "PermissionPrompt") {
    const { tool_name } = typedArgs as { tool_name: string };

    console.error(`Permission requested for tool "${tool_name}"`);

    if (tool_name === "ExitPlanMode") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              behavior: "deny",
              message: "✏️ User is reviewing the plan.",
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            behavior: "deny",
            message: `Unexpected tool "${tool_name}" requested permission. Only ExitPlanMode is supported.\n\n${JSON.stringify(args)}`,
          }),
        },
      ],
    };
  }

  // Route to new tool handlers
  try {
    const result = await routeToolCall(name, typedArgs);
    return {
      content: result.content,
      isError: result.isError,
    };
  } catch (error) {
    console.error(`Error handling tool ${name}:`, error);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            tool: name,
          }),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Handle ListResources request
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "terragon://docs/getting-started",
        name: "Getting Started Guide",
        mimeType: "text/markdown",
        description: "Introduction to Terragon MCP server and its capabilities",
      },
      {
        uri: "terragon://docs/sandbox-guide",
        name: "Sandbox Usage Guide",
        mimeType: "text/markdown",
        description: "How to create and manage development sandboxes",
      },
      {
        uri: "terragon://docs/database-guide",
        name: "Database Operations Guide",
        mimeType: "text/markdown",
        description: "How to query and manage the database",
      },
      {
        uri: "terragon://docs/agent-guide",
        name: "Agent Delegation Guide",
        mimeType: "text/markdown",
        description: "How to spawn and manage specialized AI agents",
      },
      {
        uri: "terragon://docs/storage-guide",
        name: "Storage Operations Guide",
        mimeType: "text/markdown",
        description: "How to manage files in cloud storage",
      },
      {
        uri: "terragon://docs/github-guide",
        name: "GitHub Integration Guide",
        mimeType: "text/markdown",
        description: "How to interact with GitHub repositories",
      },
    ],
  };
});

/**
 * Handle ReadResource request
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  const docs: Record<string, string> = {
    "terragon://docs/getting-started": `# Terragon MCP Server - Getting Started

Welcome to the Terragon MCP Server! This server provides AI agents with powerful capabilities to manage development environments, databases, storage, and more.

## Available Tool Categories

### 1. Sandbox Management
Create and manage isolated development environments:
- \`CreateSandbox\` - Spin up a new development sandbox
- \`ExecuteInSandbox\` - Run commands in a sandbox
- \`GetSandboxStatus\` - Check sandbox status
- \`StopSandbox\` - Stop and clean up a sandbox

### 2. Database Operations
Query and inspect PostgreSQL databases:
- \`QueryDatabase\` - Execute read-only SQL queries
- \`ListTables\` - List all tables in a schema
- \`DescribeTable\` - Get detailed table information

### 3. Agent Delegation
Spawn specialized AI agents for complex tasks:
- \`RunAgent\` - Start a specialized agent task
- \`GetAgentStatus\` - Check agent task progress
- \`ListAgentTasks\` - View recent agent tasks

### 4. Storage Operations
Manage files in cloud storage (R2/S3):
- \`UploadFile\` - Upload files to storage
- \`DownloadFile\` - Download files from storage
- \`ListFiles\` - List files in a bucket
- \`DeleteFile\` - Remove files from storage

### 5. GitHub Integration
Interact with GitHub repositories:
- \`CreatePullRequest\` - Create a new PR
- \`GetPullRequest\` - Get PR details
- \`CreateIssue\` - Create a new issue
- \`ListIssues\` - List repository issues
`,
    "terragon://docs/sandbox-guide": `# Sandbox Usage Guide

Sandboxes are isolated development environments for running code safely.

## Creating a Sandbox

\`\`\`
CreateSandbox({
  provider: "e2b",     // or "daytona" for local
  size: "medium",      // small, medium, large
  template: "node",    // base image
  timeout: 60          // minutes
})
\`\`\`

## Best Practices

1. Always stop sandboxes when done to free resources
2. Use appropriate timeout values for long-running commands
3. Consider saving snapshots for reproducible environments
`,
    "terragon://docs/database-guide": `# Database Operations Guide

Query and inspect the PostgreSQL database.

## Querying Data

\`\`\`
QueryDatabase({
  query: "SELECT id, name FROM users WHERE active = $1",
  params: ["true"],
  limit: 100
})
\`\`\`

## Important Notes

- Only SELECT queries are allowed for safety
- Use parameterized queries to prevent SQL injection
- Results are automatically limited to prevent memory issues
`,
    "terragon://docs/agent-guide": `# Agent Delegation Guide

Spawn specialized AI agents for complex tasks.

## Available Agent Types

- **code-reviewer**: Reviews code for quality, bugs, security
- **tester**: Writes and runs tests, analyzes coverage
- **researcher**: Researches technical topics
- **debugger**: Debugs issues, analyzes logs
- **planner**: Creates implementation plans
`,
    "terragon://docs/storage-guide": `# Storage Operations Guide

Manage files in cloud storage (R2/S3 compatible).

## Uploading Files

\`\`\`
UploadFile({
  bucket: "default",
  key: "uploads/image.png",
  content: "base64-encoded-content",
  isBase64: true
})
\`\`\`
`,
    "terragon://docs/github-guide": `# GitHub Integration Guide

Interact with GitHub repositories, PRs, and issues.

## Creating a Pull Request

\`\`\`
CreatePullRequest({
  owner: "myorg",
  repo: "myrepo",
  title: "Add new feature",
  head: "feature-branch",
  base: "main"
})
\`\`\`
`,
  };

  const content = docs[uri];
  if (!content) {
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `Resource not found: ${uri}`,
        },
      ],
    };
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: content,
      },
    ],
  };
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Terragon MCP server running on stdio");
  console.error(`Loaded ${combinedTools.length} tools`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
