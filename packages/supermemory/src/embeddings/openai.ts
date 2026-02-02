/**
 * OpenAI Embedding Engine
 *
 * Uses OpenAI's embedding API for high-quality embeddings.
 * Requires OPENAI_API_KEY environment variable.
 */

import type { EmbeddingEngine } from "./types.js";
import { DummyEmbeddingEngine } from "./dummy.js";

/**
 * OpenAI embedding engine using text-embedding-3-small.
 */
export class OpenAIEmbeddingEngine implements EmbeddingEngine {
  private apiKey: string;
  private model: string;
  private dim: number;
  private ready = false;
  private fallback: DummyEmbeddingEngine;

  constructor(
    apiKey: string,
    model: string = "text-embedding-3-small",
    dimension: number = 1536,
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.dim = dimension;
    this.fallback = new DummyEmbeddingEngine(dimension);
  }

  async initialize(): Promise<void> {
    if (this.ready) return;

    if (!this.apiKey) {
      console.warn("[OpenAIEmbeddingEngine] No API key provided");
    }

    this.ready = true;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.ready) {
      await this.initialize();
    }

    if (!this.apiKey) {
      console.warn("[OpenAIEmbeddingEngine] No API key, using fallback");
      return this.fallback.embed(texts);
    }

    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      // Sort by index to ensure correct order
      const sorted = data.data.sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index,
      );

      return sorted.map((item: { embedding: number[] }) => item.embedding);
    } catch (error) {
      console.warn(
        `[OpenAIEmbeddingEngine] Embed failed, using fallback:`,
        error instanceof Error ? error.message : String(error),
      );
      return this.fallback.embed(texts);
    }
  }

  dimension(): number {
    return this.dim;
  }

  name(): string {
    return `openai:${this.model}`;
  }

  isReady(): boolean {
    return this.ready;
  }
}
