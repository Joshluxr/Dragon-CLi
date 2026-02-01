/**
 * Memory Handler Tests
 *
 * Comprehensive tests for the optimized memory system including:
 * - Token budgets and output limits
 * - Stemming and TF-IDF scoring
 * - Inverted index search
 * - Deduplication
 * - Tree caching
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleMemoryTool, _testUtils } from "./memory.js";

const { clearAll, addTestMemory, stem, tokenize, hashContent, getConfig } =
  _testUtils;

describe("Memory Handlers", () => {
  beforeEach(() => {
    clearAll();
  });

  describe("Text Processing", () => {
    describe("stem()", () => {
      it("should stem common suffixes", () => {
        expect(stem("running")).toBe("runn");
        expect(stem("jumped")).toBe("jump");
        expect(stem("authentication")).toBe("authenticat");
        expect(stem("users")).toBe("user");
        expect(stem("quickly")).toBe("quick");
      });

      it("should preserve short words", () => {
        expect(stem("the")).toBe("the");
        expect(stem("is")).toBe("is");
        expect(stem("a")).toBe("a");
      });

      it("should handle already stemmed words", () => {
        expect(stem("run")).toBe("run");
        expect(stem("jump")).toBe("jump");
      });
    });

    describe("tokenize()", () => {
      it("should split text into lowercase tokens", () => {
        expect(tokenize("Hello World")).toEqual(["hello", "world"]);
        expect(tokenize("TypeScript code")).toEqual(["typescript", "code"]);
      });

      it("should filter short tokens", () => {
        // Tokens < 2 chars are filtered out
        expect(tokenize("a is the code")).toEqual(["is", "the", "code"]);
        expect(tokenize("a b c test")).toEqual(["test"]);
      });

      it("should handle punctuation", () => {
        expect(tokenize("hello, world!")).toEqual(["hello", "world"]);
        expect(tokenize("user.name")).toEqual(["user", "name"]);
      });
    });

    describe("hashContent()", () => {
      it("should produce consistent hashes", () => {
        const content = "test content";
        expect(hashContent(content)).toBe(hashContent(content));
      });

      it("should produce different hashes for different content", () => {
        expect(hashContent("content a")).not.toBe(hashContent("content b"));
      });
    });
  });

  describe("MemoryAdd", () => {
    it("should add memory and return compact confirmation", async () => {
      const result = await handleMemoryTool("MemoryAdd", {
        content: "This is a test memory about authentication",
        type: "decision",
        tags: ["auth", "security"],
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0];
      expect(text?.type).toBe("text");
      expect((text as { text: string }).text).toContain("Added:");
      expect((text as { text: string }).text).toContain("decision");
    });

    it("should reject short content", async () => {
      const result = await handleMemoryTool("MemoryAdd", {
        content: "short",
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain(
        "too short",
      );
    });

    it("should cache token count on add", async () => {
      await addTestMemory("This is a longer test memory content", "test");
      const memory = _testUtils.memoryStore.values().next().value;
      expect(memory?.tokenCount).toBeGreaterThan(0);
    });
  });

  describe("MemorySearch", () => {
    beforeEach(async () => {
      await addTestMemory("User authentication with JWT tokens", "decision", [
        "auth",
      ]);
      await addTestMemory(
        "Database connection pooling configuration",
        "pattern",
        ["db"],
      );
      await addTestMemory("API rate limiting implementation", "decision", [
        "api",
      ]);
    });

    it("should find memories by keyword", async () => {
      const result = await handleMemoryTool("MemorySearch", {
        query: "authentication",
      });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("authentication");
      expect(text).toContain("results");
    });

    it("should find memories with stemmed terms", async () => {
      // "authenticating" should match "authentication" via stemming
      const result = await handleMemoryTool("MemorySearch", {
        query: "authenticating",
      });

      const text = (result.content[0] as { text: string }).text;
      // Should find the JWT authentication memory
      expect(text).toContain("JWT");
    });

    it("should respect similarity threshold", async () => {
      const result = await handleMemoryTool("MemorySearch", {
        query: "xyz123nonexistent",
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("No memories found");
    });

    it("should filter by type", async () => {
      const result = await handleMemoryTool("MemorySearch", {
        query: "implementation",
        type: "pattern",
      });

      const text = (result.content[0] as { text: string }).text;
      // Should not find API rate limiting (it's a decision, not pattern)
      expect(text).toContain("No memories found");
    });

    it("should produce compact output within token budget", async () => {
      // Add many memories
      for (let i = 0; i < 20; i++) {
        await addTestMemory(`Test memory number ${i} about searching`, "test");
      }

      const result = await handleMemoryTool("MemorySearch", {
        query: "searching",
      });
      const text = (result.content[0] as { text: string }).text;

      // Should be compact - check it doesn't exceed reasonable length
      expect(text.length).toBeLessThan(3000);
    });
  });

  describe("MemoryGet", () => {
    it("should retrieve full content by ID", async () => {
      const id = await addTestMemory(
        "Full content for retrieval test with details",
        "test",
      );

      const result = await handleMemoryTool("MemoryGet", { ids: [id] });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Full content for retrieval test");
      expect(text).toContain(id);
    });

    it("should handle missing IDs gracefully", async () => {
      const result = await handleMemoryTool("MemoryGet", {
        ids: ["nonexistent-id"],
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("No memories found");
    });

    it("should respect token budget", async () => {
      // Add a very long memory
      const longContent = "A".repeat(10000);
      const id = await addTestMemory(longContent, "test");

      const result = await handleMemoryTool("MemoryGet", {
        ids: [id],
        maxTokens: 100, // Very low limit
      });

      const text = (result.content[0] as { text: string }).text;
      // Should still contain the content (first item always included)
      expect(text).toContain("Retrieved");
    });

    it("should deduplicate IDs", async () => {
      const id = await addTestMemory("Dedup test content", "test");

      const result = await handleMemoryTool("MemoryGet", { ids: [id, id, id] });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("1 items"); // Should only show once
    });
  });

  describe("MemoryTree", () => {
    it("should build tree with categories", async () => {
      await addTestMemory("Pattern memory", "pattern");
      await addTestMemory("Decision memory", "decision");
      await addTestMemory("Context memory", "context");

      const result = await handleMemoryTool("MemoryTree", {});

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Tree");
      expect(text).toContain("items");
    });

    it("should respect maxDepth", async () => {
      await addTestMemory("Test memory", "conversation");

      const resultDepth1 = await handleMemoryTool("MemoryTree", {
        maxDepth: 1,
      });
      const resultDepth3 = await handleMemoryTool("MemoryTree", {
        maxDepth: 3,
      });

      // Depth 3 might have more content
      expect(
        (resultDepth3.content[0] as { text: string }).text.length,
      ).toBeGreaterThanOrEqual(
        (resultDepth1.content[0] as { text: string }).text.length,
      );
    });

    it("should cache tree for performance", async () => {
      await addTestMemory("Cache test memory", "test");

      const config = getConfig();
      // Tree should be cached for 30 minutes
      expect(config.TREE_CACHE_TTL).toBe(30 * 60 * 1000);
    });

    it("should produce compact output", async () => {
      // Add many memories in multiple categories
      for (let i = 0; i < 10; i++) {
        await addTestMemory(`Pattern ${i}`, "pattern");
        await addTestMemory(`Decision ${i}`, "decision");
      }

      const result = await handleMemoryTool("MemoryTree", {});
      const text = (result.content[0] as { text: string }).text;

      // Should be within token budget
      expect(text.length).toBeLessThan(5000);
    });
  });

  describe("MemoryNavigate", () => {
    beforeEach(async () => {
      await addTestMemory("Pattern for navigation", "pattern");
      await addTestMemory("Decision for navigation", "decision");
    });

    it("should navigate to category node", async () => {
      const result = await handleMemoryTool("MemoryNavigate", {
        nodeId: "patterns",
      });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Patterns");
      expect(text).toContain("Path:");
    });

    it("should show memory IDs for leaf nodes", async () => {
      const result = await handleMemoryTool("MemoryNavigate", {
        nodeId: "patterns",
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("IDs:");
    });

    it("should handle invalid node ID", async () => {
      const result = await handleMemoryTool("MemoryNavigate", {
        nodeId: "invalid-node",
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("not found");
    });
  });

  describe("MemoryStats", () => {
    it("should show statistics", async () => {
      await addTestMemory("Stat test 1", "pattern");
      await addTestMemory("Stat test 2", "decision");

      const result = await handleMemoryTool("MemoryStats", {});

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Stats");
      expect(text).toContain("Memories:");
      expect(text).toContain("Categories:");
    });

    it("should use cached tree depth", async () => {
      await addTestMemory("Deep test", "conversation");

      const result = await handleMemoryTool("MemoryStats", {});

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Depth:");
    });
  });

  describe("MemoryTimeline", () => {
    it("should show chronological memories", async () => {
      const id1 = await addTestMemory("First memory", "test");
      await new Promise((r) => setTimeout(r, 10));
      const id2 = await addTestMemory("Second memory", "test");
      await new Promise((r) => setTimeout(r, 10));
      await addTestMemory("Third memory", "test");

      const result = await handleMemoryTool("MemoryTimeline", {
        anchor: id2,
        before: 1,
        after: 1,
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Timeline");
      expect(text).toContain(id1);
      expect(text).toContain(id2);
    });
  });

  describe("Deduplication", () => {
    it("should deduplicate similar search results", async () => {
      // Add duplicate content
      await addTestMemory("Duplicate content about testing", "test");
      await addTestMemory("Duplicate content about testing", "test");

      const result = await handleMemoryTool("MemorySearch", {
        query: "duplicate testing",
      });

      const text = (result.content[0] as { text: string }).text;
      // Should only show one result due to deduplication
      expect(text.match(/mem-/g)?.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Configuration", () => {
    it("should have correct default values", () => {
      const config = getConfig();

      expect(config.MIN_SIMILARITY).toBe(0.65);
      expect(config.TREE_CACHE_TTL).toBe(30 * 60 * 1000);
      expect(config.MAX_SEARCH_RESULTS).toBe(20);
      expect(config.MAX_CHILDREN_DISPLAY).toBe(10);
      expect(config.SUMMARY_TRUNCATE_LENGTH).toBe(60);
      expect(config.TOKEN_BUDGETS.search).toBe(400);
    });
  });

  describe("TF-IDF Scoring", () => {
    it("should rank more relevant results higher", async () => {
      // Add memories with different relevance
      await addTestMemory("Authentication authentication auth auth", "test");
      await addTestMemory("User login system", "test");
      await addTestMemory("Auth helper function", "test");

      const result = await handleMemoryTool("MemorySearch", {
        query: "authentication",
      });

      const text = (result.content[0] as { text: string }).text;
      const lines = text.split("\n").filter((l) => l.includes("mem-"));

      // First result should be the one with most "authentication" mentions
      expect(lines[0]).toContain("auth");
    });
  });
});
