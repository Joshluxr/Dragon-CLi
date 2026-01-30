import { describe, it, expect } from "vitest";
import { validateMcpConfig } from "./mcp-config";

describe("validateMcpConfig", () => {
  describe("Valid configurations", () => {
    it("should validate command-based server with all fields", () => {
      const config = {
        mcpServers: {
          "example-server": {
            command: "node",
            args: ["/path/to/server.js"],
            env: {
              API_KEY: "test-key",
              DEBUG: "true",
            },
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(config);
      }
    });

    it("should validate command-based server with only required fields", () => {
      const config = {
        mcpServers: {
          "minimal-server": {
            command: "python",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(config);
      }
    });

    it("should validate HTTP-based server", () => {
      const config = {
        mcpServers: {
          context7: {
            type: "http",
            url: "https://mcp.context7.com/mcp",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(config);
      }
    });

    it("should validate mixed server types", () => {
      const config = {
        mcpServers: {
          "command-server": {
            command: "node",
            args: ["server.js"],
          },
          "http-server": {
            type: "http",
            url: "https://api.example.com/mcp",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(config);
      }
    });

    it("should validate empty mcpServers object", () => {
      const config = {
        mcpServers: {},
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(config);
      }
    });

    it("should validate multiple servers of same type", () => {
      const config = {
        mcpServers: {
          server1: {
            command: "node",
            args: ["server1.js"],
          },
          server2: {
            command: "python",
            args: ["-m", "server2"],
          },
          http1: {
            type: "http",
            url: "https://api1.example.com/mcp",
          },
          http2: {
            type: "http",
            url: "https://api2.example.com/mcp",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
    });
  });

  describe("Invalid configurations", () => {
    it("should reject config with terry server override", () => {
      const config = {
        mcpServers: {
          terry: {
            command: "malicious",
            args: ["hack"],
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain(
          "Cannot override the built-in 'terry' server",
        );
      }
    });

    it("should reject command server without command field", () => {
      const config = {
        mcpServers: {
          "bad-server": {
            args: ["test"],
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Required");
        expect(result.error).toContain("mcpServers.bad-server.command");
      }
    });

    it("should reject command server with empty command", () => {
      const config = {
        mcpServers: {
          "empty-command": {
            command: "",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Command is required");
      }
    });

    it("should reject HTTP server with invalid URL", () => {
      const config = {
        mcpServers: {
          "bad-http": {
            type: "http",
            url: "not-a-valid-url",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Must be a valid URL");
      }
    });

    it("should reject HTTP server without type field", () => {
      const config = {
        mcpServers: {
          "bad-http": {
            url: "https://example.com/mcp",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain(
          'When using a URL, you must specify type: "http"',
        );
        expect(result.error).toContain(
          'Add type: "http" to use an HTTP-based MCP server',
        );
      }
    });

    it("should reject HTTP server without url field", () => {
      const config = {
        mcpServers: {
          "bad-http": {
            type: "http",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
    });

    it("should reject config without mcpServers field", () => {
      const config = {};

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("mcpServers: Required");
      }
    });

    it("should reject config with mcpServers as non-object", () => {
      const config = {
        mcpServers: "not-an-object",
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
    });

    it("should reject config with invalid args type", () => {
      const config = {
        mcpServers: {
          "bad-args": {
            command: "node",
            args: "not-an-array",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
    });

    it("should reject config with invalid env type", () => {
      const config = {
        mcpServers: {
          "bad-env": {
            command: "node",
            env: "not-an-object",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
    });

    it("should reject HTTP server with wrong type value", () => {
      const config = {
        mcpServers: {
          "wrong-type": {
            type: "websocket",
            url: "https://example.com",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
    });

    it("should reject null config", () => {
      const result = validateMcpConfig(null);
      expect(result.success).toBe(false);
    });

    it("should reject undefined config", () => {
      const result = validateMcpConfig(undefined);
      expect(result.success).toBe(false);
    });
  });

  describe("Error messages", () => {
    it("should provide specific error path for nested errors", () => {
      const config = {
        mcpServers: {
          "test-server": {
            command: "node",
            args: [123], // Should be string
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("mcpServers.test-server.args.0");
        expect(result.error).toContain("Expected string, received number");
      }
    });

    it("should provide helpful error for missing required fields", () => {
      const config = {
        mcpServers: {
          incomplete: {},
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should indicate that neither command nor type+url combination is present
        expect(result.error).toBeTruthy();
      }
    });

    it("should provide helpful error message for url without type field", () => {
      const config = {
        mcpServers: {
          "my-custom-server": {
            url: "https://api.example.com/mcp",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("mcpServers.my-custom-server:");
        expect(result.error).toContain(
          'When using a URL, you must specify type: "http"',
        );
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle server names with special characters", () => {
      const config = {
        mcpServers: {
          "server-with-dash": {
            command: "node",
          },
          server_with_underscore: {
            command: "python",
          },
          "server.with.dots": {
            type: "http",
            url: "https://example.com",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
    });

    it("should validate config with very long server names", () => {
      const longName = "a".repeat(100);
      const config = {
        mcpServers: {
          [longName]: {
            command: "node",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
    });

    it("should validate URLs with various protocols", () => {
      const config = {
        mcpServers: {
          "https-server": {
            type: "http",
            url: "https://secure.example.com/mcp",
          },
          "http-server": {
            type: "http",
            url: "http://local.example.com/mcp",
          },
        },
      };

      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
    });

    it("should handle config with many servers", () => {
      const mcpServers: any = {};
      for (let i = 0; i < 50; i++) {
        mcpServers[`server${i}`] = {
          command: `command${i}`,
          args: [`arg${i}`],
        };
      }

      const config = { mcpServers };
      const result = validateMcpConfig(config);
      expect(result.success).toBe(true);
    });
  });
});
