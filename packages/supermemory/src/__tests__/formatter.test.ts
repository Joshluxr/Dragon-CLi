import { describe, it, expect } from "vitest";
import {
  formatContextForClaude,
  formatSearchResults,
  MemoryItem,
} from "../utils/formatter";

describe("formatter", () => {
  describe("formatContextForClaude", () => {
    it("should format memories as XML", () => {
      const memories: MemoryItem[] = [
        {
          id: "mem_1",
          content: "Test memory content",
          metadata: { type: "conversation", project: "test" },
          similarity: 0.95,
        },
      ];

      const result = formatContextForClaude(memories);

      expect(result.itemCount).toBe(1);
      expect(result.xml).toContain("<supermemory-context>");
      expect(result.xml).toContain('similarity="95%"');
      expect(result.xml).toContain("Test memory content");
    });

    it("should handle empty memories", () => {
      const result = formatContextForClaude([]);

      expect(result.itemCount).toBe(0);
      expect(result.xml).toContain("No previous memories found");
    });

    it("should respect maxItems limit", () => {
      const memories: MemoryItem[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem_${i}`,
        content: `Memory ${i}`,
      }));

      const result = formatContextForClaude(memories, 10);

      expect(result.itemCount).toBe(10);
    });

    it("should escape XML special characters", () => {
      const memories: MemoryItem[] = [
        {
          id: "mem_1",
          content: '<script>alert("xss")</script>',
        },
      ];

      const result = formatContextForClaude(memories);

      expect(result.xml).not.toContain("<script>");
      expect(result.xml).toContain("&lt;script&gt;");
    });

    it("should handle memories without similarity", () => {
      const memories: MemoryItem[] = [
        {
          id: "mem_1",
          content: "No similarity score",
        },
      ];

      const result = formatContextForClaude(memories);

      expect(result.xml).not.toContain("similarity=");
      expect(result.xml).toContain("No similarity score");
    });

    it("should handle memories without metadata", () => {
      const memories: MemoryItem[] = [
        {
          id: "mem_1",
          content: "No metadata",
        },
      ];

      const result = formatContextForClaude(memories);

      expect(result.xml).toContain("<type>unknown</type>");
    });
  });

  describe("formatSearchResults", () => {
    it("should format results with similarity scores", () => {
      const results: MemoryItem[] = [
        { id: "mem_1", content: "First result", similarity: 0.95 },
        { id: "mem_2", content: "Second result", similarity: 0.8 },
      ];

      const formatted = formatSearchResults(results, "test query");

      expect(formatted).toContain("Found 2 memories");
      expect(formatted).toContain("95% match");
      expect(formatted).toContain("80% match");
    });

    it("should truncate long content", () => {
      const longContent = "x".repeat(1000);
      const results: MemoryItem[] = [{ id: "mem_1", content: longContent }];

      const formatted = formatSearchResults(results, "test");

      expect(formatted).toContain("...");
      expect(formatted.length).toBeLessThan(longContent.length);
    });

    it("should handle no results", () => {
      const formatted = formatSearchResults([], "nonexistent");

      expect(formatted).toContain("No memories found");
      expect(formatted).toContain("nonexistent");
    });

    it("should number results", () => {
      const results: MemoryItem[] = [
        { id: "mem_1", content: "First" },
        { id: "mem_2", content: "Second" },
        { id: "mem_3", content: "Third" },
      ];

      const formatted = formatSearchResults(results, "test");

      expect(formatted).toContain("1. First");
      expect(formatted).toContain("2. Second");
      expect(formatted).toContain("3. Third");
    });
  });
});
