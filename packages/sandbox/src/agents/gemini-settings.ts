import { McpConfig } from "../mcp-config";

// https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md#mcpservers
type GeminiMcpServer = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  httpUrl?: string;
  headers?: Record<string, string>;
};

export function buildGeminiSettings({
  userMcpConfig,
}: {
  userMcpConfig: McpConfig | undefined;
}): string {
  const mcpServers: Record<string, GeminiMcpServer> = {};
  for (const [name, server] of Object.entries(
    userMcpConfig?.mcpServers ?? {},
  )) {
    if ("command" in server) {
      mcpServers[name] = {
        command: server.command,
        args: server.args,
        env: server.env,
      };
    } else if (server.type === "http") {
      mcpServers[name] = {
        httpUrl: server.url,
        headers: server.headers,
        env: server.env,
      };
    } else if (server.type === "sse") {
      mcpServers[name] = {
        url: server.url,
        headers: server.headers,
        env: server.env,
      };
    }
  }
  return JSON.stringify(
    {
      security: {
        auth: {
          selectedType: "gemini-api-key",
        },
      },
      ui: {
        theme: "Default",
      },
      general: {
        previewFeatures: true,
      },
      mcpServers,
    },
    null,
    2,
  );
}
