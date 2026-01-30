import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";

// Mock dependencies
vi.mock("fs");
vi.mock("os");
vi.mock("supermemory", () => ({
  Supermemory: vi.fn().mockImplementation(() => ({
    profile: vi.fn().mockResolvedValue({
      profile: { static: [], dynamic: [] },
    }),
    add: vi
      .fn()
      .mockResolvedValue({ id: "mem_test_123", status: "processing" }),
    search: {
      memories: vi.fn().mockResolvedValue({ results: [] }),
    },
  })),
}));

import { SupermemoryClient } from "../client";

describe("SupermemoryClient", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/mock/home");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.SUPERMEMORY_CC_API_KEY = "sm_test_key";

    // Reset the Supermemory mock to default implementation
    const { Supermemory } = await import("supermemory");
    vi.mocked(Supermemory).mockImplementation(
      () =>
        ({
          profile: vi.fn().mockResolvedValue({
            profile: { static: [], dynamic: [] },
          }),
          add: vi
            .fn()
            .mockResolvedValue({ id: "mem_test_123", status: "processing" }),
          search: {
            memories: vi.fn().mockResolvedValue({ results: [] }),
          },
        }) as unknown as InstanceType<typeof Supermemory>,
    );
  });

  afterEach(() => {
    delete process.env.SUPERMEMORY_CC_API_KEY;
  });

  describe("constructor", () => {
    it("should create client with project info", () => {
      const client = new SupermemoryClient("/test/project");
      const projectInfo = client.getProjectInfo();

      expect(projectInfo.workingDir).toBe("/test/project");
      expect(projectInfo.projectName).toBe("project");
      expect(projectInfo.containerTag).toBe("project:project");
    });
  });

  describe("getContext", () => {
    it("should return formatted context with static and dynamic memories", async () => {
      const { Supermemory } = await import("supermemory");
      vi.mocked(Supermemory).mockImplementation(
        () =>
          ({
            profile: vi.fn().mockResolvedValue({
              profile: {
                static: ["User prefers TypeScript"],
                dynamic: ["Recent project discussion"],
              },
            }),
            add: vi.fn(),
            search: { memories: vi.fn() },
          }) as unknown as InstanceType<typeof Supermemory>,
      );

      const client = new SupermemoryClient("/test/project");
      const context = await client.getContext();

      expect(context.xml).toContain("<supermemory-context>");
      expect(context.itemCount).toBe(2);
    });

    it("should return empty context when no memories", async () => {
      const client = new SupermemoryClient("/test/project");
      const context = await client.getContext();

      expect(context.xml).toContain("<supermemory-context>");
    });

    it("should handle errors gracefully", async () => {
      const { Supermemory } = await import("supermemory");
      vi.mocked(Supermemory).mockImplementation(
        () =>
          ({
            profile: vi.fn().mockRejectedValue(new Error("API Error")),
            add: vi.fn(),
            search: { memories: vi.fn() },
          }) as unknown as InstanceType<typeof Supermemory>,
      );

      const client = new SupermemoryClient("/test/project");
      const context = await client.getContext();

      expect(context.xml).toContain("Failed to load memories");
    });
  });

  describe("addMemory", () => {
    it("should add memory and return id", async () => {
      const client = new SupermemoryClient("/test/project");
      const id = await client.addMemory("Test content", "test");

      expect(id).toBe("mem_test_123");
    });

    it("should return null on error", async () => {
      const { Supermemory } = await import("supermemory");
      vi.mocked(Supermemory).mockImplementation(
        () =>
          ({
            profile: vi.fn(),
            add: vi.fn().mockRejectedValue(new Error("API Error")),
            search: { memories: vi.fn() },
          }) as unknown as InstanceType<typeof Supermemory>,
      );

      const client = new SupermemoryClient("/test/project");
      const id = await client.addMemory("Test content", "test");

      expect(id).toBeNull();
    });
  });

  describe("search", () => {
    it("should search and return results", async () => {
      const { Supermemory } = await import("supermemory");
      vi.mocked(Supermemory).mockImplementation(
        () =>
          ({
            profile: vi.fn(),
            add: vi.fn(),
            search: {
              memories: vi.fn().mockResolvedValue({
                results: [
                  { id: "mem_1", memory: "Test result", similarity: 0.9 },
                ],
              }),
            },
          }) as unknown as InstanceType<typeof Supermemory>,
      );

      const client = new SupermemoryClient("/test/project");
      const results = await client.search("test query");

      expect(results).toHaveLength(1);
      expect(results[0]?.content).toBe("Test result");
    });

    it("should return empty array on error", async () => {
      const { Supermemory } = await import("supermemory");
      vi.mocked(Supermemory).mockImplementation(
        () =>
          ({
            profile: vi.fn(),
            add: vi.fn(),
            search: {
              memories: vi.fn().mockRejectedValue(new Error("API Error")),
            },
          }) as unknown as InstanceType<typeof Supermemory>,
      );

      const client = new SupermemoryClient("/test/project");
      const results = await client.search("test query");

      expect(results).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should throw when API key not set", () => {
      delete process.env.SUPERMEMORY_CC_API_KEY;

      const client = new SupermemoryClient();

      // Access private method via type assertion
      expect(() => (client as any).getClient()).toThrow(
        "SUPERMEMORY_CC_API_KEY",
      );
    });
  });
});
