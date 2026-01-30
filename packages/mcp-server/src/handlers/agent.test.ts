/**
 * Agent Handler Tests
 */

import { describe, it, expect } from "vitest";
import { handleAgentTool } from "./agent.js";

describe("Agent Handler", () => {
  describe("RunAgent", () => {
    it("should start a code-reviewer agent", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "code-reviewer",
        task: "Review the authentication module for security issues",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.taskId).toBeDefined();
      expect(content.agentType).toBe("code-reviewer");
      // Synchronous execution completes immediately
      expect(content.status).toBe("completed");
    });

    it("should start a tester agent with sandboxId", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "tester",
        task: "Write unit tests for the user service",
        sandboxId: "sbx_test123",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.agentType).toBe("tester");
    });

    it("should start a researcher agent", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "researcher",
        task: "Research best practices for API rate limiting",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.agentType).toBe("researcher");
    });

    it("should start a debugger agent with sandboxId", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "debugger",
        task: "Debug the memory leak in the WebSocket handler",
        sandboxId: "sbx_test456",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.agentType).toBe("debugger");
    });

    it("should start a planner agent", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "planner",
        task: "Create an implementation plan for the payment system",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.agentType).toBe("planner");
    });

    it("should accept context parameter", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "code-reviewer",
        task: "Review this code",
        context: { filePath: "src/auth.ts", priority: "high" },
      });
      expect(result.isError).toBeUndefined();
    });

    it("should support async mode", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "researcher",
        task: "Deep research on microservices",
        async: true,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.status).toBe("pending");
    });

    it("should reject invalid agent type", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "invalid-agent" as "code-reviewer",
        task: "Some task",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Invalid agent type");
    });

    it("should require sandboxId for tester agent", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "tester",
        task: "Run tests",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("requires a sandboxId");
    });

    it("should require sandboxId for debugger agent", async () => {
      const result = await handleAgentTool("RunAgent", {
        agentType: "debugger",
        task: "Debug issue",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("requires a sandboxId");
    });
  });

  describe("GetAgentStatus", () => {
    it("should get status of a completed agent task", async () => {
      // First create an agent
      const runResult = await handleAgentTool("RunAgent", {
        agentType: "code-reviewer",
        task: "Review code",
      });
      const { taskId } = JSON.parse(runResult.content[0].text);

      // Then get its status
      const result = await handleAgentTool("GetAgentStatus", { taskId });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.taskId).toBe(taskId);
      expect(content.status).toBeDefined();
    });

    it("should return error for non-existent task", async () => {
      const result = await handleAgentTool("GetAgentStatus", {
        taskId: "nonexistent-task-id",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("not found");
    });
  });

  describe("CancelAgent", () => {
    it("should cancel an agent task", async () => {
      // First create an async agent
      const runResult = await handleAgentTool("RunAgent", {
        agentType: "researcher",
        task: "Long research task",
        async: true,
      });
      const { taskId } = JSON.parse(runResult.content[0].text);

      // Then cancel it
      const result = await handleAgentTool("CancelAgent", { taskId });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.status).toBe("cancelled");
      expect(content.message).toBe("Task cancelled successfully.");
    });

    it("should return error for non-existent task", async () => {
      const result = await handleAgentTool("CancelAgent", {
        taskId: "nonexistent-task-id",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("ListAgentTasks", () => {
    it("should list all agent tasks", async () => {
      const result = await handleAgentTool("ListAgentTasks", {});
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.tasks).toBeDefined();
      expect(Array.isArray(content.tasks)).toBe(true);
    });

    it("should filter by status", async () => {
      // Create a completed task first
      await handleAgentTool("RunAgent", {
        agentType: "code-reviewer",
        task: "Review code",
      });

      const result = await handleAgentTool("ListAgentTasks", {
        status: "completed",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(
        content.tasks.every(
          (t: { status: string }) => t.status === "completed",
        ),
      ).toBe(true);
    });

    it("should filter by agent type", async () => {
      // Create agents of different types
      await handleAgentTool("RunAgent", {
        agentType: "code-reviewer",
        task: "Task 1",
      });
      await handleAgentTool("RunAgent", {
        agentType: "planner",
        task: "Task 2",
      });

      const result = await handleAgentTool("ListAgentTasks", {
        agentType: "code-reviewer",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(
        content.tasks.every(
          (t: { agentType: string }) => t.agentType === "code-reviewer",
        ),
      ).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const result = await handleAgentTool("ListAgentTasks", {
        limit: 5,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.tasks.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await handleAgentTool("UnknownTool", {});
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Unknown agent tool");
    });
  });
});
