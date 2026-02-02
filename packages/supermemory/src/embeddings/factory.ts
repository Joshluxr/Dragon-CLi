/**
 * Embedding Engine Factory
 *
 * Creates embedding engines based on configuration.
 */

import type { EmbeddingEngine, EmbeddingConfig } from "./types.js";
import { DummyEmbeddingEngine } from "./dummy.js";
import { LocalEmbeddingEngine } from "./local.js";
import { OpenAIEmbeddingEngine } from "./openai.js";

/**
 * Creates an embedding engine based on configuration.
 */
export function createEmbeddingEngine(
  config: EmbeddingConfig,
): EmbeddingEngine {
  switch (config.engine) {
    case "local":
      return new LocalEmbeddingEngine(config.model, 384);

    case "openai":
      if (!config.apiKey) {
        console.warn(
          "[EmbeddingFactory] OpenAI engine requested but no API key provided, using dummy",
        );
        return new DummyEmbeddingEngine();
      }
      return new OpenAIEmbeddingEngine(config.apiKey, config.model);

    case "none":
    default:
      return new DummyEmbeddingEngine();
  }
}

/**
 * Gets the default embedding engine based on environment.
 */
export function getDefaultEmbeddingEngine(): EmbeddingEngine {
  // Check for OpenAI key first (highest quality)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return createEmbeddingEngine({ engine: "openai", apiKey: openaiKey });
  }

  // Try local engine (no API needed)
  try {
    return createEmbeddingEngine({ engine: "local" });
  } catch {
    // Fall back to dummy
    return createEmbeddingEngine({ engine: "none" });
  }
}
