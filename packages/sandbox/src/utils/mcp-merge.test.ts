import { describe, it, expect } from "vitest";
import { buildMergedMcpConfig } from "./mcp-merge";
import type { McpConfig } from "../mcp-config";

describe("buildMergedMcpConfig", () => {
  const userCfg: McpConfig = {
    mcpServers: {
      alpha: { command: "npx", args: ["-y", "alpha"] },
      terry: { command: "node", args: ["/some/other/path.mjs"] },
      httpy: {
        type: "http",
        url: "https://api.example.com",
        headers: { A: "B" },
      },
    },
  };

  it("filters user-provided terry and injects built-in when includeTerry=true", () => {
    const merged = buildMergedMcpConfig({
      userMcpConfig: userCfg,
      includeTerry: true,
      terryCommand: "node",
      terryArgs: ["/tmp/terry-mcp-server.mjs"],
    });

    // Keeps non-terry entries
    expect(Object.keys(merged.mcpServers)).toEqual(
      expect.arrayContaining(["alpha", "httpy", "terry"]),
    );

    // User terry is not carried through; replaced with built-in
    expect(merged.mcpServers.terry).toEqual({
      command: "node",
      args: ["/tmp/terry-mcp-server.mjs"],
    });

    // Other entries preserved verbatim
    expect(merged.mcpServers.alpha).toEqual({
      command: "npx",
      args: ["-y", "alpha"],
    });
    expect(merged.mcpServers.httpy).toEqual({
      type: "http",
      url: "https://api.example.com",
      headers: { A: "B" },
    });
  });

  it("omits terry entirely when includeTerry=false", () => {
    const merged = buildMergedMcpConfig({
      userMcpConfig: userCfg,
      includeTerry: false,
      terryCommand: "node",
      terryArgs: ["/tmp/terry-mcp-server.mjs"],
    });

    expect(merged.mcpServers.terry).toBeUndefined();
    expect(merged.mcpServers.alpha).toBeDefined();
    expect(merged.mcpServers.httpy).toBeDefined();
  });

  it("handles undefined user config", () => {
    const merged = buildMergedMcpConfig({
      userMcpConfig: undefined,
      includeTerry: true,
      terryCommand: "node",
      terryArgs: ["/tmp/terry-mcp-server.mjs"],
    });
    expect(merged.mcpServers).toEqual({
      terry: { command: "node", args: ["/tmp/terry-mcp-server.mjs"] },
    });
  });
});
