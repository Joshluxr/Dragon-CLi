import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
  CircuitBreakerRegistry,
  type CircuitBreakerConfig,
} from "./circuit-breaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  const fastConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 100, // 100ms for fast tests
    monitoringWindow: 1000,
  };

  beforeEach(() => {
    breaker = new CircuitBreaker("test", fastConfig);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("should start in closed state", () => {
      expect(breaker.getState()).toBe("closed");
    });

    it("should allow requests in closed state", () => {
      expect(breaker.isAllowed()).toBe(true);
    });

    it("should have zero stats initially", () => {
      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
    });
  });

  describe("successful requests", () => {
    it("should pass through successful requests", async () => {
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("should track successful requests", async () => {
      await breaker.execute(async () => "success");
      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it("should stay closed after successes", async () => {
      for (let i = 0; i < 10; i++) {
        await breaker.execute(async () => "success");
      }
      expect(breaker.getState()).toBe("closed");
    });
  });

  describe("failed requests", () => {
    it("should propagate errors", async () => {
      const error = new Error("test error");
      await expect(
        breaker.execute(async () => {
          throw error;
        }),
      ).rejects.toThrow("test error");
    });

    it("should track failed requests", async () => {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }
      const stats = breaker.getStats();
      expect(stats.totalFailures).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it("should open circuit after threshold failures", async () => {
      for (let i = 0; i < fastConfig.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }
      expect(breaker.getState()).toBe("open");
    });

    it("should not open circuit below threshold", async () => {
      for (let i = 0; i < fastConfig.failureThreshold - 1; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }
      expect(breaker.getState()).toBe("closed");
    });
  });

  describe("open state", () => {
    beforeEach(async () => {
      // Trip the circuit
      for (let i = 0; i < fastConfig.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }
    });

    it("should throw CircuitOpenError when open", async () => {
      await expect(breaker.execute(async () => "success")).rejects.toThrow(
        CircuitOpenError,
      );
    });

    it("should include circuit name in error", async () => {
      try {
        await breaker.execute(async () => "success");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).circuitName).toBe("test");
      }
    });

    it("should provide retry time in error", async () => {
      try {
        await breaker.execute(async () => "success");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).retryAfterMs).toBeGreaterThan(0);
        expect((error as CircuitOpenError).retryAfterMs).toBeLessThanOrEqual(
          fastConfig.timeout,
        );
      }
    });

    it("should not allow requests", () => {
      expect(breaker.isAllowed()).toBe(false);
    });

    it("should transition to half-open after timeout", async () => {
      vi.advanceTimersByTime(fastConfig.timeout + 1);
      expect(breaker.isAllowed()).toBe(true);

      // Execute to trigger state change
      await breaker.execute(async () => "success");
      // After success in half-open, might still be half-open or closed depending on successThreshold
    });
  });

  describe("half-open state", () => {
    beforeEach(async () => {
      // Trip and wait for timeout
      for (let i = 0; i < fastConfig.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }
      vi.advanceTimersByTime(fastConfig.timeout + 1);
    });

    it("should close after success threshold reached", async () => {
      for (let i = 0; i < fastConfig.successThreshold; i++) {
        await breaker.execute(async () => "success");
      }
      expect(breaker.getState()).toBe("closed");
    });

    it("should reopen on any failure", async () => {
      // First execute to enter half-open
      await breaker.execute(async () => "success");

      // Then fail
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe("open");
    });
  });

  describe("executeWithFallback", () => {
    it("should return primary result when circuit is closed", async () => {
      const result = await breaker.executeWithFallback(
        async () => "primary",
        async () => "fallback",
      );
      expect(result).toBe("primary");
    });

    it("should use fallback when circuit is open", async () => {
      // Trip the circuit
      for (let i = 0; i < fastConfig.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }

      const result = await breaker.executeWithFallback(
        async () => "primary",
        async () => "fallback",
      );
      expect(result).toBe("fallback");
    });

    it("should propagate non-circuit errors", async () => {
      await expect(
        breaker.executeWithFallback(
          async () => {
            throw new Error("primary error");
          },
          async () => "fallback",
        ),
      ).rejects.toThrow("primary error");
    });
  });

  describe("state change listeners", () => {
    it("should notify listeners on state change", async () => {
      const listener = vi.fn();
      breaker.onStateChange(listener);

      // Trip the circuit
      for (let i = 0; i < fastConfig.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }

      expect(listener).toHaveBeenCalledWith("open", "closed");
    });

    it("should allow unsubscribing", async () => {
      const listener = vi.fn();
      const unsubscribe = breaker.onStateChange(listener);
      unsubscribe();

      // Trip the circuit
      for (let i = 0; i < fastConfig.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("manual controls", () => {
    it("should allow manual reset", async () => {
      // Trip the circuit
      for (let i = 0; i < fastConfig.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }
      expect(breaker.getState()).toBe("open");

      breaker.reset();
      expect(breaker.getState()).toBe("closed");
    });

    it("should allow manual trip", () => {
      expect(breaker.getState()).toBe("closed");
      breaker.trip();
      expect(breaker.getState()).toBe("open");
    });
  });

  describe("monitoring window", () => {
    it("should not count old failures", async () => {
      // Cause some failures
      for (let i = 0; i < fastConfig.failureThreshold - 1; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // expected
        }
      }

      // Wait for monitoring window to expire
      vi.advanceTimersByTime(fastConfig.monitoringWindow + 1);

      // Cause one more failure (shouldn't trip because old ones expired)
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }

      // Should still be closed because old failures don't count
      expect(breaker.getState()).toBe("closed");
    });
  });
});

describe("CircuitBreakerRegistry", () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it("should create new breakers", () => {
    const breaker = registry.getOrCreate("test");
    expect(breaker).toBeInstanceOf(CircuitBreaker);
  });

  it("should return existing breakers", () => {
    const breaker1 = registry.getOrCreate("test");
    const breaker2 = registry.getOrCreate("test");
    expect(breaker1).toBe(breaker2);
  });

  it("should create breakers with custom config", () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 10,
      successThreshold: 5,
      timeout: 60000,
      monitoringWindow: 120000,
    };
    const breaker = registry.getOrCreate("test", config);
    expect(breaker).toBeInstanceOf(CircuitBreaker);
  });

  it("should get all stats", async () => {
    const breaker1 = registry.getOrCreate("test1");
    const breaker2 = registry.getOrCreate("test2");

    await breaker1.execute(async () => "success");
    await breaker2.execute(async () => "success");

    const stats = registry.getAllStats();
    expect(stats["test1"]?.totalSuccesses).toBe(1);
    expect(stats["test2"]?.totalSuccesses).toBe(1);
  });

  it("should reset all breakers", async () => {
    vi.useFakeTimers();

    const config: CircuitBreakerConfig = {
      failureThreshold: 1,
      successThreshold: 1,
      timeout: 100,
      monitoringWindow: 1000,
    };

    const breaker1 = registry.getOrCreate("test1", config);
    const breaker2 = registry.getOrCreate("test2", config);

    // Trip both
    try {
      await breaker1.execute(async () => {
        throw new Error("fail");
      });
    } catch {
      // expected
    }
    try {
      await breaker2.execute(async () => {
        throw new Error("fail");
      });
    } catch {
      // expected
    }

    expect(breaker1.getState()).toBe("open");
    expect(breaker2.getState()).toBe("open");

    registry.resetAll();

    expect(breaker1.getState()).toBe("closed");
    expect(breaker2.getState()).toBe("closed");

    vi.useRealTimers();
  });
});
