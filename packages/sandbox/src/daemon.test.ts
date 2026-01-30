import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDaemon } from "./daemon";
import type { ISandboxSession } from "./types";

// Mock the bundled imports
vi.mock("@terragon/bundled", () => ({
  daemonAsStr: "mock-daemon-content",
  mcpServerAsStr: "mock-mcp-server-content",
}));

describe("daemon installation", () => {
  let mockSession: ISandboxSession;
  let writtenFiles: Record<string, string> = {};
  let executedCommands: string[] = [];

  beforeEach(() => {
    writtenFiles = {};
    executedCommands = [];

    mockSession = {
      sandboxId: "test-sandbox-id",
      sandboxProvider: "docker",
      repoDir: "repo",
      homeDir: "root",
      hibernate: vi.fn(),
      shutdown: vi.fn(),
      runCommand: vi.fn(async (command: string) => {
        executedCommands.push(command);
        if (command.includes("test -p")) {
          return "ready";
        }
        return "";
      }),
      runBackgroundCommand: vi.fn(),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(async (path: string, content: string) => {
        writtenFiles[path] = content;
      }),
      writeFile: vi.fn(),
    };
  });

  describe("MCP config merging", () => {
    it("should install daemon with default MCP config when no user config provided", async () => {
      await installDaemon({
        session: mockSession,
        environmentVariables: [],
        agentCredentials: null,
        githubAccessToken: "test-token",
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      // Check that MCP config was written
      expect(writtenFiles["/tmp/mcp-server.json"]).toBeDefined();
      const mcpConfig = JSON.parse(writtenFiles["/tmp/mcp-server.json"]!);

      expect(mcpConfig).toEqual({
        mcpServers: {
          terry: {
            command: "node",
            args: ["/tmp/terry-mcp-server.mjs"],
          },
        },
      });
    });

    it("should merge user MCP config with built-in terry server", async () => {
      const userMcpConfig = {
        mcpServers: {
          "custom-server": {
            command: "python",
            args: ["-m", "custom_mcp"],
            env: {
              API_KEY: "test-key",
            },
          },
          "another-server": {
            command: "node",
            args: ["./my-server.js"],
          },
        },
      };

      await installDaemon({
        session: mockSession,
        environmentVariables: [],
        agentCredentials: null,
        githubAccessToken: "test-token",
        userMcpConfig,
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      const mcpConfig = JSON.parse(writtenFiles["/tmp/mcp-server.json"]!);

      expect(mcpConfig).toEqual({
        mcpServers: {
          terry: {
            command: "node",
            args: ["/tmp/terry-mcp-server.mjs"],
          },
          "custom-server": {
            command: "python",
            args: ["-m", "custom_mcp"],
            env: {
              API_KEY: "test-key",
            },
          },
          "another-server": {
            command: "node",
            args: ["./my-server.js"],
          },
        },
      });
    });

    it("should not allow overriding the built-in terry server", async () => {
      const userMcpConfig = {
        mcpServers: {
          terry: {
            command: "malicious-command",
            args: ["--hack"],
          },
          "legitimate-server": {
            command: "node",
            args: ["./server.js"],
          },
        },
      };

      await installDaemon({
        session: mockSession,
        environmentVariables: [],
        agentCredentials: null,
        githubAccessToken: "test-token",
        userMcpConfig,
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      const mcpConfig = JSON.parse(writtenFiles["/tmp/mcp-server.json"]!);

      // Terry server should remain unchanged
      expect(mcpConfig.mcpServers.terry).toEqual({
        command: "node",
        args: ["/tmp/terry-mcp-server.mjs"],
      });

      // Other servers should be included
      expect(mcpConfig.mcpServers["legitimate-server"]).toEqual({
        command: "node",
        args: ["./server.js"],
      });
    });

    it("should handle empty user MCP config", async () => {
      const userMcpConfig = {
        mcpServers: {},
      };

      await installDaemon({
        session: mockSession,
        environmentVariables: [],
        agentCredentials: null,
        githubAccessToken: "test-token",
        userMcpConfig,
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      const mcpConfig = JSON.parse(writtenFiles["/tmp/mcp-server.json"]!);

      expect(mcpConfig).toEqual({
        mcpServers: {
          terry: {
            command: "node",
            args: ["/tmp/terry-mcp-server.mjs"],
          },
        },
      });
    });

    it("should pass MCP config path to daemon", async () => {
      await installDaemon({
        session: mockSession,
        environmentVariables: [],
        agentCredentials: null,
        githubAccessToken: "test-token",
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      // Check that the daemon was started with the correct MCP config path
      const backgroundCommand = (mockSession.runBackgroundCommand as any).mock
        .calls[0][0];
      expect(backgroundCommand).toContain("--mcp-config-path");
      expect(backgroundCommand).toContain("/tmp/mcp-server.json");
    });
  });

  describe("environment variables", () => {
    it("should pass environment variables to daemon", async () => {
      const envVars = [
        { key: "API_KEY", value: "secret-key" },
        { key: "DATABASE_URL", value: "postgres://localhost" },
      ];

      await installDaemon({
        session: mockSession,
        environmentVariables: envVars,
        agentCredentials: null,
        githubAccessToken: "test-token",
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      const backgroundCommandOptions = (mockSession.runBackgroundCommand as any)
        .mock.calls[0][1];
      expect(backgroundCommandOptions.env).toEqual({
        BASH_MAX_TIMEOUT_MS: "60000",
        API_KEY: "secret-key",
        DATABASE_URL: "postgres://localhost",
        TERRAGON: "true",
        GH_TOKEN: "test-token",
        TERRAGON_FEATURE_FLAGS: "{}",
      });
    });

    it("should handle MCP config and environment variables together", async () => {
      const envVars = [{ key: "MCP_API_KEY", value: "mcp-secret" }];

      const userMcpConfig = {
        mcpServers: {
          "api-server": {
            command: "node",
            args: ["api.js"],
            env: {
              API_KEY: "${MCP_API_KEY}",
            },
          },
        },
      };

      await installDaemon({
        session: mockSession,
        environmentVariables: envVars,
        agentCredentials: null,
        githubAccessToken: "test-token",
        userMcpConfig,
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      // Check environment variables
      const backgroundCommandOptions = (mockSession.runBackgroundCommand as any)
        .mock.calls[0][1];
      expect(backgroundCommandOptions.env.MCP_API_KEY).toBe("mcp-secret");

      // Check MCP config
      const mcpConfig = JSON.parse(writtenFiles["/tmp/mcp-server.json"]!);
      expect(mcpConfig.mcpServers["api-server"]).toBeDefined();
    });
  });

  describe("file permissions", () => {
    it("should make daemon executable", async () => {
      await installDaemon({
        session: mockSession,
        environmentVariables: [],
        agentCredentials: null,
        githubAccessToken: "test-token",
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      expect(executedCommands).toContain("chmod +x /tmp/terragon-daemon.mjs");
    });

    it("should write all required files", async () => {
      await installDaemon({
        session: mockSession,
        environmentVariables: [],
        agentCredentials: null,
        githubAccessToken: "test-token",
        publicUrl: "http://localhost:3000",
        featureFlags: {},
      });

      expect(writtenFiles["/tmp/terragon-daemon.mjs"]).toBe(
        "mock-daemon-content",
      );
      expect(writtenFiles["/tmp/terry-mcp-server.mjs"]).toBe(
        "mock-mcp-server-content",
      );
      expect(writtenFiles["/tmp/mcp-server.json"]).toBeDefined();
    });
  });
});
