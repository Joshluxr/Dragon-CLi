import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  opencodeCommand,
  getOpencodeApiKeyOrNull,
  parseOpencodeLine,
} from "./opencode";
import { IDaemonRuntime } from "./runtime";
import { nanoid } from "nanoid/non-secure";

// Mock nanoid to return predictable values
vi.mock("nanoid/non-secure", () => ({
  nanoid: vi.fn(() => "test-nanoid-123"),
}));

describe("opencode", () => {
  let runtime: IDaemonRuntime;

  beforeEach(() => {
    runtime = {
      writeFileSync: vi.fn(),
      logger: {
        error: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
    } as unknown as IDaemonRuntime;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getOpencodeApiKeyOrNull", () => {
    it("should return the OPENCODE_API_KEY from environment", () => {
      const originalEnv = process.env.OPENCODE_API_KEY;
      process.env.OPENCODE_API_KEY = "test-opencode-api-key";

      const apiKey = getOpencodeApiKeyOrNull(runtime);

      expect(apiKey).toBe("test-opencode-api-key");

      // Restore original environment
      if (originalEnv === undefined) {
        delete process.env.OPENCODE_API_KEY;
      } else {
        process.env.OPENCODE_API_KEY = originalEnv;
      }
    });

    it("should return empty string when OPENCODE_API_KEY is not set", () => {
      const originalEnv = process.env.OPENCODE_API_KEY;
      delete process.env.OPENCODE_API_KEY;

      const apiKey = getOpencodeApiKeyOrNull(runtime);

      expect(apiKey).toBe("");

      // Restore original environment
      if (originalEnv !== undefined) {
        process.env.OPENCODE_API_KEY = originalEnv;
      }
    });
  });

  describe("opencodeCommand", () => {
    it("should create a command with prompt, model, and format", () => {
      const command = opencodeCommand({
        runtime,
        prompt: "Write a hello world function",
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      expect(runtime.writeFileSync).toHaveBeenCalledWith(
        "/tmp/opencode-prompt-test-nanoid-123.txt",
        "Write a hello world function",
      );

      expect(command).toBe(
        "cat /tmp/opencode-prompt-test-nanoid-123.txt | opencode run --model claude-3-5-sonnet-20241022 --format json",
      );
    });

    it("should include session ID when provided", () => {
      const command = opencodeCommand({
        runtime,
        prompt: "Continue working on this task",
        model: "claude-3-5-sonnet-20241022",
        sessionId: "session-abc-123",
      });

      expect(runtime.writeFileSync).toHaveBeenCalledWith(
        "/tmp/opencode-prompt-test-nanoid-123.txt",
        "Continue working on this task",
      );

      expect(command).toBe(
        "cat /tmp/opencode-prompt-test-nanoid-123.txt | opencode run --model claude-3-5-sonnet-20241022 --format json --session session-abc-123",
      );
    });

    it("should write the prompt to a temporary file", () => {
      const testPrompt = "Test prompt with special characters: !@#$%";

      opencodeCommand({
        runtime,
        prompt: testPrompt,
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      expect(runtime.writeFileSync).toHaveBeenCalledTimes(1);
      expect(runtime.writeFileSync).toHaveBeenCalledWith(
        "/tmp/opencode-prompt-test-nanoid-123.txt",
        testPrompt,
      );
    });

    it("should handle different model names", () => {
      const command = opencodeCommand({
        runtime,
        prompt: "Test prompt",
        model: "gpt-4-turbo",
        sessionId: null,
      });

      expect(command).toContain("--model gpt-4-turbo");
    });

    it("should always include --format json flag", () => {
      const command = opencodeCommand({
        runtime,
        prompt: "Test",
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      expect(command).toContain("--format json");
    });

    it("should handle multiline prompts", () => {
      const multilinePrompt = `Line 1
Line 2
Line 3`;

      opencodeCommand({
        runtime,
        prompt: multilinePrompt,
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      expect(runtime.writeFileSync).toHaveBeenCalledWith(
        "/tmp/opencode-prompt-test-nanoid-123.txt",
        multilinePrompt,
      );
    });

    it("should create unique temporary file names for each call", () => {
      // Reset the mock to track calls
      vi.mocked(nanoid).mockClear();
      let callCount = 0;
      vi.mocked(nanoid).mockImplementation(() => {
        callCount++;
        return `unique-id-${callCount}`;
      });

      const command1 = opencodeCommand({
        runtime,
        prompt: "First prompt",
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      const command2 = opencodeCommand({
        runtime,
        prompt: "Second prompt",
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      expect(command1).toContain("/tmp/opencode-prompt-unique-id-1.txt");
      expect(command2).toContain("/tmp/opencode-prompt-unique-id-2.txt");
    });

    it("should handle empty session ID correctly", () => {
      const commandWithNull = opencodeCommand({
        runtime,
        prompt: "Test",
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      const commandWithUndefined = opencodeCommand({
        runtime,
        prompt: "Test",
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      expect(commandWithNull).not.toContain("--session");
      expect(commandWithUndefined).not.toContain("--session");
    });

    it("should properly escape the piped command structure", () => {
      const command = opencodeCommand({
        runtime,
        prompt: "Test",
        model: "claude-3-5-sonnet-20241022",
        sessionId: null,
      });

      // Command should be in format: cat <file> | opencode run ...
      const parts = command.split(" | ");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^cat \/tmp\/opencode-prompt-.*\.txt$/);
      expect(parts[1]).toMatch(/^opencode run --model .* --format json/);
    });
  });

  describe("parseOpencodeLine", () => {
    it("should parse text event into assistant message", () => {
      const line = JSON.stringify({
        type: "text",
        timestamp: Date.now(),
        sessionID: "session-123",
        part: {
          id: "part-1",
          type: "text",
          text: "Hello, I can help you with that!",
          sessionID: "session-123",
          messageID: "msg-1",
          time: {
            start: Date.now() - 1000,
            end: Date.now(),
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: "assistant",
        session_id: "session-123",
        message: {
          role: "assistant",
          content: "Hello, I can help you with that!",
        },
      });
    });

    it("should parse tool_use event with completed status into assistant and user messages", () => {
      const line = JSON.stringify({
        type: "tool_use",
        timestamp: Date.now(),
        sessionID: "session-456",
        part: {
          id: "tool-1",
          type: "tool",
          tool: "bash",
          callID: "call-123",
          sessionID: "session-456",
          messageID: "msg-2",
          state: {
            status: "completed",
            input: { command: "ls -la" },
            output: "total 24\ndrwxr-xr-x  5 user  staff  160 Oct 24 09:00 .",
            title: "List files",
            metadata: {},
            time: {
              start: Date.now() - 2000,
              end: Date.now(),
            },
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(2);
      // First message: assistant with tool_use
      expect(messages[0]).toMatchObject({
        type: "assistant",
        session_id: "session-456",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: "Bash",
              id: "call-123",
            },
          ],
        },
      });
      // Second message: user with tool_result
      expect(messages[1]).toMatchObject({
        type: "user",
        session_id: "session-456",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call-123",
              is_error: false,
            },
          ],
        },
      });
    });

    it("should parse tool_use event with running status into just assistant message", () => {
      const line = JSON.stringify({
        type: "tool_use",
        timestamp: Date.now(),
        sessionID: "session-run",
        part: {
          id: "tool-running",
          type: "tool",
          tool: "bash",
          callID: "call-running",
          sessionID: "session-run",
          messageID: "msg-run",
          state: {
            status: "running",
            input: { command: "npm install" },
            title: "Installing packages",
            time: {
              start: Date.now() - 1000,
            },
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      // Should only have assistant message (tool_use), no tool_result yet
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: "assistant",
        session_id: "session-run",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: "Bash",
              id: "call-running",
              input: { command: "npm install" },
            },
          ],
        },
      });
    });

    it("should skip tool_use event with pending status", () => {
      const line = JSON.stringify({
        type: "tool_use",
        timestamp: Date.now(),
        sessionID: "session-pending",
        part: {
          id: "tool-pending",
          type: "tool",
          tool: "read",
          callID: "call-pending",
          sessionID: "session-pending",
          messageID: "msg-pending",
          state: {
            status: "pending",
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      // Pending tools should not emit any messages yet
      expect(messages).toHaveLength(0);
    });

    it("should parse step_start event into system init message", () => {
      const line = JSON.stringify({
        type: "step_start",
        timestamp: Date.now(),
        sessionID: "session-789",
        part: {
          id: "step-1",
          type: "step-start",
          sessionID: "session-789",
          messageID: "msg-3",
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: "system",
        subtype: "init",
        session_id: "session-789",
        tools: [],
        mcp_servers: [],
      });
    });

    it("should skip step_start event when isWorking is true", () => {
      const line = JSON.stringify({
        type: "step_start",
        timestamp: Date.now(),
        sessionID: "session-789",
        part: {
          id: "step-1",
          type: "step-start",
          sessionID: "session-789",
          messageID: "msg-3",
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: true });

      expect(messages).toHaveLength(0);
    });

    it("should parse error event into result message", () => {
      const line = JSON.stringify({
        type: "error",
        timestamp: Date.now(),
        sessionID: "session-error",
        error: {
          name: "ProviderAuthError",
          message: "API key is invalid",
          data: {
            message: "Authentication failed: Invalid API key",
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        session_id: "session-error",
        error: "Authentication failed: Invalid API key",
      });
    });

    it("should ignore step_finish events but log them", () => {
      const line = JSON.stringify({
        type: "step_finish",
        timestamp: Date.now(),
        sessionID: "session-123",
        part: {
          id: "step-1",
          type: "step-finish",
          sessionID: "session-123",
          messageID: "msg-4",
          cost: 0.05,
          tokens: {
            input: 100,
            output: 50,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(0);
      expect(runtime.logger.debug).toHaveBeenCalledWith(
        "Opencode step finished",
        expect.objectContaining({
          tokens: expect.any(Object),
          cost: 0.05,
        }),
      );
    });

    it("should return empty array for invalid JSON", () => {
      const line = "{ invalid json }";

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(0);
      expect(runtime.logger.error).toHaveBeenCalledWith(
        "Failed to parse Opencode output line",
        expect.objectContaining({
          line,
          error: expect.any(Error),
        }),
      );
    });

    it("should skip text events without end time", () => {
      const line = JSON.stringify({
        type: "text",
        timestamp: Date.now(),
        sessionID: "session-123",
        part: {
          id: "part-1",
          type: "text",
          text: "Work in progress...",
          sessionID: "session-123",
          messageID: "msg-1",
          time: {
            start: Date.now() - 1000,
            // No end time - still in progress
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(0);
    });

    it("should handle tool error state correctly", () => {
      const line = JSON.stringify({
        type: "tool_use",
        timestamp: Date.now(),
        sessionID: "session-err",
        part: {
          id: "tool-err",
          type: "tool",
          tool: "read",
          callID: "call-err",
          sessionID: "session-err",
          messageID: "msg-err",
          state: {
            status: "error",
            input: { file_path: "/nonexistent" },
            error: "File not found: /nonexistent",
            time: {
              start: Date.now() - 500,
              end: Date.now(),
            },
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              is_error: true,
              content: "File not found: /nonexistent",
            },
          ],
        },
      });
    });

    it("should normalize tool names to PascalCase", () => {
      const line = JSON.stringify({
        type: "tool_use",
        timestamp: Date.now(),
        sessionID: "session-123",
        part: {
          id: "tool-1",
          type: "tool",
          tool: "websearch",
          callID: "call-search",
          sessionID: "session-123",
          messageID: "msg-1",
          state: {
            status: "completed",
            input: { query: "test" },
            output: "Results...",
            title: "Search",
            metadata: {},
            time: { start: 0, end: 1000 },
          },
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages[0]).toMatchObject({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ name: "Websearch" }],
        },
      });
    });

    it("should handle unknown event types gracefully", () => {
      const line = JSON.stringify({
        type: "unknown_event_type",
        timestamp: Date.now(),
        sessionID: "session-123",
        someData: "test",
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(0);
      expect(runtime.logger.debug).toHaveBeenCalledWith(
        "Unknown Opencode event type, ignoring",
        expect.objectContaining({
          type: "unknown_event_type",
        }),
      );
    });

    it("should handle invalid tool_use event structure", () => {
      const line = JSON.stringify({
        type: "tool_use",
        timestamp: Date.now(),
        sessionID: "session-123",
        part: {
          type: "text", // Wrong type, should be "tool"
          text: "invalid",
        },
      });

      const messages = parseOpencodeLine({ line, runtime, isWorking: false });

      expect(messages).toHaveLength(0);
      expect(runtime.logger.warn).toHaveBeenCalledWith(
        "Invalid tool_use event: missing or wrong part type",
        expect.objectContaining({
          eventType: "tool_use",
          partType: "text",
        }),
      );
    });
  });
});
