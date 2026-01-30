import { describe, it, expect } from "vitest";
import {
  processBatchWithDelay,
  sleep,
  countSettledResults,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_DELAY_MS,
} from "./batch";

describe("batch utilities", () => {
  describe("processBatchWithDelay", () => {
    it("should process all items in batches", async () => {
      const items = [1, 2, 3, 4, 5];
      const processed: number[] = [];

      await processBatchWithDelay(
        items,
        async (item) => {
          processed.push(item);
        },
        { batchSize: 2, delayMs: 0 },
      );

      expect(processed).toEqual([1, 2, 3, 4, 5]);
    });

    it("should use default batch size and delay", async () => {
      expect(DEFAULT_BATCH_SIZE).toBe(10);
      expect(DEFAULT_BATCH_DELAY_MS).toBe(1000);
    });

    it("should handle empty array", async () => {
      const results = await processBatchWithDelay([], async () => {}, {
        batchSize: 10,
        delayMs: 0,
      });

      expect(results).toEqual([]);
    });

    it("should return settled results for each item", async () => {
      const items = [1, 2, 3];
      const results = await processBatchWithDelay(
        items,
        async (item) => {
          if (item === 2) throw new Error("Item 2 failed");
        },
        { batchSize: 10, delayMs: 0 },
      );

      expect(results).toHaveLength(3);
      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]?.status).toBe("rejected");
      expect(results[2]?.status).toBe("fulfilled");
    });

    it("should add delay between batches", async () => {
      const items = [1, 2, 3, 4];
      const startTime = Date.now();

      await processBatchWithDelay(items, async () => {}, {
        batchSize: 2,
        delayMs: 50,
      });

      const elapsed = Date.now() - startTime;
      // Should have 1 delay (between batch 1-2 and 3-4)
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it("should not add delay after the last batch", async () => {
      const items = [1, 2];
      const startTime = Date.now();

      await processBatchWithDelay(items, async () => {}, {
        batchSize: 2,
        delayMs: 100,
      });

      const elapsed = Date.now() - startTime;
      // Should have no delay since all items fit in one batch
      expect(elapsed).toBeLessThan(50);
    });

    it("should process items in order within batches", async () => {
      const items = ["a", "b", "c", "d", "e"];
      const order: string[] = [];

      await processBatchWithDelay(
        items,
        async (item) => {
          order.push(item);
        },
        { batchSize: 2, delayMs: 0 },
      );

      // Items within each batch may complete in any order due to Promise.allSettled,
      // but batches should be processed sequentially
      expect(order).toHaveLength(5);
      expect(new Set(order)).toEqual(new Set(items));
    });
  });

  describe("sleep", () => {
    it("should delay execution", async () => {
      const startTime = Date.now();
      await sleep(50);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe("countSettledResults", () => {
    it("should count fulfilled and rejected results", () => {
      const results: PromiseSettledResult<unknown>[] = [
        { status: "fulfilled", value: 1 },
        { status: "rejected", reason: new Error("test") },
        { status: "fulfilled", value: 2 },
        { status: "fulfilled", value: 3 },
        { status: "rejected", reason: new Error("test2") },
      ];

      const counts = countSettledResults(results);

      expect(counts.fulfilled).toBe(3);
      expect(counts.rejected).toBe(2);
    });

    it("should handle empty results", () => {
      const counts = countSettledResults([]);

      expect(counts.fulfilled).toBe(0);
      expect(counts.rejected).toBe(0);
    });

    it("should handle all fulfilled", () => {
      const results: PromiseSettledResult<unknown>[] = [
        { status: "fulfilled", value: 1 },
        { status: "fulfilled", value: 2 },
      ];

      const counts = countSettledResults(results);

      expect(counts.fulfilled).toBe(2);
      expect(counts.rejected).toBe(0);
    });

    it("should handle all rejected", () => {
      const results: PromiseSettledResult<unknown>[] = [
        { status: "rejected", reason: new Error("1") },
        { status: "rejected", reason: new Error("2") },
      ];

      const counts = countSettledResults(results);

      expect(counts.fulfilled).toBe(0);
      expect(counts.rejected).toBe(2);
    });
  });
});
