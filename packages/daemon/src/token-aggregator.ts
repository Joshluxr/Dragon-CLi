/**
 * Token Aggregator
 *
 * Batches token usage updates to reduce WebSocket traffic and database writes.
 * Flushes accumulated tokens at configurable intervals or on explicit flush.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface TokenBucket extends TokenUsage {
  lastUpdate: number;
  updateCount: number;
}

export interface TokenAggregatorConfig {
  /** Interval in ms between automatic flushes (default: 1000) */
  flushIntervalMs: number;
  /** Minimum tokens to accumulate before flushing (default: 0, always flush on interval) */
  minTokensToFlush: number;
  /** Maximum time in ms to hold tokens before forcing flush (default: 5000) */
  maxHoldTimeMs: number;
}

const DEFAULT_CONFIG: TokenAggregatorConfig = {
  flushIntervalMs: 1000,
  minTokensToFlush: 0,
  maxHoldTimeMs: 5000,
};

export type FlushCallback = (
  threadId: string,
  usage: TokenUsage,
) => Promise<void>;

export class TokenAggregator {
  private buckets: Map<string, TokenBucket> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private pendingFlushes: Map<string, Promise<void>> = new Map();

  constructor(
    private readonly onFlush: FlushCallback,
    private readonly config: TokenAggregatorConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Add token usage for a thread
   */
  add(threadId: string, usage: Partial<TokenUsage>): void {
    if (this.isShuttingDown) {
      console.warn(
        "[TokenAggregator] Cannot add tokens during shutdown, ignoring",
      );
      return;
    }

    let bucket = this.buckets.get(threadId);
    if (!bucket) {
      bucket = this.createEmptyBucket();
      this.buckets.set(threadId, bucket);
    }

    bucket.inputTokens += usage.inputTokens ?? 0;
    bucket.outputTokens += usage.outputTokens ?? 0;
    bucket.cacheCreationTokens += usage.cacheCreationTokens ?? 0;
    bucket.cacheReadTokens += usage.cacheReadTokens ?? 0;
    bucket.lastUpdate = Date.now();
    bucket.updateCount++;
  }

  /**
   * Get current accumulated tokens for a thread (without flushing)
   */
  peek(threadId: string): TokenUsage | null {
    const bucket = this.buckets.get(threadId);
    if (!bucket) return null;

    return {
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      cacheCreationTokens: bucket.cacheCreationTokens,
      cacheReadTokens: bucket.cacheReadTokens,
    };
  }

  /**
   * Flush tokens for a specific thread immediately
   */
  async flush(threadId: string): Promise<void> {
    const bucket = this.buckets.get(threadId);
    if (!bucket || this.isEmpty(bucket)) {
      return;
    }

    // Check if there's already a pending flush for this thread
    const pending = this.pendingFlushes.get(threadId);
    if (pending) {
      await pending;
      return;
    }

    // Extract and clear the bucket
    const usage: TokenUsage = {
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      cacheCreationTokens: bucket.cacheCreationTokens,
      cacheReadTokens: bucket.cacheReadTokens,
    };
    this.buckets.delete(threadId);

    // Execute flush with tracking
    const flushPromise = this.executeFlush(threadId, usage);
    this.pendingFlushes.set(threadId, flushPromise);

    try {
      await flushPromise;
    } finally {
      this.pendingFlushes.delete(threadId);
    }
  }

  /**
   * Flush all accumulated tokens
   */
  async flushAll(): Promise<void> {
    const entries = Array.from(this.buckets.entries());
    this.buckets.clear();

    const flushPromises = entries
      .filter(([, bucket]) => !this.isEmpty(bucket))
      .map(([threadId, bucket]) =>
        this.executeFlush(threadId, {
          inputTokens: bucket.inputTokens,
          outputTokens: bucket.outputTokens,
          cacheCreationTokens: bucket.cacheCreationTokens,
          cacheReadTokens: bucket.cacheReadTokens,
        }),
      );

    await Promise.allSettled(flushPromises);
  }

  /**
   * Start automatic flushing
   */
  start(): void {
    if (this.flushInterval) {
      return;
    }

    this.flushInterval = setInterval(() => {
      this.flushStale().catch((error) => {
        console.error("[TokenAggregator] Error during auto-flush:", error);
      });
    }, this.config.flushIntervalMs);

    // Ensure the interval doesn't prevent process exit
    this.flushInterval.unref?.();
  }

  /**
   * Stop automatic flushing and flush remaining tokens
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Wait for any pending flushes
    await Promise.allSettled(this.pendingFlushes.values());

    // Final flush
    await this.flushAll();
  }

  /**
   * Get statistics about the aggregator
   */
  getStats(): {
    activeThreads: number;
    totalPendingTokens: TokenUsage;
    pendingFlushes: number;
  } {
    let totalPending: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    for (const bucket of this.buckets.values()) {
      totalPending.inputTokens += bucket.inputTokens;
      totalPending.outputTokens += bucket.outputTokens;
      totalPending.cacheCreationTokens += bucket.cacheCreationTokens;
      totalPending.cacheReadTokens += bucket.cacheReadTokens;
    }

    return {
      activeThreads: this.buckets.size,
      totalPendingTokens: totalPending,
      pendingFlushes: this.pendingFlushes.size,
    };
  }

  private async flushStale(): Promise<void> {
    const now = Date.now();
    const toFlush: string[] = [];

    for (const [threadId, bucket] of this.buckets.entries()) {
      const age = now - bucket.lastUpdate;
      const totalTokens =
        bucket.inputTokens +
        bucket.outputTokens +
        bucket.cacheCreationTokens +
        bucket.cacheReadTokens;

      // Flush if:
      // 1. Bucket has aged past maxHoldTime
      // 2. OR bucket has accumulated enough tokens
      if (
        age >= this.config.maxHoldTimeMs ||
        totalTokens >= this.config.minTokensToFlush
      ) {
        toFlush.push(threadId);
      }
    }

    await Promise.allSettled(toFlush.map((threadId) => this.flush(threadId)));
  }

  private async executeFlush(
    threadId: string,
    usage: TokenUsage,
  ): Promise<void> {
    try {
      await this.onFlush(threadId, usage);
    } catch (error) {
      console.error(
        `[TokenAggregator] Failed to flush tokens for thread ${threadId}:`,
        error,
      );
      // On failure, add tokens back to bucket for retry
      this.add(threadId, usage);
    }
  }

  private createEmptyBucket(): TokenBucket {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      lastUpdate: Date.now(),
      updateCount: 0,
    };
  }

  private isEmpty(bucket: TokenBucket): boolean {
    return (
      bucket.inputTokens === 0 &&
      bucket.outputTokens === 0 &&
      bucket.cacheCreationTokens === 0 &&
      bucket.cacheReadTokens === 0
    );
  }
}

/**
 * Create a token aggregator that sends updates to a callback URL
 */
export function createHttpTokenAggregator(
  callbackUrl: string,
  authToken: string,
  config?: Partial<TokenAggregatorConfig>,
): TokenAggregator {
  return new TokenAggregator(
    async (threadId, usage) => {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          threadId,
          usage,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    },
    { ...DEFAULT_CONFIG, ...config },
  );
}
