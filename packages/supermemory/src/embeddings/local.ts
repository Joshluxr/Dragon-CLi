/**
 * Local Embedding Engine
 *
 * Uses Transformers.js to generate embeddings locally without external API calls.
 * Falls back to dummy embeddings if the model fails to load.
 *
 * Note: @xenova/transformers is an optional peer dependency.
 * If not installed, this engine will fall back to DummyEmbeddingEngine.
 */

import type { EmbeddingEngine } from "./types.js";
import { DummyEmbeddingEngine } from "./dummy.js";

// Lazy-loaded pipeline and env from transformers.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transformersPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transformersEnv: any = null;

/**
 * Local embedding engine using Transformers.js.
 *
 * Requires @xenova/transformers to be installed as an optional dependency.
 * Falls back to DummyEmbeddingEngine if not available.
 */
export class LocalEmbeddingEngine implements EmbeddingEngine {
  private model: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private embeddingPipeline: any = null;
  private dim: number;
  private ready = false;
  private fallback: DummyEmbeddingEngine;
  private useFallback = false;

  constructor(
    model: string = "Xenova/all-MiniLM-L6-v2",
    dimension: number = 384,
  ) {
    this.model = model;
    this.dim = dimension;
    this.fallback = new DummyEmbeddingEngine(dimension);
  }

  async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      // Dynamic import to avoid loading transformers.js if not installed
      // This is an optional peer dependency
      const transformers = await import("@xenova/transformers" as string);
      transformersPipeline = transformers.pipeline;
      transformersEnv = transformers.env;

      // Disable local models and browser cache in Node.js
      if (transformersEnv) {
        transformersEnv.allowLocalModels = false;
        transformersEnv.useBrowserCache = false;
      }

      console.log(`[LocalEmbeddingEngine] Loading model: ${this.model}...`);
      this.embeddingPipeline = await transformersPipeline(
        "feature-extraction",
        this.model,
        {
          quantized: true, // Use quantized model for faster loading
        },
      );
      this.ready = true;
      console.log(`[LocalEmbeddingEngine] Model loaded successfully`);
    } catch (error) {
      console.warn(
        `[LocalEmbeddingEngine] Failed to load model, using fallback:`,
        error instanceof Error ? error.message : String(error),
      );
      this.useFallback = true;
      this.ready = true;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.ready) {
      await this.initialize();
    }

    if (this.useFallback) {
      return this.fallback.embed(texts);
    }

    try {
      const results: number[][] = [];

      for (const text of texts) {
        const output = await this.embeddingPipeline(text, {
          pooling: "mean",
          normalize: true,
        });

        // Extract the embedding array
        const embedding = Array.from(output.data) as number[];
        results.push(embedding);
      }

      return results;
    } catch (error) {
      console.warn(
        `[LocalEmbeddingEngine] Embed failed, using fallback:`,
        error instanceof Error ? error.message : String(error),
      );
      return this.fallback.embed(texts);
    }
  }

  dimension(): number {
    return this.dim;
  }

  name(): string {
    return this.useFallback
      ? `local:${this.model}(fallback)`
      : `local:${this.model}`;
  }

  isReady(): boolean {
    return this.ready;
  }
}
