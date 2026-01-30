import { describe, it, expect, beforeEach } from "vitest";
import { RetryBackoff, RetryConfig } from "./retry";

describe("RetryBackoff", () => {
  let strategy: RetryBackoff;
  const testConfig: RetryConfig = {
    baseDelayMs: 100,
    maxDelayMs: 5000,
    maxAttempts: 5,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
  };

  beforeEach(() => {
    strategy = new RetryBackoff(testConfig);
  });

  describe("reset", () => {
    it("should reset retry state", () => {
      strategy.increment();
      strategy.increment();
      expect(strategy.retryAttempt).toBe(2);
      strategy.reset();
      expect(strategy.retryAttempt).toBe(0);
    });
  });

  describe("increment and retryIn", () => {
    it("should increment attempts and calculate exponential backoff", () => {
      // First increment
      strategy.increment();
      const delay1 = strategy.retryIn();
      expect(delay1).toBeGreaterThanOrEqual(100); // base delay
      expect(delay1).toBeLessThanOrEqual(130); // base + 30% jitter

      // Second increment
      strategy.increment();
      const delay2 = strategy.retryIn();
      expect(delay2).toBeGreaterThanOrEqual(200); // 100 * 2
      expect(delay2).toBeLessThanOrEqual(260); // 200 + 30% jitter

      // Third increment
      strategy.increment();
      const delay3 = strategy.retryIn();
      expect(delay3).toBeGreaterThanOrEqual(400); // 100 * 2^2
      expect(delay3).toBeLessThanOrEqual(520); // 400 + 30% jitter
    });

    it("should cap delay at maxDelayMs", () => {
      // Record many failures to exceed max delay
      for (let i = 0; i < 10; i++) {
        strategy.increment();
        const delay = strategy.retryIn();
        if (delay !== null) {
          expect(delay).toBeLessThanOrEqual(testConfig.maxDelayMs * 1.3); // max + jitter
        }
      }
    });

    it("should return null after maxAttempts", () => {
      // Record failures up to max attempts
      for (let i = 0; i < testConfig.maxAttempts; i++) {
        strategy.increment();
        if (i < testConfig.maxAttempts - 1) {
          const delay = strategy.retryIn();
          expect(delay).not.toBeNull();
        }
      }

      // After max attempts, retryIn should return null
      const finalDelay = strategy.retryIn();
      expect(finalDelay).toBeNull();
    });
  });

  describe("shouldRetry", () => {
    it("should return null initially (no attempts yet)", () => {
      expect(strategy.retryIn()).toBeNull();
    });

    it("should return delay when below max attempts", () => {
      // Record some failures
      strategy.increment();
      strategy.increment();

      expect(strategy.retryIn()).not.toBeNull();
    });

    it("should return null when max attempts reached", () => {
      // Record failures up to max attempts
      for (let i = 0; i < testConfig.maxAttempts; i++) {
        strategy.increment();
      }

      expect(strategy.retryIn()).toBeNull();
    });
  });
});
