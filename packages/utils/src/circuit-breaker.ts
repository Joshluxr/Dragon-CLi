/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascade failures by tracking failures and temporarily
 * stopping calls to failing services.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 */

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Number of successes in half-open state before closing */
  successThreshold: number;
  /** Time in ms to wait before transitioning from open to half-open */
  timeout: number;
  /** Time window in ms for counting failures */
  monitoringWindow: number;
}

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  monitoringWindow: 60000,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures: number[] = [];
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private stateChangeListeners: ((
    state: CircuitState,
    prevState: CircuitState,
  ) => void)[] = [];

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if we should transition from open to half-open
    if (this.state === "open") {
      if (this.shouldAttemptReset()) {
        this.transitionTo("half-open");
      } else {
        throw new CircuitOpenError(this.name, this.getRemainingTimeout());
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute with a fallback function if circuit is open
   */
  async executeWithFallback<T>(
    fn: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.execute(fn);
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return fallback();
      }
      throw error;
    }
  }

  /**
   * Check if the circuit allows requests
   */
  isAllowed(): boolean {
    if (this.state === "closed" || this.state === "half-open") {
      return true;
    }
    return this.shouldAttemptReset();
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics about the circuit breaker
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.getRecentFailureCount(),
      successCount: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Get remaining timeout before circuit can attempt reset
   */
  getRemainingTimeout(): number {
    if (this.state !== "open" || this.lastFailureTime === null) {
      return 0;
    }
    return Math.max(
      0,
      this.config.timeout - (Date.now() - this.lastFailureTime),
    );
  }

  /**
   * Register a listener for state changes
   */
  onStateChange(
    listener: (state: CircuitState, prevState: CircuitState) => void,
  ): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  /**
   * Manually reset the circuit breaker to closed state
   */
  reset(): void {
    this.failures = [];
    this.successes = 0;
    this.transitionTo("closed");
  }

  /**
   * Manually trip the circuit breaker to open state
   */
  trip(): void {
    this.transitionTo("open");
  }

  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === null) {
      return true;
    }
    return Date.now() - this.lastFailureTime >= this.config.timeout;
  }

  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo("closed");
      }
    } else if (this.state === "closed") {
      // Clear old failures outside monitoring window
      this.pruneOldFailures();
    }
  }

  private onFailure(): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failures.push(this.lastFailureTime);
    this.successes = 0;

    if (this.state === "half-open") {
      // Any failure in half-open state trips the circuit
      this.transitionTo("open");
    } else if (this.state === "closed") {
      // Check if we've exceeded the failure threshold
      const recentFailures = this.getRecentFailureCount();
      if (recentFailures >= this.config.failureThreshold) {
        this.transitionTo("open");
      }
    }
  }

  private getRecentFailureCount(): number {
    const cutoff = Date.now() - this.config.monitoringWindow;
    return this.failures.filter((t) => t > cutoff).length;
  }

  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.config.monitoringWindow;
    this.failures = this.failures.filter((t) => t > cutoff);
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) {
      return;
    }

    const prevState = this.state;
    this.state = newState;

    if (newState === "closed") {
      this.failures = [];
      this.successes = 0;
    } else if (newState === "half-open") {
      this.successes = 0;
    }

    console.log(
      `[CircuitBreaker:${this.name}] State transition: ${prevState} -> ${newState}`,
    );

    // Notify listeners
    for (const listener of this.stateChangeListeners) {
      try {
        listener(newState, prevState);
      } catch (error) {
        console.error(
          `[CircuitBreaker:${this.name}] Error in state change listener:`,
          error,
        );
      }
    }
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfterMs: number,
  ) {
    super(
      `Circuit breaker "${circuitName}" is open. Retry after ${Math.ceil(retryAfterMs / 1000)}s`,
    );
    this.name = "CircuitOpenError";
  }
}

/**
 * Registry to manage multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker by name
   */
  getOrCreate(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Global registry singleton
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
