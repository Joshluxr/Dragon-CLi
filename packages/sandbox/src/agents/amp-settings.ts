import { McpConfig, McpServer } from "../mcp-config";

type AmpCommandServer = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type AmpRemoteServer = {
  url: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  type?: "http" | "sse";
};

type AmpSettings = {
  "amp.mcpServers": Record<string, AmpCommandServer | AmpRemoteServer>;
};

function transformServer(
  server: McpServer,
): AmpCommandServer | AmpRemoteServer {
  if ("command" in server) {
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env ? { env: server.env } : {}),
    } satisfies AmpCommandServer;
  }

  return {
    url: server.url,
    ...(server.headers ? { headers: server.headers } : {}),
    ...(server.env ? { env: server.env } : {}),
    ...(server.type ? { type: server.type } : {}),
  } satisfies AmpRemoteServer;
}

export function buildAmpSettings({
  userMcpConfig,
}: {
  userMcpConfig: McpConfig | undefined;
}): string {
  const transformedServers: AmpSettings["amp.mcpServers"] = {};

  for (const [name, server] of Object.entries(
    userMcpConfig?.mcpServers ?? {},
  )) {
    transformedServers[name] = transformServer(server);
  }

  const settings: AmpSettings = {
    "amp.mcpServers": transformedServers,
  };

  return `${JSON.stringify(settings, null, 2)}\n`;
}
