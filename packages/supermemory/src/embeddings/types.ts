/**
 * Embedding Engine Types
 *
 * Defines interfaces for embedding generation engines.
 */

/**
 * Interface for embedding engines.
 */
export interface EmbeddingEngine {
  /**
   * Generate embeddings for one or more texts.
   */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Get the embedding dimension.
   */
  dimension(): number;

  /**
   * Get engine name for logging.
   */
  name(): string;

  /**
   * Check if the engine is ready.
   */
  isReady(): boolean;

  /**
   * Initialize the engine (load models, etc.).
   */
  initialize(): Promise<void>;
}

/**
 * Configuration for embedding engine creation.
 */
export interface EmbeddingConfig {
  /** Engine type */
  engine: "local" | "openai" | "none";
  /** Model name (optional, engine-specific) */
  model?: string;
  /** API key (for external services) */
  apiKey?: string;
  /** Batch size for processing */
  batchSize?: number;
  /** Cache embeddings to disk */
  cacheEnabled?: boolean;
}

/**
 * Default embedding configuration.
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  engine: "none",
  batchSize: 10,
  cacheEnabled: true,
};
