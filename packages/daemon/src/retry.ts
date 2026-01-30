interface RetryState {
  attempt: number;
  lastAttemptTime: number;
}

export interface RetryConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  maxAttempts: 10,
  backoffMultiplier: 1.3,
  jitterFactor: 0.3,
};

export class RetryBackoff {
  private retryState: RetryState = {
    attempt: 0,
    lastAttemptTime: 0,
  };

  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * Calculate the next delay with exponential backoff and jitter
   */
  private getRetryDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ attempt)
    const exponentialDelay = Math.min(
      this.config.baseDelayMs *
        Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelayMs,
    );

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    return Math.floor(exponentialDelay + jitter);
  }

  get retryAttempt(): number {
    return this.retryState.attempt;
  }

  reset(): void {
    this.retryState = {
      attempt: 0,
      lastAttemptTime: 0,
    };
  }

  increment(): void {
    this.retryState.attempt++;
    this.retryState.lastAttemptTime = Date.now();
  }

  retryIn(): number | null {
    if (this.retryState.attempt === 0) {
      return null;
    }
    if (this.retryState.attempt >= this.config.maxAttempts) {
      return null;
    }
    return this.getRetryDelay(this.retryState.attempt);
  }
}
