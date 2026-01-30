function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    label: string;
    maxAttempts?: number;
    delayMs?: number;
    jitterFactor?: number;
  },
): Promise<T> {
  const {
    label,
    maxAttempts = 3,
    delayMs = 1000,
    jitterFactor = 0.3,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(
          `[retryAsync] Attempting to ${label} (attempt ${attempt}/${maxAttempts})...`,
        );
      }
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`Failed to ${label} (attempt ${attempt}):`, error);
      if (attempt < maxAttempts) {
        const actualDelay = delayMs * (1 + jitterFactor * Math.random());
        console.log(`[retryAsync] Retrying in ${actualDelay.toFixed(0)}ms...`);
        await sleep(actualDelay);
      }
    }
  }
  throw lastError;
}
