/**
 * Dummy Embedding Engine
 *
 * Generates deterministic pseudo-embeddings based on content hash.
 * Used as fallback when no real embedding engine is available.
 */

import type { EmbeddingEngine } from "./types.js";

/**
 * Dummy embedding engine that generates deterministic pseudo-embeddings.
 * Not suitable for actual similarity search, but maintains consistent IDs.
 */
export class DummyEmbeddingEngine implements EmbeddingEngine {
  private dim: number;
  private ready = true;

  constructor(dimension: number = 384) {
    this.dim = dimension;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generatePseudoEmbedding(text));
  }

  dimension(): number {
    return this.dim;
  }

  name(): string {
    return "dummy";
  }

  isReady(): boolean {
    return this.ready;
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  /**
   * Generates a deterministic pseudo-embedding based on text hash.
   * The same text will always produce the same embedding.
   */
  private generatePseudoEmbedding(text: string): number[] {
    const hash = this.simpleHash(text);
    const embedding: number[] = [];

    // Use hash to seed pseudo-random generation
    let seed = hash;
    for (let i = 0; i < this.dim; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      embedding.push((seed / 0x7fffffff) * 2 - 1); // Range [-1, 1]
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    return embedding.map((val) => val / magnitude);
  }

  /**
   * Simple string hash function.
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
