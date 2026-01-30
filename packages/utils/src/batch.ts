/**
 * Batch processing utilities for handling large collections of items
 * with rate limiting and error isolation.
 */

/**
 * Default batch size for processing
 */
export const DEFAULT_BATCH_SIZE = 10;

/**
 * Default delay between batches in milliseconds
 */
export const DEFAULT_BATCH_DELAY_MS = 1000;

/**
 * Process items in batches with a delay between each batch.
 * Uses Promise.allSettled to ensure all items are processed even if some fail.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param options - Configuration options
 * @returns Array of settled results for each item
 *
 * @example
 * ```typescript
 * const userIds = ['user1', 'user2', 'user3', ...];
 * const results = await processBatchWithDelay(
 *   userIds,
 *   async (userId) => {
 *     await processUser(userId);
 *   },
 *   { batchSize: 10, delayMs: 1000 }
 * );
 * ```
 */
export async function processBatchWithDelay<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  options: {
    batchSize?: number;
    delayMs?: number;
  } = {},
): Promise<PromiseSettledResult<void>[]> {
  const { batchSize = DEFAULT_BATCH_SIZE, delayMs = DEFAULT_BATCH_DELAY_MS } =
    options;

  const allResults: PromiseSettledResult<void>[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    allResults.push(...batchResults);

    // Add delay between batches (but not after the last batch)
    if (i + batchSize < items.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return allResults;
}

/**
 * Sleep for a specified duration
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Count the number of fulfilled and rejected results from Promise.allSettled
 *
 * @param results - Array of settled results
 * @returns Object with fulfilled and rejected counts
 */
export function countSettledResults(results: PromiseSettledResult<unknown>[]): {
  fulfilled: number;
  rejected: number;
} {
  return results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled") {
        acc.fulfilled++;
      } else {
        acc.rejected++;
      }
      return acc;
    },
    { fulfilled: 0, rejected: 0 },
  );
}
