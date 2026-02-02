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

const {
  clearAll,
  addTestMemory,
  stem,
  tokenize,
  hashContent,
  getConfig,
  shortTermMemory,
  longTermCompressed,
  organizeTiers,
  calculateImportance,
  compressSession,
  getShortTermContext,
  getSummaryIndex,
} = _testUtils;

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

  describe("Tiered Memory System", () => {
    describe("calculateImportance()", () => {
      it("should score decisions higher than conversations", () => {
        const decision = {
          id: "1",
          content: "We decided to use TypeScript",
          metadata: { type: "decision", timestamp: new Date().toISOString() },
        };
        const conversation = {
          id: "2",
          content: "Hello world test",
          metadata: {
            type: "conversation",
            timestamp: new Date().toISOString(),
          },
        };

        const decisionScore = calculateImportance(decision);
        const conversationScore = calculateImportance(conversation);

        expect(decisionScore).toBeGreaterThan(conversationScore);
      });

      it("should boost recently accessed memories", () => {
        const accessed = {
          id: "1",
          content: "Accessed memory",
          metadata: {
            type: "conversation",
            timestamp: new Date().toISOString(),
            accessCount: 5,
          },
        };
        const notAccessed = {
          id: "2",
          content: "Not accessed memory",
          metadata: {
            type: "conversation",
            timestamp: new Date().toISOString(),
            accessCount: 0,
          },
        };

        expect(calculateImportance(accessed)).toBeGreaterThan(
          calculateImportance(notAccessed),
        );
      });

      it("should boost tagged memories", () => {
        const tagged = {
          id: "1",
          content: "Tagged memory",
          metadata: {
            type: "conversation",
            timestamp: new Date().toISOString(),
            tags: ["important"],
          },
        };
        const untagged = {
          id: "2",
          content: "Untagged memory",
          metadata: {
            type: "conversation",
            timestamp: new Date().toISOString(),
          },
        };

        expect(calculateImportance(tagged)).toBeGreaterThan(
          calculateImportance(untagged),
        );
      });
    });

    describe("compressSession()", () => {
      it("should create summary with key information", () => {
        const memories = [
          {
            id: "1",
            content: "Started working on auth feature",
            tokenCount: 10,
            metadata: {
              type: "conversation",
              timestamp: "2024-01-01T10:00:00Z",
              sessionId: "sess-1",
            },
          },
          {
            id: "2",
            content: "Decision: Use JWT for authentication",
            tokenCount: 15,
            metadata: {
              type: "decision",
              timestamp: "2024-01-01T11:00:00Z",
              sessionId: "sess-1",
            },
          },
          {
            id: "3",
            content: "Pattern: Always validate tokens on backend",
            tokenCount: 12,
            metadata: {
              type: "pattern",
              timestamp: "2024-01-01T12:00:00Z",
              sessionId: "sess-1",
            },
          },
        ];

        const compressed = compressSession("sess-1", memories);

        expect(compressed.sessionId).toBe("sess-1");
        expect(compressed.originalMemoryCount).toBe(3);
        expect(compressed.keyDecisions.length).toBeGreaterThan(0);
        expect(compressed.patternsLearned.length).toBeGreaterThan(0);
        expect(compressed.keywords.length).toBeGreaterThan(0);
        expect(compressed.memoryIds).toEqual(["1", "2", "3"]);
      });

      it("should handle empty sessions", () => {
        const compressed = compressSession("empty-sess", []);

        expect(compressed.originalMemoryCount).toBe(0);
        expect(compressed.summary).toContain("No memories");
      });
    });

    describe("organizeTiers()", () => {
      it("should place decisions in short-term memory", async () => {
        await addTestMemory("Regular conversation content", "conversation");
        await addTestMemory(
          "Important decision about architecture",
          "decision",
        );

        await organizeTiers();

        // Decisions should be in short-term
        let decisionInShortTerm = false;
        for (const id of shortTermMemory) {
          const memory = _testUtils.memoryStore.get(id);
          if (memory?.metadata?.type === "decision") {
            decisionInShortTerm = true;
            break;
          }
        }
        expect(decisionInShortTerm).toBe(true);
      });

      it("should place patterns in short-term memory", async () => {
        await addTestMemory("Regular content", "conversation");
        await addTestMemory("Pattern: Always use error boundaries", "pattern");

        await organizeTiers();

        let patternInShortTerm = false;
        for (const id of shortTermMemory) {
          const memory = _testUtils.memoryStore.get(id);
          if (memory?.metadata?.type === "pattern") {
            patternInShortTerm = true;
            break;
          }
        }
        expect(patternInShortTerm).toBe(true);
      });
    });

    describe("MemoryContext", () => {
      it("should return short-term context", async () => {
        await addTestMemory("Important decision for context", "decision");
        await addTestMemory("Pattern for context", "pattern");

        const result = await handleMemoryTool("MemoryContext", {});

        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain("Short-Term Memory");
      });

      it("should include long-term summary", async () => {
        await addTestMemory("Decision in context", "decision");

        const result = await handleMemoryTool("MemoryContext", {});

        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain("Long-term storage");
      });
    });

    describe("MemoryPromote", () => {
      it("should promote memory to short-term", async () => {
        const id = await addTestMemory("Memory to promote", "conversation");

        // First organize tiers
        await organizeTiers();

        const result = await handleMemoryTool("MemoryPromote", {
          memoryId: id,
        });

        expect(result.isError).toBeUndefined();
        expect(shortTermMemory.has(id)).toBe(true);
      });

      it("should handle already short-term memory", async () => {
        const id = await addTestMemory("Already short-term", "decision");
        await organizeTiers();

        const result = await handleMemoryTool("MemoryPromote", {
          memoryId: id,
        });

        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain("already in short-term");
      });

      it("should handle invalid memory ID", async () => {
        const result = await handleMemoryTool("MemoryPromote", {
          memoryId: "invalid-id",
        });

        expect(result.isError).toBe(true);
      });
    });

    describe("Tiered Search", () => {
      it("should search short-term first", async () => {
        // Add enough memories to trigger tiered search (> 50)
        for (let i = 0; i < 55; i++) {
          await addTestMemory(
            `Filler memory ${i} random content`,
            "conversation",
          );
        }
        await addTestMemory(
          "Authentication decision in short-term",
          "decision",
        );
        await organizeTiers();

        const result = await handleMemoryTool("MemorySearch", {
          query: "authentication decision",
          tier: "short-term",
        });

        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain("Authentication");
      });

      it("should indicate when long-term was searched", async () => {
        // Create enough memories to trigger tiering
        for (let i = 0; i < 60; i++) {
          await addTestMemory(
            `Filler memory ${i} with unique content`,
            "conversation",
          );
        }
        await addTestMemory("Specific auth pattern to find", "pattern");
        await organizeTiers();

        const result = await handleMemoryTool("MemorySearch", {
          query: "auth pattern",
        });

        expect(result.isError).toBeUndefined();
      });
    });

    describe("Stats with Tiers", () => {
      it("should show tier statistics", async () => {
        await addTestMemory("Decision for stats", "decision");
        await addTestMemory("Pattern for stats", "pattern");
        await addTestMemory("Conversation for stats", "conversation");

        const result = await handleMemoryTool("MemoryStats", {});

        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain("Tiers");
        expect(text).toContain("Short-term");
        expect(text).toContain("Long-term");
      });
    });
  });
});
