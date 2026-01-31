/**
 * Token Estimation Utilities
 *
 * Provides token counting and budget management for memory retrieval.
 * Uses cl100k_base approximation (Claude's tokenizer base).
 */

/**
 * Estimates tokens using cl100k_base approximation.
 * More accurate than simple character count.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const charCount = text.length;

  // Code tends to have more tokens per character due to symbols
  const isLikelyCode = /[{}\[\]();=<>]/.test(text) && /\n/.test(text);
  const hasUrls = /https?:\/\//.test(text);

  // Adjust multiplier based on content type
  let multiplier = 0.25; // Default for English prose

  if (isLikelyCode) {
    multiplier = 0.35; // Code has more tokens per char
  } else if (hasUrls) {
    multiplier = 0.4; // URLs are heavily tokenized
  }

  return Math.ceil(charCount * multiplier);
}

/**
 * Formats token count for display.
 */
export function formatTokenEstimate(tokens: number): string {
  if (tokens < 100) return `~${tokens} tokens`;
  if (tokens < 1000) return `~${Math.round(tokens / 10) * 10} tokens`;
  return `~${(tokens / 1000).toFixed(1)}k tokens`;
}

/**
 * Truncates text to approximately fit within token limit.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (!text) return "";

  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Estimate character limit
  const ratio = maxTokens / currentTokens;
  const targetLength = Math.floor(text.length * ratio * 0.9); // 10% buffer

  return text.substring(0, targetLength) + "...";
}

/**
 * Token budget tracker for memory retrieval.
 */
export class TokenBudget {
  private used = 0;
  private allocations: Map<string, number> = new Map();

  constructor(private readonly limit: number = 8000) {}

  /**
   * Check if additional tokens can fit within budget.
   */
  canFit(tokens: number): boolean {
    return this.used + tokens <= this.limit;
  }

  /**
   * Consume tokens from budget with optional label.
   */
  consume(tokens: number, label?: string): boolean {
    if (!this.canFit(tokens)) return false;

    this.used += tokens;
    if (label) {
      const current = this.allocations.get(label) || 0;
      this.allocations.set(label, current + tokens);
    }
    return true;
  }

  /**
   * Get remaining token capacity.
   */
  remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  /**
   * Get current usage.
   */
  getUsed(): number {
    return this.used;
  }

  /**
   * Get limit.
   */
  getLimit(): number {
    return this.limit;
  }

  /**
   * Get usage summary.
   */
  summary(): string {
    const percentage = Math.round((this.used / this.limit) * 100);
    return `${this.used}/${this.limit} tokens (${percentage}% used, ${this.remaining()} remaining)`;
  }

  /**
   * Get breakdown by label.
   */
  breakdown(): Record<string, number> {
    return Object.fromEntries(this.allocations);
  }

  /**
   * Reset budget.
   */
  reset(): void {
    this.used = 0;
    this.allocations.clear();
  }
}

/**
 * Calculate optimal batch size for memory retrieval.
 * Ensures we don't exceed token limits when fetching full content.
 */
export function calculateOptimalBatchSize(
  itemTokenEstimates: number[],
  maxTokens: number,
): number {
  if (itemTokenEstimates.length === 0) return 0;

  let totalTokens = 0;
  let count = 0;

  for (const tokens of itemTokenEstimates) {
    if (totalTokens + tokens > maxTokens) break;
    totalTokens += tokens;
    count++;
  }

  return count;
}
