/**
 * Circuit breakers for sandbox providers
 *
 * Provides protection against cascade failures when sandbox providers
 * are experiencing issues.
 */

import {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerConfig,
  type CircuitState,
} from "@dragon/utils/circuit-breaker";
import type { SandboxProvider } from "@dragon/types/sandbox";

// Provider-specific circuit breaker configurations
const CIRCUIT_CONFIGS: Record<SandboxProvider, CircuitBreakerConfig> = {
  e2b: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute before attempting reset
    monitoringWindow: 120000, // 2 minute window for counting failures
  },
  daytona: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000, // 30 seconds before attempting reset
    monitoringWindow: 60000, // 1 minute window
  },
  docker: {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 10000, // 10 seconds - docker is local, recovers faster
    monitoringWindow: 30000,
  },
  mock: {
    failureThreshold: 10,
    successThreshold: 1,
    timeout: 1000,
    monitoringWindow: 10000,
  },
};

// Fallback provider mapping
const FALLBACK_PROVIDERS: Partial<Record<SandboxProvider, SandboxProvider>> = {
  e2b: "daytona",
  daytona: "e2b",
};

// Circuit breaker instances per provider
const circuitBreakers: Map<SandboxProvider, CircuitBreaker> = new Map();

/**
 * Get or create a circuit breaker for a sandbox provider
 */
export function getProviderCircuitBreaker(
  provider: SandboxProvider,
): CircuitBreaker {
  let breaker = circuitBreakers.get(provider);
  if (!breaker) {
    const config = CIRCUIT_CONFIGS[provider] ?? CIRCUIT_CONFIGS.e2b;
    breaker = new CircuitBreaker(`sandbox-${provider}`, config);

    // Log state changes
    breaker.onStateChange((state, prevState) => {
      console.warn(
        `[SandboxCircuitBreaker] Provider ${provider}: ${prevState} -> ${state}`,
      );
      if (state === "open") {
        console.warn(
          `[SandboxCircuitBreaker] Provider ${provider} is now unavailable. ` +
            `Fallback: ${FALLBACK_PROVIDERS[provider] ?? "none"}`,
        );
      }
    });

    circuitBreakers.set(provider, breaker);
  }
  return breaker;
}

/**
 * Execute a sandbox operation with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  provider: SandboxProvider,
  operation: () => Promise<T>,
  options?: {
    /** Whether to try fallback provider if circuit is open */
    useFallback?: boolean;
    /** Custom fallback function */
    fallback?: () => Promise<T>;
  },
): Promise<T> {
  const breaker = getProviderCircuitBreaker(provider);

  try {
    return await breaker.execute(operation);
  } catch (error) {
    if (error instanceof CircuitOpenError && options?.useFallback !== false) {
      const fallbackProvider = FALLBACK_PROVIDERS[provider];

      if (options?.fallback) {
        console.log(
          `[SandboxCircuitBreaker] Using custom fallback for ${provider}`,
        );
        return options.fallback();
      }

      if (fallbackProvider) {
        const fallbackBreaker = getProviderCircuitBreaker(fallbackProvider);
        if (fallbackBreaker.isAllowed()) {
          console.log(
            `[SandboxCircuitBreaker] Falling back from ${provider} to ${fallbackProvider}`,
          );
          // Re-throw to let caller handle fallback with correct provider
          throw new CircuitOpenWithFallbackError(
            provider,
            fallbackProvider,
            error.retryAfterMs,
          );
        }
      }
    }
    throw error;
  }
}

/**
 * Get the health status of all sandbox providers
 */
export function getSandboxProvidersHealth(): Record<
  SandboxProvider,
  {
    state: CircuitState;
    retryAfterMs: number;
    stats: {
      totalRequests: number;
      totalFailures: number;
      totalSuccesses: number;
    };
  }
> {
  const providers: SandboxProvider[] = ["e2b", "daytona", "docker", "mock"];
  const health: Record<string, unknown> = {};

  for (const provider of providers) {
    const breaker = circuitBreakers.get(provider);
    if (breaker) {
      const stats = breaker.getStats();
      health[provider] = {
        state: stats.state,
        retryAfterMs: breaker.getRemainingTimeout(),
        stats: {
          totalRequests: stats.totalRequests,
          totalFailures: stats.totalFailures,
          totalSuccesses: stats.totalSuccesses,
        },
      };
    } else {
      health[provider] = {
        state: "closed" as CircuitState,
        retryAfterMs: 0,
        stats: { totalRequests: 0, totalFailures: 0, totalSuccesses: 0 },
      };
    }
  }

  return health as Record<
    SandboxProvider,
    {
      state: CircuitState;
      retryAfterMs: number;
      stats: {
        totalRequests: number;
        totalFailures: number;
        totalSuccesses: number;
      };
    }
  >;
}

/**
 * Check if any sandbox provider is available
 */
export function isAnySandboxProviderAvailable(): boolean {
  const providers: SandboxProvider[] = ["e2b", "daytona"];
  return providers.some((provider) => {
    const breaker = circuitBreakers.get(provider);
    return !breaker || breaker.isAllowed();
  });
}

/**
 * Get the best available provider, considering circuit breaker state
 */
export function getBestAvailableProvider(
  preferred: SandboxProvider,
): SandboxProvider | null {
  const breaker = circuitBreakers.get(preferred);
  if (!breaker || breaker.isAllowed()) {
    return preferred;
  }

  // Try fallback
  const fallback = FALLBACK_PROVIDERS[preferred];
  if (fallback) {
    const fallbackBreaker = circuitBreakers.get(fallback);
    if (!fallbackBreaker || fallbackBreaker.isAllowed()) {
      return fallback;
    }
  }

  return null;
}

/**
 * Reset all circuit breakers (useful for testing or admin operations)
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}

/**
 * Error thrown when circuit is open but a fallback provider is available
 */
export class CircuitOpenWithFallbackError extends Error {
  constructor(
    public readonly originalProvider: SandboxProvider,
    public readonly fallbackProvider: SandboxProvider,
    public readonly retryAfterMs: number,
  ) {
    super(
      `Circuit breaker for ${originalProvider} is open. Fallback available: ${fallbackProvider}`,
    );
    this.name = "CircuitOpenWithFallbackError";
  }
}

// Re-export CircuitOpenError for convenience
export { CircuitOpenError };
