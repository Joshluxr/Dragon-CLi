import { McpConfig, McpServer } from "../mcp-config";

export function buildMergedMcpConfig({
  userMcpConfig,
  includeTerry,
  terryCommand,
  terryArgs,
}: {
  userMcpConfig: McpConfig | undefined;
  includeTerry: boolean;
  terryCommand: string;
  terryArgs: string[];
}): McpConfig {
  const mergedServers: Record<string, McpServer> = {
    ...Object.fromEntries(
      Object.entries(userMcpConfig?.mcpServers ?? {}).filter(
        ([name]) => name !== "terry",
      ),
    ),
  } as Record<string, McpServer>;

  if (includeTerry) {
    mergedServers["terry"] = {
      command: terryCommand,
      args: terryArgs,
    } as McpServer;
  }

  return { mcpServers: mergedServers };
}
