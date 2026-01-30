/**
 * Sandbox Handler Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleSandboxTool } from "./sandbox.js";

describe("Sandbox Handler", () => {
  describe("CreateSandbox", () => {
    it("should create a sandbox with default settings", async () => {
      const result = await handleSandboxTool("CreateSandbox", {});
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.sandboxId).toBeDefined();
      expect(content.status).toBe("running");
      expect(content.provider).toBe("e2b");
      expect(content.template).toBe("node");
    });

    it("should create a sandbox with custom settings", async () => {
      const result = await handleSandboxTool("CreateSandbox", {
        provider: "daytona",
        size: "large",
        template: "python",
        timeout: 120,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.provider).toBe("daytona");
      expect(content.size).toBe("large");
      expect(content.template).toBe("python");
      expect(content.timeout).toBe(120);
    });

    it("should reject invalid timeout", async () => {
      const result = await handleSandboxTool("CreateSandbox", {
        timeout: 1000, // Max is 480
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Invalid timeout");
    });
  });

  describe("ExecuteInSandbox", () => {
    let sandboxId: string;

    beforeEach(async () => {
      const createResult = await handleSandboxTool("CreateSandbox", {});
      const content = JSON.parse(createResult.content[0].text);
      sandboxId = content.sandboxId;
    });

    it("should execute a command in sandbox", async () => {
      const result = await handleSandboxTool("ExecuteInSandbox", {
        sandboxId,
        command: "npm install",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.sandboxId).toBe(sandboxId);
      expect(content.exitCode).toBe(0);
      expect(content.stdout).toBeDefined();
    });

    it("should return error for non-existent sandbox", async () => {
      const result = await handleSandboxTool("ExecuteInSandbox", {
        sandboxId: "non_existent_sandbox",
        command: "ls",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Sandbox not found");
    });
  });

  describe("GetSandboxStatus", () => {
    it("should return sandbox status", async () => {
      // First create a sandbox
      const createResult = await handleSandboxTool("CreateSandbox", {});
      const createContent = JSON.parse(createResult.content[0].text);
      const sandboxId = createContent.sandboxId;

      // Get status
      const result = await handleSandboxTool("GetSandboxStatus", { sandboxId });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.sandboxId).toBe(sandboxId);
      expect(content.status).toBe("running");
      expect(content.uptime).toBeDefined();
    });

    it("should return error for non-existent sandbox", async () => {
      const result = await handleSandboxTool("GetSandboxStatus", {
        sandboxId: "non_existent",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("StopSandbox", () => {
    it("should stop a sandbox", async () => {
      // First create a sandbox
      const createResult = await handleSandboxTool("CreateSandbox", {});
      const createContent = JSON.parse(createResult.content[0].text);
      const sandboxId = createContent.sandboxId;

      // Stop it
      const result = await handleSandboxTool("StopSandbox", { sandboxId });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.status).toBe("stopped");
    });

    it("should create snapshot when requested", async () => {
      // First create a sandbox
      const createResult = await handleSandboxTool("CreateSandbox", {});
      const createContent = JSON.parse(createResult.content[0].text);
      const sandboxId = createContent.sandboxId;

      // Stop with snapshot
      const result = await handleSandboxTool("StopSandbox", {
        sandboxId,
        saveSnapshot: true,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.snapshotId).toBeDefined();
    });
  });

  describe("WriteFileToSandbox", () => {
    it("should write a file to sandbox", async () => {
      // First create a sandbox
      const createResult = await handleSandboxTool("CreateSandbox", {});
      const createContent = JSON.parse(createResult.content[0].text);
      const sandboxId = createContent.sandboxId;

      // Write file
      const result = await handleSandboxTool("WriteFileToSandbox", {
        sandboxId,
        path: "/home/user/project/test.ts",
        content: "console.log('hello');",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.path).toBe("/home/user/project/test.ts");
    });
  });

  describe("ReadFileFromSandbox", () => {
    it("should read a file from sandbox", async () => {
      // First create a sandbox
      const createResult = await handleSandboxTool("CreateSandbox", {});
      const createContent = JSON.parse(createResult.content[0].text);
      const sandboxId = createContent.sandboxId;

      // Read file
      const result = await handleSandboxTool("ReadFileFromSandbox", {
        sandboxId,
        path: "/home/user/project/package.json",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.content).toBeDefined();
    });
  });

  describe("Unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await handleSandboxTool("UnknownTool", {});
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Unknown sandbox tool");
    });
  });
});
