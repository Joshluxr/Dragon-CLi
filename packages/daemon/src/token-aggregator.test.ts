import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TokenAggregator,
  type TokenAggregatorConfig,
} from "./token-aggregator";

describe("TokenAggregator", () => {
  let aggregator: TokenAggregator;
  let onFlush: ReturnType<typeof vi.fn>;

  const fastConfig: TokenAggregatorConfig = {
    flushIntervalMs: 100,
    minTokensToFlush: 0,
    maxHoldTimeMs: 50,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    onFlush = vi.fn().mockResolvedValue(undefined);
    aggregator = new TokenAggregator(onFlush, fastConfig);
  });

  afterEach(async () => {
    await aggregator.stop();
    vi.useRealTimers();
  });

  describe("add", () => {
    it("should accumulate tokens for a thread", () => {
      aggregator.add("thread-1", { inputTokens: 100 });
      aggregator.add("thread-1", { inputTokens: 50, outputTokens: 25 });

      const usage = aggregator.peek("thread-1");
      expect(usage).toEqual({
        inputTokens: 150,
        outputTokens: 25,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should handle multiple threads independently", () => {
      aggregator.add("thread-1", { inputTokens: 100 });
      aggregator.add("thread-2", { inputTokens: 200 });

      expect(aggregator.peek("thread-1")?.inputTokens).toBe(100);
      expect(aggregator.peek("thread-2")?.inputTokens).toBe(200);
    });

    it("should handle all token types", () => {
      aggregator.add("thread-1", {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 25,
        cacheReadTokens: 10,
      });

      const usage = aggregator.peek("thread-1");
      expect(usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 25,
        cacheReadTokens: 10,
      });
    });
  });

  describe("peek", () => {
    it("should return null for unknown thread", () => {
      expect(aggregator.peek("unknown")).toBeNull();
    });

    it("should not modify the bucket", () => {
      aggregator.add("thread-1", { inputTokens: 100 });

      aggregator.peek("thread-1");
      aggregator.peek("thread-1");

      expect(aggregator.peek("thread-1")?.inputTokens).toBe(100);
    });
  });

  describe("flush", () => {
    it("should call onFlush with accumulated tokens", async () => {
      aggregator.add("thread-1", { inputTokens: 100, outputTokens: 50 });

      await aggregator.flush("thread-1");

      expect(onFlush).toHaveBeenCalledWith("thread-1", {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it("should clear the bucket after flush", async () => {
      aggregator.add("thread-1", { inputTokens: 100 });

      await aggregator.flush("thread-1");

      expect(aggregator.peek("thread-1")).toBeNull();
    });

    it("should not call onFlush for empty bucket", async () => {
      await aggregator.flush("unknown");
      expect(onFlush).not.toHaveBeenCalled();
    });

    it("should re-add tokens on flush failure", async () => {
      onFlush.mockRejectedValueOnce(new Error("Network error"));

      aggregator.add("thread-1", { inputTokens: 100 });
      await aggregator.flush("thread-1");

      // Tokens should be back in the bucket
      expect(aggregator.peek("thread-1")?.inputTokens).toBe(100);
    });

    it("should deduplicate concurrent flushes for same thread", async () => {
      vi.useRealTimers(); // Need real timers for this test

      let flushCount = 0;
      const slowFlush = vi.fn().mockImplementation(async () => {
        flushCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const slowAggregator = new TokenAggregator(slowFlush, fastConfig);
      slowAggregator.add("thread-1", { inputTokens: 100 });

      // Start multiple concurrent flushes
      const flush1 = slowAggregator.flush("thread-1");
      const flush2 = slowAggregator.flush("thread-1");
      const flush3 = slowAggregator.flush("thread-1");

      await Promise.all([flush1, flush2, flush3]);

      // Only one actual flush should have occurred
      expect(flushCount).toBe(1);

      await slowAggregator.stop();
      vi.useFakeTimers();
    });
  });

  describe("flushAll", () => {
    it("should flush all threads", async () => {
      aggregator.add("thread-1", { inputTokens: 100 });
      aggregator.add("thread-2", { inputTokens: 200 });

      await aggregator.flushAll();

      expect(onFlush).toHaveBeenCalledTimes(2);
      expect(aggregator.peek("thread-1")).toBeNull();
      expect(aggregator.peek("thread-2")).toBeNull();
    });

    it("should handle partial failures", async () => {
      onFlush.mockResolvedValueOnce(undefined);
      onFlush.mockRejectedValueOnce(new Error("Failed"));

      aggregator.add("thread-1", { inputTokens: 100 });
      aggregator.add("thread-2", { inputTokens: 200 });

      await aggregator.flushAll();

      // thread-2 should have tokens re-added on failure
      expect(aggregator.peek("thread-1")).toBeNull();
      expect(aggregator.peek("thread-2")?.inputTokens).toBe(200);
    });
  });

  describe("automatic flushing", () => {
    it("should auto-flush after maxHoldTime", async () => {
      aggregator.start();
      aggregator.add("thread-1", { inputTokens: 100 });

      // Advance past maxHoldTime and flushInterval
      await vi.advanceTimersByTimeAsync(fastConfig.flushIntervalMs + 10);

      expect(onFlush).toHaveBeenCalled();
    });

    it("should not flush before maxHoldTime if no minimum tokens set", async () => {
      const noMinConfig: TokenAggregatorConfig = {
        ...fastConfig,
        maxHoldTimeMs: 1000,
        flushIntervalMs: 50,
        minTokensToFlush: 1000, // High minimum
      };

      const noMinAggregator = new TokenAggregator(onFlush, noMinConfig);
      noMinAggregator.start();
      noMinAggregator.add("thread-1", { inputTokens: 100 });

      // Advance one interval but not past maxHoldTime
      await vi.advanceTimersByTimeAsync(100);

      // Should not have flushed yet (not enough tokens and not past maxHoldTime)
      expect(onFlush).not.toHaveBeenCalled();

      await noMinAggregator.stop();
    });
  });

  describe("stop", () => {
    it("should flush remaining tokens on stop", async () => {
      aggregator.start();
      aggregator.add("thread-1", { inputTokens: 100 });

      await aggregator.stop();

      expect(onFlush).toHaveBeenCalledWith("thread-1", expect.any(Object));
    });

    it("should clear the interval", async () => {
      aggregator.start();
      await aggregator.stop();

      // Add tokens after stop
      aggregator.add("thread-1", { inputTokens: 100 });

      // Advance time - should not trigger flush since stopped
      vi.advanceTimersByTime(fastConfig.flushIntervalMs * 2);

      // Only the final flush from stop() should have been called
      expect(onFlush).toHaveBeenCalledTimes(0); // tokens added after stop are ignored
    });

    it("should reject new tokens during shutdown", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      aggregator.start();
      const stopPromise = aggregator.stop();

      // Try to add during shutdown
      aggregator.add("thread-1", { inputTokens: 100 });

      await stopPromise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cannot add tokens during shutdown"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      aggregator.add("thread-1", { inputTokens: 100, outputTokens: 50 });
      aggregator.add("thread-2", { inputTokens: 200 });

      const stats = aggregator.getStats();

      expect(stats.activeThreads).toBe(2);
      expect(stats.totalPendingTokens).toEqual({
        inputTokens: 300,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
      expect(stats.pendingFlushes).toBe(0);
    });

    it("should reflect pending flushes", async () => {
      vi.useRealTimers();

      const slowFlush = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const slowAggregator = new TokenAggregator(slowFlush, fastConfig);
      slowAggregator.add("thread-1", { inputTokens: 100 });

      const flushPromise = slowAggregator.flush("thread-1");

      // Check stats during flush
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(slowAggregator.getStats().pendingFlushes).toBe(1);

      await flushPromise;
      expect(slowAggregator.getStats().pendingFlushes).toBe(0);

      await slowAggregator.stop();
      vi.useFakeTimers();
    });
  });
});
