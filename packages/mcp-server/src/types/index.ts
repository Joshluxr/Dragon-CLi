/**
 * MCP Server Types
 */

export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Sandbox Types
export interface CreateSandboxArgs {
  provider?: "e2b" | "daytona";
  size?: "small" | "medium" | "large";
  template?: string;
  timeout?: number;
}

export interface ExecuteInSandboxArgs {
  sandboxId: string;
  command: string;
  workingDir?: string;
  timeout?: number;
}

export interface GetSandboxStatusArgs {
  sandboxId: string;
}

export interface StopSandboxArgs {
  sandboxId: string;
  saveSnapshot?: boolean;
}

// Database Types
export interface QueryDatabaseArgs {
  query: string;
  params?: string[];
  limit?: number;
}

export interface ListTablesArgs {
  schema?: string;
  includeColumns?: boolean;
}

export interface DescribeTableArgs {
  tableName: string;
  includeIndexes?: boolean;
  includeForeignKeys?: boolean;
}

// Agent Types
export interface RunAgentArgs {
  agentType: "code-reviewer" | "tester" | "researcher" | "debugger" | "planner";
  task: string;
  context?: Record<string, unknown>;
  sandboxId?: string;
  async?: boolean;
  timeout?: number;
}

export interface GetAgentStatusArgs {
  taskId: string;
}

// Storage Types
export interface UploadFileArgs {
  bucket: string;
  key: string;
  content: string;
  contentType?: string;
  isBase64?: boolean;
}

export interface DownloadFileArgs {
  bucket: string;
  key: string;
  asBase64?: boolean;
}

export interface ListFilesArgs {
  bucket: string;
  prefix?: string;
  limit?: number;
}

export interface DeleteFileArgs {
  bucket: string;
  key: string;
}

// GitHub Types
export interface CreatePullRequestArgs {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base?: string;
  draft?: boolean;
}

export interface GetPullRequestArgs {
  owner: string;
  repo: string;
  prNumber: number;
}

export interface ListPullRequestsArgs {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  limit?: number;
}

export interface CreateIssueArgs {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}
