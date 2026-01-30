import { describe, it, expect } from "vitest";
import { normalizeToolCall } from "./tool-calls";

describe("normalizeToolCall", () => {
  describe("opencode agent", () => {
    it("should normalize Todowrite to TodoWrite", () => {
      const result = normalizeToolCall("opencode", {
        name: "Todowrite",
        parameters: { todos: [] },
      });

      expect(result.name).toBe("TodoWrite");
      expect(result.parameters).toEqual({ todos: [] });
    });

    it("should normalize Todoread to TodoRead", () => {
      const result = normalizeToolCall("opencode", {
        name: "Todoread",
        parameters: {},
      });

      expect(result.name).toBe("TodoRead");
    });

    it("should normalize Websearch to WebSearch", () => {
      const result = normalizeToolCall("opencode", {
        name: "Websearch",
        parameters: { query: "test" },
      });

      expect(result.name).toBe("WebSearch");
      expect(result.parameters).toEqual({ query: "test" });
    });

    it("should leave correctly capitalized tools unchanged", () => {
      const tools = ["Bash", "Edit", "Glob", "Grep", "List", "Read", "Write"];

      for (const toolName of tools) {
        const result = normalizeToolCall("opencode", {
          name: toolName,
          parameters: {},
        });

        expect(result.name).toBe(toolName);
      }
    });

    it("should preserve result if present", () => {
      const result = normalizeToolCall("opencode", {
        name: "Websearch",
        parameters: { query: "test" },
        result: "Search results...",
      });

      expect(result.name).toBe("WebSearch");
      expect(result.result).toBe("Search results...");
    });
  });

  describe("amp agent", () => {
    it("should normalize edit_file to Edit", () => {
      const result = normalizeToolCall("amp", {
        name: "edit_file",
        parameters: {
          path: "/test.ts",
          old_str: "old",
          new_str: "new",
        },
      });

      expect(result.name).toBe("Edit");
      expect(result.parameters).toEqual({
        file_path: "/test.ts",
        old_string: "old",
        new_string: "new",
      });
    });

    it("should normalize create_file to Write", () => {
      const result = normalizeToolCall("amp", {
        name: "create_file",
        parameters: {
          path: "/test.ts",
          content: "console.log('test')",
        },
      });

      expect(result.name).toBe("Write");
      expect(result.parameters).toEqual({
        file_path: "/test.ts",
        content: "console.log('test')",
      });
    });
  });

  describe("MCP SuggestFollowupTask", () => {
    it("should normalize mcp__terry__SuggestFollowupTask to SuggestFollowupTask", () => {
      const result = normalizeToolCall("claudeCode", {
        name: "mcp__terry__SuggestFollowupTask",
        parameters: { task: "test" },
      });

      expect(result.name).toBe("SuggestFollowupTask");
      expect(result.parameters).toEqual({ task: "test" });
    });
  });

  describe("other agents", () => {
    it("should leave tool calls unchanged for claudeCode agent", () => {
      const result = normalizeToolCall("claudeCode", {
        name: "Bash",
        parameters: { command: "ls" },
      });

      expect(result.name).toBe("Bash");
      expect(result.parameters).toEqual({ command: "ls" });
    });

    it("should leave tool calls unchanged for gemini agent", () => {
      const result = normalizeToolCall("gemini", {
        name: "Read",
        parameters: { file_path: "/test.ts" },
      });

      expect(result.name).toBe("Read");
      expect(result.parameters).toEqual({ file_path: "/test.ts" });
    });

    it("should leave tool calls unchanged for codex agent", () => {
      const result = normalizeToolCall("codex", {
        name: "Write",
        parameters: { file_path: "/test.ts", content: "code" },
      });

      expect(result.name).toBe("Write");
      expect(result.parameters).toEqual({
        file_path: "/test.ts",
        content: "code",
      });
    });
  });
});
