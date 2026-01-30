import { describe, expect, test, vi } from "vitest";
import {
  geminiCommand,
  parseGeminiLine,
  createGeminiParserState,
} from "./gemini";
import { JsonStreamEventType } from "@google/gemini-cli-core";
import type { IDaemonRuntime } from "./runtime";

describe("parseGeminiLine", () => {
  const mockRuntime: IDaemonRuntime = {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    execSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  } as any;

  test("should parse INIT event", () => {
    const state = createGeminiParserState();
    const line = JSON.stringify({
      type: JsonStreamEventType.INIT,
      timestamp: "2024-01-01T00:00:00Z",
      session_id: "gemini-session-123",
      model: "gemini-2.0-flash-exp",
    });
    const results = parseGeminiLine({ line, runtime: mockRuntime, state });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "system",
      subtype: "init",
      session_id: "gemini-session-123",
      tools: [],
      mcp_servers: [],
    });
  });

  test("should parse MESSAGE event (assistant)", () => {
    const state = createGeminiParserState();
    const line = JSON.stringify({
      type: JsonStreamEventType.MESSAGE,
      timestamp: "2024-01-01T00:00:00Z",
      role: "assistant",
      content: "Hello! How can I help you?",
      delta: false,
    });
    const results = parseGeminiLine({ line, runtime: mockRuntime, state });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello! How can I help you?" }],
      },
      parent_tool_use_id: null,
      session_id: "",
    });
  });

  test("should accumulate MESSAGE delta events", () => {
    const state = createGeminiParserState();

    // First delta
    const line1 = JSON.stringify({
      type: JsonStreamEventType.MESSAGE,
      timestamp: "2024-01-01T00:00:00Z",
      role: "assistant",
      content: "Hello",
      delta: true,
    });
    const results1 = parseGeminiLine({
      line: line1,
      runtime: mockRuntime,
      state,
    });
    expect(results1).toHaveLength(0);
    expect(state.accumulatedContent).toBe("Hello");

    // Second delta
    const line2 = JSON.stringify({
      type: JsonStreamEventType.MESSAGE,
      timestamp: "2024-01-01T00:00:01Z",
      role: "assistant",
      content: "! How can I help?",
      delta: true,
    });
    const results2 = parseGeminiLine({
      line: line2,
      runtime: mockRuntime,
      state,
    });
    expect(results2).toHaveLength(0);
    expect(state.accumulatedContent).toBe("Hello! How can I help?");
  });

  test("should flush accumulated deltas on message type transition", () => {
    const state = createGeminiParserState();

    // Accumulate deltas
    parseGeminiLine({
      line: JSON.stringify({
        type: JsonStreamEventType.MESSAGE,
        role: "assistant",
        content: "Part 1 ",
        delta: true,
      }),
      runtime: mockRuntime,
      state,
    });

    parseGeminiLine({
      line: JSON.stringify({
        type: JsonStreamEventType.MESSAGE,
        role: "assistant",
        content: "Part 2",
        delta: true,
      }),
      runtime: mockRuntime,
      state,
    });

    expect(state.accumulatedContent).toBe("Part 1 Part 2");

    // Transition to tool_use should flush accumulated content
    const results = parseGeminiLine({
      line: JSON.stringify({
        type: JsonStreamEventType.TOOL_USE,
        tool_name: "Bash",
        tool_id: "tool_1",
        parameters: { command: "ls" },
      }),
      runtime: mockRuntime,
      state,
    });

    // Should have 2 messages: the accumulated text and the tool_use
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Part 1 Part 2" }],
      },
      parent_tool_use_id: null,
      session_id: "",
    });
    expect(results[1]?.type).toBe("assistant");
    expect(state.accumulatedContent).toBe("");
  });

  test("should parse TOOL_USE event", () => {
    const state = createGeminiParserState();
    const line = JSON.stringify({
      type: JsonStreamEventType.TOOL_USE,
      timestamp: "2024-01-01T00:00:00Z",
      tool_name: "Bash",
      tool_id: "tool_123",
      parameters: { command: "ls -la" },
    });
    const results = parseGeminiLine({ line, runtime: mockRuntime, state });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: { command: "ls -la" },
            id: "tool_123",
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: "",
    });
  });

  test("should parse TOOL_RESULT event (success)", () => {
    const line = JSON.stringify({
      type: JsonStreamEventType.TOOL_RESULT,
      timestamp: "2024-01-01T00:00:00Z",
      tool_id: "tool_123",
      status: "success",
      output: "file1.txt\nfile2.txt\n",
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_123",
            content: "file1.txt\nfile2.txt\n",
            is_error: false,
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: "",
    });
  });

  test("should parse TOOL_RESULT event (error with error object)", () => {
    const line = JSON.stringify({
      type: JsonStreamEventType.TOOL_RESULT,
      timestamp: "2024-01-01T00:00:00Z",
      tool_id: "tool_456",
      status: "error",
      error: {
        type: "ExecutionError",
        message: "Command failed with exit code 1",
      },
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_456",
            content: "ExecutionError: Command failed with exit code 1",
            is_error: true,
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: "",
    });
  });

  test("should parse TOOL_RESULT event (error without error object)", () => {
    const line = JSON.stringify({
      type: JsonStreamEventType.TOOL_RESULT,
      timestamp: "2024-01-01T00:00:00Z",
      tool_id: "tool_789",
      status: "error",
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_789",
            content: "Tool execution failed",
            is_error: true,
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: "",
    });
  });

  test("should parse ERROR event (warning severity)", () => {
    const line = JSON.stringify({
      type: JsonStreamEventType.ERROR,
      timestamp: "2024-01-01T00:00:00Z",
      severity: "warning",
      message: "Rate limit approaching",
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(0);
    expect(mockRuntime.logger.warn).toHaveBeenCalledWith("Gemini error event", {
      severity: "warning",
      message: "Rate limit approaching",
    });
  });

  test("should parse ERROR event (error severity)", () => {
    const line = JSON.stringify({
      type: JsonStreamEventType.ERROR,
      timestamp: "2024-01-01T00:00:00Z",
      severity: "error",
      message: "API key invalid",
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "result",
      subtype: "error_during_execution",
      session_id: "",
      error: "API key invalid",
      is_error: true,
      num_turns: 0,
      duration_ms: 0,
    });
    expect(mockRuntime.logger.warn).toHaveBeenCalledWith("Gemini error event", {
      severity: "error",
      message: "API key invalid",
    });
  });

  test("should parse RESULT event (success with stats)", () => {
    const line = JSON.stringify({
      type: JsonStreamEventType.RESULT,
      timestamp: "2024-01-01T00:00:00Z",
      status: "success",
      stats: {
        total_tokens: 100,
        input_tokens: 50,
        output_tokens: 50,
        duration_ms: 1500,
        tool_calls: 2,
      },
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "result",
      subtype: "success",
      session_id: "",
      is_error: false,
      num_turns: 1,
      duration_ms: 1500,
      duration_api_ms: 1500,
      total_cost_usd: 0,
      result: "Task completed successfully",
    });
    expect(mockRuntime.logger.debug).toHaveBeenCalledWith(
      "Gemini token usage",
      {
        input_tokens: 50,
        output_tokens: 50,
        total_tokens: 100,
        duration_ms: 1500,
        tool_calls: 2,
      },
    );
  });

  test("should parse RESULT event (error)", () => {
    const line = JSON.stringify({
      type: JsonStreamEventType.RESULT,
      timestamp: "2024-01-01T00:00:00Z",
      status: "error",
      error: {
        type: "APIError",
        message: "Request timeout",
      },
      stats: {
        total_tokens: 10,
        input_tokens: 10,
        output_tokens: 0,
        duration_ms: 5000,
        tool_calls: 0,
      },
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "result",
      subtype: "error_during_execution",
      session_id: "",
      error: "APIError: Request timeout",
      is_error: true,
      num_turns: 0,
      duration_ms: 5000,
    });
  });

  test("should handle invalid JSON as text", () => {
    const line = "not valid json";
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "assistant",
      message: {
        role: "assistant",
        content: "not valid json",
      },
      parent_tool_use_id: null,
      session_id: "",
    });
  });

  test("should handle unknown message type", () => {
    const line = JSON.stringify({
      type: "unknown_type",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const results = parseGeminiLine({
      line,
      runtime: mockRuntime,
      state: createGeminiParserState(),
    });

    expect(results).toHaveLength(0);
    expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
      "Unknown Gemini message type",
      expect.objectContaining({
        type: "unknown_type",
      }),
    );
  });

  test("should parse full conversation flow", () => {
    const state = createGeminiParserState();
    const lines = [
      JSON.stringify({
        type: JsonStreamEventType.INIT,
        timestamp: "2024-01-01T00:00:00Z",
        session_id: "session-abc",
        model: "gemini-2.0-flash-exp",
      }),
      JSON.stringify({
        type: JsonStreamEventType.MESSAGE,
        timestamp: "2024-01-01T00:00:01Z",
        role: "user",
        content: "List files",
        delta: false,
      }),
      JSON.stringify({
        type: JsonStreamEventType.TOOL_USE,
        timestamp: "2024-01-01T00:00:02Z",
        tool_name: "Bash",
        tool_id: "tool_1",
        parameters: { command: "ls" },
      }),
      JSON.stringify({
        type: JsonStreamEventType.TOOL_RESULT,
        timestamp: "2024-01-01T00:00:03Z",
        tool_id: "tool_1",
        status: "success",
        output: "file1.txt\nfile2.txt\n",
      }),
      JSON.stringify({
        type: JsonStreamEventType.MESSAGE,
        timestamp: "2024-01-01T00:00:04Z",
        role: "assistant",
        content: "I found 2 files in the directory.",
        delta: false,
      }),
      JSON.stringify({
        type: JsonStreamEventType.RESULT,
        timestamp: "2024-01-01T00:00:05Z",
        status: "success",
        stats: {
          total_tokens: 150,
          input_tokens: 100,
          output_tokens: 50,
          duration_ms: 2000,
          tool_calls: 1,
        },
      }),
    ];

    const results = lines.flatMap((line) =>
      parseGeminiLine({ line, runtime: mockRuntime, state }),
    );

    // Should have: init, tool_use, tool_result, assistant message, success result
    // (user message is not echoed back)
    expect(results).toHaveLength(5);

    // Verify sequence
    expect(results[0]?.type).toBe("system");
    expect(results[1]?.type).toBe("assistant"); // tool_use
    expect(results[2]?.type).toBe("user"); // tool_result
    expect(results[3]?.type).toBe("assistant"); // message
    expect(results[4]?.type).toBe("result"); // success result

    // Verify init message
    if (results[0]?.type === "system") {
      expect(results[0].session_id).toBe("session-abc");
    }

    // Verify tool use
    if (results[1]?.type === "assistant") {
      const content = results[1].message.content;
      if (Array.isArray(content) && content[0]?.type === "tool_use") {
        expect(content[0].id).toBe("tool_1");
        expect(content[0].name).toBe("Bash");
      }
    }

    // Verify tool result matches tool use ID
    if (results[2]?.type === "user") {
      const content = results[2].message.content;
      if (Array.isArray(content) && content[0]?.type === "tool_result") {
        expect(content[0].tool_use_id).toBe("tool_1");
        expect(content[0].is_error).toBe(false);
      }
    }
  });
});

describe("geminiCommand", () => {
  const mockRuntime: IDaemonRuntime = {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    execSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  } as any;

  test("should generate command with correct flags", () => {
    const command = geminiCommand({
      runtime: mockRuntime,
      prompt: "test prompt",
      model: "gemini-2.0-flash-exp",
      sessionId: null,
    });

    expect(command).toContain("cat");
    expect(command).toContain("gemini");
    expect(command).toContain("--model gemini-2.0-flash-exp");
    expect(command).toContain("--yolo");
    expect(command).toContain("--output-format stream-json");
    expect(command).not.toContain("--resume");
  });

  test("should write prompt to temporary file", () => {
    geminiCommand({
      runtime: mockRuntime,
      prompt: "test prompt content",
      model: "gemini-2.0-flash-exp",
      sessionId: null,
    });

    expect(mockRuntime.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/gemini-prompt-"),
      "test prompt content",
    );
  });

  test("should use correct model name", () => {
    const command = geminiCommand({
      runtime: mockRuntime,
      prompt: "test prompt",
      model: "gemini-1.5-pro",
      sessionId: null,
    });

    expect(command).toContain("--model gemini-1.5-pro");
  });

  test("should include --resume flag when sessionId is provided", () => {
    const command = geminiCommand({
      runtime: mockRuntime,
      prompt: "test prompt",
      model: "gemini-2.0-flash-exp",
      sessionId: "session-123",
    });

    expect(command).toContain("--resume");
  });
});
