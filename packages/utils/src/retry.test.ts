import { describe, it, expect, vi } from "vitest";
import { retryAsync } from "./retry";

describe("retryAsync", () => {
  it("should return value on first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await retryAsync(fn, { label: "test operation" });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and succeed on subsequent attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValue("success");

    const result = await retryAsync(fn, {
      label: "test operation",
      maxAttempts: 3,
      delayMs: 10,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw last error after all attempts fail", async () => {
    const error = new Error("Persistent failure");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      retryAsync(fn, {
        label: "test operation",
        maxAttempts: 3,
        delayMs: 10,
      }),
    ).rejects.toThrow("Persistent failure");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should use default options when not provided", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("First failure"))
      .mockRejectedValueOnce(new Error("Second failure"))
      .mockResolvedValue("success");

    // Override default delayMs for faster testing
    const result = await retryAsync(fn, {
      label: "test operation",
      delayMs: 10,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should respect custom maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Always fails"));

    await expect(
      retryAsync(fn, {
        label: "test operation",
        maxAttempts: 5,
        delayMs: 10,
      }),
    ).rejects.toThrow("Always fails");

    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("should apply jitter to delay", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValue("success");

    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await retryAsync(fn, {
      label: "test operation",
      maxAttempts: 2,
      delayMs: 10,
      jitterFactor: 0.3,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mathRandomSpy).toHaveBeenCalled();
  });

  it("should succeed on first attempt without retries", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await retryAsync(fn, { label: "test operation" });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should handle async functions that throw", async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error("Async error");
    });

    await expect(
      retryAsync(fn, {
        label: "test operation",
        maxAttempts: 2,
        delayMs: 10,
      }),
    ).rejects.toThrow("Async error");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should preserve non-Error thrown values", async () => {
    const fn = vi.fn().mockRejectedValue("string error");

    const promise = retryAsync(fn, {
      label: "test operation",
      maxAttempts: 1,
    });

    await expect(promise).rejects.toBe("string error");
  });
});
