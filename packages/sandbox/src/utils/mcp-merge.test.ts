import { describe, it, expect } from "vitest";
import { buildMergedMcpConfig } from "./mcp-merge";
import type { McpConfig } from "../mcp-config";

describe("buildMergedMcpConfig", () => {
  const userCfg: McpConfig = {
    mcpServers: {
      alpha: { command: "npx", args: ["-y", "alpha"] },
      toothless: { command: "node", args: ["/some/other/path.mjs"] },
      httpy: {
        type: "http",
        url: "https://api.example.com",
        headers: { A: "B" },
      },
    },
  };

  it("filters user-provided toothless and injects built-in when includeTerry=true", () => {
    const merged = buildMergedMcpConfig({
      userMcpConfig: userCfg,
      includeTerry: true,
      terryCommand: "node",
      terryArgs: ["/tmp/toothless-mcp-server.mjs"],
    });

    // Keeps non-toothless entries
    expect(Object.keys(merged.mcpServers)).toEqual(
      expect.arrayContaining(["alpha", "httpy", "toothless"]),
    );

    // User toothless is not carried through; replaced with built-in
    expect(merged.mcpServers.toothless).toEqual({
      command: "node",
      args: ["/tmp/toothless-mcp-server.mjs"],
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

  it("omits toothless entirely when includeTerry=false", () => {
    const merged = buildMergedMcpConfig({
      userMcpConfig: userCfg,
      includeTerry: false,
      terryCommand: "node",
      terryArgs: ["/tmp/toothless-mcp-server.mjs"],
    });

    expect(merged.mcpServers.toothless).toBeUndefined();
    expect(merged.mcpServers.alpha).toBeDefined();
    expect(merged.mcpServers.httpy).toBeDefined();
  });

  it("handles undefined user config", () => {
    const merged = buildMergedMcpConfig({
      userMcpConfig: undefined,
      includeTerry: true,
      terryCommand: "node",
      terryArgs: ["/tmp/toothless-mcp-server.mjs"],
    });
    expect(merged.mcpServers).toEqual({
      toothless: { command: "node", args: ["/tmp/toothless-mcp-server.mjs"] },
    });
  });
});
