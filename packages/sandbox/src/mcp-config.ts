import * as z from "zod/v4";

// Command-based MCP Server
const CommandMcpServerSchema = z.object({
  command: z.string().min(1, "Command is required"),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

// HTTP-based MCP Server
const HttpMcpServerSchema = z.object({
  type: z.literal("http"),
  url: z.string().url("Must be a valid URL"),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const SSEMcpServerSchema = z.object({
  type: z.literal("sse"),
  url: z.string().url("Must be a valid URL"),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

// MCP Server Schema that supports both command and HTTP types
export const McpServerSchema = z.union([
  CommandMcpServerSchema,
  HttpMcpServerSchema,
  SSEMcpServerSchema,
]);

export const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerSchema),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;
export type CommandMcpServer = z.infer<typeof CommandMcpServerSchema>;
export type HttpMcpServer = z.infer<typeof HttpMcpServerSchema>;

// Validate MCP config and ensure no reserved server names are used
export function validateMcpConfig(
  config: unknown,
): { success: true; data: McpConfig } | { success: false; error: string } {
  // First validate the schema
  const result = McpConfigSchema.safeParse(config);

  if (!result.success) {
    // Check for common misconfigurations first
    if (
      typeof config === "object" &&
      config !== null &&
      "mcpServers" in config
    ) {
      const mcpServers = (config as any).mcpServers;
      if (typeof mcpServers === "object" && mcpServers !== null) {
        for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
          if (typeof serverConfig === "object" && serverConfig !== null) {
            // Check if url is present without type: "http"
            if ("url" in serverConfig && !("type" in serverConfig)) {
              return {
                success: false,
                error: `mcpServers.${serverName}: When using a URL, you must specify type: "http". Add type: "http" to use an HTTP-based MCP server.`,
              };
            }
          }
        }
      }
    }

    // For union validation errors, Zod creates multiple error paths
    // We need to find the most specific error message
    const issues = result.error.issues;

    // Look for the most specific non-union error
    let mostSpecificError: (typeof issues)[number] | null = null;
    let mostSpecificPath = "";

    // First, try to find a non-union error
    for (const error of issues) {
      if (error.code !== "invalid_union") {
        const path = error.path.join(".");
        if (!mostSpecificError || path.length > mostSpecificPath.length) {
          mostSpecificError = error;
          mostSpecificPath = path;
        }
      }
    }

    // If we only have union errors, try to extract the nested issues
    if (!mostSpecificError && issues.length > 0) {
      const unionIssue = issues.find((e) => e.code === "invalid_union");
      if (unionIssue && Array.isArray((unionIssue as any).errors)) {
        const unionErrors = (unionIssue as any).errors as (typeof issues)[];
        const unionBasePath = (unionIssue as any).path as (string | number)[];
        for (const optionIssues of unionErrors) {
          for (const error of optionIssues) {
            const combined = [...(unionBasePath ?? []), ...error.path];
            const path = combined.join(".");
            if (!mostSpecificError || path.length > mostSpecificPath.length) {
              // Rehydrate error with full path so downstream message can include it
              mostSpecificError = { ...error, path: combined } as typeof error;
              mostSpecificPath = path;
            }
          }
        }
      }
    }

    // Fall back to the first error if we still don't have one
    if (!mostSpecificError) {
      mostSpecificError = issues[0] ?? null;
    }

    if (!mostSpecificError) {
      return {
        success: false,
        error: "Invalid MCP configuration",
      };
    }

    const path = mostSpecificError.path.join(".");
    // Normalize messages to match expected wording in tests
    let message = mostSpecificError.message;
    if (message.startsWith("Invalid input: ")) {
      message = message.slice("Invalid input: ".length);
      if (message.toLowerCase().startsWith("expected ")) {
        message = message[0]?.toUpperCase() + message.slice(1);
      }
      if (/received undefined\s*$/.test(message)) {
        message = "Required";
      }
    }
    return {
      success: false,
      error: `${path ? `${path}: ` : ""}${message}`,
    };
  }

  // Check for reserved server names
  if (result.data.mcpServers.terry) {
    return {
      success: false,
      error:
        "Cannot override the built-in 'terry' server. Please use a different server name.",
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
