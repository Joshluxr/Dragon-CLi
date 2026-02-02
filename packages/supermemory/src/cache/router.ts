/**
 * MemoryRouter - Local-only memory storage with Zvec vector cache.
 *
 * This router operates entirely locally without any external API dependencies.
 * All memories are stored in the local Zvec cache.
 */

import { v4 as uuidv4 } from "uuid";
import { ZvecBridge } from "./bridge";
import { detectPlatform, getCacheDir } from "./platform";
import type {
  CachedMemory,
  MemoryRouterConfig,
  HealthStatus,
  CacheStats,
  PruneResult,
} from "./types";
import type { MemoryItem, FormattedContext } from "../utils/formatter";
import { getProjectInfo, type ProjectInfo } from "../utils/container";
import { formatContextForClaude } from "../utils/formatter";
import type { EmbeddingEngine } from "../embeddings/types";
import { getDefaultEmbeddingEngine } from "../embeddings/factory";
import { SemanticChunker, type ChunkConfig } from "../chunking";

const DEFAULT_CONFIG: MemoryRouterConfig = {
  mode: "cache-only",
  cacheEnabled: true,
  syncEnabled: false,
  syncIntervalMs: 0,
  maxCacheSize: 1000,
  ttlSeconds: 90 * 24 * 60 * 60, // 90 days
};

/**
 * MemoryRouter provides a unified interface for local memory operations.
 * All data is stored locally in Zvec cache - no external API calls.
 */
export class MemoryRouter {
  private zvecBridge: ZvecBridge | null = null;
  private projectInfo: ProjectInfo;
  private config: MemoryRouterConfig;
  private initialized = false;
  private embeddingEngine: EmbeddingEngine | null = null;
  private chunker: SemanticChunker;
  private chunkConfig: ChunkConfig;

  constructor(
    workingDir?: string,
    config: Partial<MemoryRouterConfig> = {},
    chunkConfig?: Partial<ChunkConfig>,
  ) {
    this.projectInfo = getProjectInfo(workingDir);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chunkConfig = {
      targetSize: 512,
      maxSize: 1024,
      minSize: 50,
      overlap: 50,
      ...chunkConfig,
    };
    this.chunker = new SemanticChunker(this.chunkConfig);
  }

  /**
   * Initialize the router and cache if available.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize embedding engine
    try {
      this.embeddingEngine = getDefaultEmbeddingEngine();
      await this.embeddingEngine.initialize();
      console.log(
        `[MemoryRouter] Embedding engine initialized: ${this.embeddingEngine.name()}`,
      );
    } catch (error) {
      console.warn(
        "[MemoryRouter] Embedding engine initialization failed:",
        error,
      );
      this.embeddingEngine = null;
    }

    if (this.config.cacheEnabled) {
      try {
        const platform = await detectPlatform();

        // Use embedding dimension from engine, fallback to 768
        const dimension = this.embeddingEngine?.dimension() || 768;

        if (platform.supported && platform.pythonPath) {
          this.zvecBridge = new ZvecBridge({
            pythonPath: platform.pythonPath,
            cacheDir: getCacheDir(),
            dimension,
            timeout: 30000,
          });

          await this.zvecBridge.start();
          await this.zvecBridge.openCollection(this.projectInfo.containerTag);
          console.log("[MemoryRouter] Cache initialized successfully");
        } else {
          console.warn(
            `[MemoryRouter] Cache not available: ${platform.reason}`,
          );
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache initialization failed:", error);
        this.zvecBridge = null;
      }
    }

    this.initialized = true;
  }

  /**
   * Shutdown the router and cleanup resources.
   */
  async shutdown(): Promise<void> {
    if (this.zvecBridge) {
      await this.zvecBridge.stop();
      this.zvecBridge = null;
    }

    this.initialized = false;
  }

  /**
   * Check if cache is available.
   */
  isCacheAvailable(): boolean {
    return this.zvecBridge !== null && this.zvecBridge.isRunning();
  }

  /**
   * Get project info.
   */
  getProjectInfo(): ProjectInfo {
    return this.projectInfo;
  }

  // Core Operations

  /**
   * Get context for Claude from local cache.
   */
  async getContext(): Promise<FormattedContext> {
    await this.initialize();

    const memories: MemoryItem[] = [];

    if (this.isCacheAvailable()) {
      try {
        const cached = await this.zvecBridge!.getRecent(
          this.projectInfo.containerTag,
          this.config.maxCacheSize,
        );

        for (const m of cached) {
          memories.push({
            id: m.memory_id || m.id,
            content: m.content,
            metadata: { type: m.memory_type },
          });
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache read failed:", error);
      }
    }

    return formatContextForClaude(memories, this.config.maxCacheSize);
  }

  /**
   * Add a memory to local cache.
   * Long content is automatically chunked for better retrieval.
   */
  async addMemory(
    content: string,
    type: string = "conversation",
  ): Promise<string | null> {
    await this.initialize();

    const timestamp = Date.now();

    // Check if content needs chunking
    if (this.chunker.needsChunking(content)) {
      const result = this.chunker.chunk(content);
      const chunkIds: string[] = [];

      console.log(
        `[MemoryRouter] Chunking long memory into ${result.chunks.length} parts`,
      );

      for (const chunk of result.chunks) {
        const chunkId = uuidv4();
        const embedding = await this.generateEmbedding(chunk.content);

        if (this.isCacheAvailable()) {
          try {
            const memory: CachedMemory = {
              id: chunkId,
              content: chunk.content,
              embedding,
              memory_type: type as CachedMemory["memory_type"],
              project: this.projectInfo.containerTag,
              created_at: timestamp,
              updated_at: timestamp,
              synced_at: timestamp,
              source: "local",
              metadata: {
                chunkIndex: chunk.index,
                chunkTitle: chunk.title,
                chunkType: chunk.type,
                originalLength: result.originalLength,
              } as Record<string, unknown>,
            };

            await this.zvecBridge!.insert(this.projectInfo.containerTag, [
              memory,
            ]);
            chunkIds.push(chunkId);
          } catch (error) {
            console.warn("[MemoryRouter] Chunk write failed:", error);
          }
        }
      }

      return chunkIds[0] || null;
    }

    // Standard single-memory add
    const localId = uuidv4();
    const embedding = await this.generateEmbedding(content);

    if (this.isCacheAvailable()) {
      try {
        const memory: CachedMemory = {
          id: localId,
          content,
          embedding,
          memory_type: type as CachedMemory["memory_type"],
          project: this.projectInfo.containerTag,
          created_at: timestamp,
          updated_at: timestamp,
          synced_at: timestamp,
          source: "local",
        };

        await this.zvecBridge!.insert(this.projectInfo.containerTag, [memory]);
      } catch (error) {
        console.warn("[MemoryRouter] Cache write failed:", error);
      }
    }

    return localId;
  }

  /**
   * Get all memories for tree building and MCP tools.
   */
  async getAllMemories(): Promise<MemoryItem[]> {
    await this.initialize();

    const memories: MemoryItem[] = [];

    if (this.isCacheAvailable()) {
      try {
        const cached = await this.zvecBridge!.getAll(
          this.projectInfo.containerTag,
        );

        for (const m of cached) {
          memories.push({
            id: m.memory_id || m.id,
            content: m.content,
            metadata: {
              type: m.memory_type,
              timestamp: new Date(m.created_at).toISOString(),
              sessionId: (m.metadata as Record<string, unknown>)?.sessionId as
                | string
                | undefined,
              tags: (m.metadata as Record<string, unknown>)?.tags as
                | string[]
                | undefined,
            },
          });
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache getAllMemories failed:", error);
      }
    }

    return memories;
  }

  /**
   * Get a specific memory by ID.
   */
  async getMemoryById(id: string): Promise<MemoryItem | null> {
    await this.initialize();

    if (this.isCacheAvailable()) {
      try {
        const memories = await this.zvecBridge!.fetch(
          this.projectInfo.containerTag,
          [id],
        );

        if (memories.length > 0) {
          const m = memories[0]!;
          return {
            id: m.memory_id || m.id,
            content: m.content,
            metadata: {
              type: m.memory_type,
              timestamp: new Date(m.created_at).toISOString(),
              sessionId: (m.metadata as Record<string, unknown>)?.sessionId as
                | string
                | undefined,
              tags: (m.metadata as Record<string, unknown>)?.tags as
                | string[]
                | undefined,
            },
          };
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache getMemoryById failed:", error);
      }
    }

    return null;
  }

  /**
   * Get multiple memories by IDs.
   */
  async getMemoriesByIds(ids: string[]): Promise<MemoryItem[]> {
    await this.initialize();

    const memories: MemoryItem[] = [];

    if (this.isCacheAvailable()) {
      try {
        const cached = await this.zvecBridge!.fetch(
          this.projectInfo.containerTag,
          ids,
        );

        for (const m of cached) {
          memories.push({
            id: m.memory_id || m.id,
            content: m.content,
            metadata: {
              type: m.memory_type,
              timestamp: new Date(m.created_at).toISOString(),
              sessionId: (m.metadata as Record<string, unknown>)?.sessionId as
                | string
                | undefined,
              tags: (m.metadata as Record<string, unknown>)?.tags as
                | string[]
                | undefined,
            },
          });
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache getMemoriesByIds failed:", error);
      }
    }

    return memories;
  }

  /**
   * Get timeline of memories around a specific point.
   */
  async getTimeline(
    anchor: string,
    before: number = 5,
    after: number = 5,
  ): Promise<{ memories: MemoryItem[]; anchorIndex: number }> {
    await this.initialize();

    const all = await this.getAllMemories();

    // Sort by timestamp
    const sorted = all.sort((a, b) => {
      const aTime = a.metadata?.timestamp
        ? new Date(a.metadata.timestamp).getTime()
        : 0;
      const bTime = b.metadata?.timestamp
        ? new Date(b.metadata.timestamp).getTime()
        : 0;
      return aTime - bTime;
    });

    // Find anchor position
    let anchorIndex = -1;

    // Check if anchor is an ID
    anchorIndex = sorted.findIndex((m) => m.id === anchor);

    // Check if anchor is a timestamp
    if (anchorIndex === -1) {
      const anchorTime = new Date(anchor).getTime();
      if (!isNaN(anchorTime)) {
        // Find closest timestamp
        let minDiff = Infinity;
        for (let i = 0; i < sorted.length; i++) {
          const m = sorted[i];
          if (!m) continue;
          const mTime = m.metadata?.timestamp
            ? new Date(m.metadata.timestamp).getTime()
            : 0;
          const diff = Math.abs(mTime - anchorTime);
          if (diff < minDiff) {
            minDiff = diff;
            anchorIndex = i;
          }
        }
      }
    }

    if (anchorIndex === -1 && sorted.length > 0) {
      // Default to most recent
      anchorIndex = sorted.length - 1;
    }

    // Extract timeline window
    const startIndex = Math.max(0, anchorIndex - before);
    const endIndex = Math.min(sorted.length, anchorIndex + after + 1);
    const memories = sorted.slice(startIndex, endIndex);

    return {
      memories,
      anchorIndex: anchorIndex - startIndex,
    };
  }

  /**
   * Add a memory with extended metadata for MCP tools.
   */
  async addMemoryWithMetadata(
    content: string,
    type: string = "conversation",
    metadata?: {
      sessionId?: string;
      tags?: string[];
    },
  ): Promise<string | null> {
    await this.initialize();

    const localId = uuidv4();
    const timestamp = Date.now();

    // Generate embedding using real engine
    const embedding = await this.generateEmbedding(content);

    if (this.isCacheAvailable()) {
      try {
        const memory: CachedMemory = {
          id: localId,
          content,
          embedding,
          memory_type: type as CachedMemory["memory_type"],
          project: this.projectInfo.containerTag,
          created_at: timestamp,
          updated_at: timestamp,
          synced_at: timestamp,
          source: "local",
          metadata: metadata as Record<string, unknown>,
        };

        await this.zvecBridge!.insert(this.projectInfo.containerTag, [memory]);
      } catch (error) {
        console.warn("[MemoryRouter] Cache write failed:", error);
      }
    }

    return localId;
  }

  /**
   * Keyword-based search using text matching.
   */
  async keywordSearch(
    query: string,
    limit: number = 10,
    options?: { type?: string; tags?: string[] },
  ): Promise<MemoryItem[]> {
    await this.initialize();

    const all = await this.getAllMemories();
    const queryTokens = this.tokenizeQuery(query);
    const results: Array<MemoryItem & { keywordScore: number }> = [];

    for (const memory of all) {
      // Apply type filter
      if (options?.type && memory.metadata?.type !== options.type) {
        continue;
      }

      // Apply tag filter
      if (options?.tags && options.tags.length > 0) {
        const memoryTags = memory.metadata?.tags || [];
        if (!options.tags.some((t) => memoryTags.includes(t))) {
          continue;
        }
      }

      // Calculate keyword match score
      const score = this.calculateKeywordScore(memory.content, queryTokens);
      if (score > 0) {
        results.push({ ...memory, keywordScore: score });
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, limit)
      .map(({ keywordScore, ...rest }) => ({
        ...rest,
        similarity: keywordScore,
      }));
  }

  /**
   * Hybrid search combining semantic and keyword search.
   */
  async hybridSearch(
    query: string,
    limit: number = 10,
    options?: { type?: string; tags?: string[]; semanticWeight?: number },
  ): Promise<MemoryItem[]> {
    await this.initialize();

    const semanticWeight = options?.semanticWeight ?? 0.7;
    const keywordWeight = 1 - semanticWeight;

    // Run both searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
      this.search(query, limit * 2),
      this.keywordSearch(query, limit * 2, options),
    ]);

    // Combine and score results
    const combined = new Map<
      string,
      { memory: MemoryItem; combinedScore: number }
    >();

    for (const result of semanticResults) {
      const existing = combined.get(result.id);
      const semanticScore = (result.similarity || 0) * semanticWeight;

      if (existing) {
        existing.combinedScore += semanticScore;
      } else {
        combined.set(result.id, {
          memory: result,
          combinedScore: semanticScore,
        });
      }
    }

    for (const result of keywordResults) {
      const existing = combined.get(result.id);
      const keywordScore = (result.similarity || 0) * keywordWeight;

      if (existing) {
        existing.combinedScore += keywordScore;
      } else {
        combined.set(result.id, {
          memory: result,
          combinedScore: keywordScore,
        });
      }
    }

    // Sort by combined score and return
    return Array.from(combined.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit)
      .map(({ memory, combinedScore }) => ({
        ...memory,
        similarity: combinedScore,
      }));
  }

  /**
   * Tokenize query for keyword matching.
   */
  private tokenizeQuery(query: string): string[] {
    // Simple tokenization: lowercase, split on non-alphanumeric, remove short words
    return query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2);
  }

  /**
   * Calculate keyword match score using TF-IDF-like scoring.
   */
  private calculateKeywordScore(
    content: string,
    queryTokens: string[],
  ): number {
    if (queryTokens.length === 0) return 0;

    const contentLower = content.toLowerCase();
    const contentTokens = contentLower
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2);
    const contentTokenSet = new Set(contentTokens);

    let matchCount = 0;
    let positionBonus = 0;

    for (const token of queryTokens) {
      if (contentTokenSet.has(token)) {
        matchCount++;

        // Bonus for early occurrence (title/start importance)
        const position = contentLower.indexOf(token);
        if (position !== -1) {
          // Higher bonus for earlier positions
          positionBonus += Math.max(0, 1 - position / 500);
        }
      }
    }

    if (matchCount === 0) return 0;

    // Base score: percentage of query tokens matched
    const coverage = matchCount / queryTokens.length;

    // Normalize position bonus
    const normalizedPositionBonus = positionBonus / queryTokens.length;

    // Combined score (0-1 range)
    return Math.min(1, coverage * 0.7 + normalizedPositionBonus * 0.3);
  }

  /**
   * Search memories using vector similarity.
   */
  async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
    await this.initialize();

    const results: MemoryItem[] = [];

    // Generate real embedding for query
    const embedding = await this.generateEmbedding(query);

    if (this.isCacheAvailable()) {
      try {
        const cached = await this.zvecBridge!.search(
          this.projectInfo.containerTag,
          { embedding, limit, min_score: 0.5 },
        );

        for (const r of cached) {
          results.push({
            id: r.memory_id || r.id,
            content: r.content,
            metadata: { type: r.memory_type },
            similarity: r.score,
          });
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache search failed:", error);
      }
    }

    // Sort by relevance and limit
    return results
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);
  }

  // Cache Management

  /**
   * Clear the local cache.
   */
  async clearCache(): Promise<void> {
    if (!this.isCacheAvailable()) {
      return;
    }

    await this.zvecBridge!.destroyCollection(this.projectInfo.containerTag);
    await this.zvecBridge!.openCollection(this.projectInfo.containerTag);
  }

  /**
   * Get cache statistics.
   */
  async getCacheStats(): Promise<CacheStats> {
    if (!this.isCacheAvailable()) {
      return {
        item_count: 0,
        size_bytes: 0,
        last_sync_time: 0,
        pending_uploads: 0,
        index_completeness: 0,
      };
    }

    const stats = await this.zvecBridge!.getStats(
      this.projectInfo.containerTag,
    );
    return (
      stats || {
        item_count: 0,
        size_bytes: 0,
        last_sync_time: 0,
        pending_uploads: 0,
        index_completeness: 0,
      }
    );
  }

  // Pruning Operations

  /**
   * Prune old memories based on TTL and cache size limits.
   */
  async prune(): Promise<PruneResult> {
    await this.initialize();

    const result: PruneResult = {
      deleted: 0,
      deletedByAge: 0,
      deletedBySize: 0,
      errors: [],
    };

    if (!this.isCacheAvailable()) {
      return result;
    }

    try {
      const all = await this.getAllMemories();
      const now = Date.now();
      const ttlMs = this.config.ttlSeconds * 1000;

      // Find memories to delete by age
      const expiredIds: string[] = [];
      for (const memory of all) {
        if (memory.metadata?.timestamp) {
          const age = now - new Date(memory.metadata.timestamp).getTime();
          if (age > ttlMs) {
            expiredIds.push(memory.id);
          }
        }
      }

      // Delete expired memories
      if (expiredIds.length > 0) {
        const deleted = await this.zvecBridge!.delete(
          this.projectInfo.containerTag,
          expiredIds,
        );
        if (deleted) {
          result.deletedByAge = expiredIds.length;
          result.deleted += expiredIds.length;
        }
      }

      // Check cache size limit
      const stats = await this.getCacheStats();
      if (stats.item_count > this.config.maxCacheSize) {
        const excess = stats.item_count - this.config.maxCacheSize;
        const sorted = all
          .filter((m) => !expiredIds.includes(m.id))
          .sort((a, b) => {
            const aTime = a.metadata?.timestamp
              ? new Date(a.metadata.timestamp).getTime()
              : 0;
            const bTime = b.metadata?.timestamp
              ? new Date(b.metadata.timestamp).getTime()
              : 0;
            return aTime - bTime; // Oldest first
          });

        const toDelete = sorted.slice(0, excess).map((m) => m.id);

        if (toDelete.length > 0) {
          const deleted = await this.zvecBridge!.delete(
            this.projectInfo.containerTag,
            toDelete,
          );
          if (deleted) {
            result.deletedBySize = toDelete.length;
            result.deleted += toDelete.length;
          }
        }
      }

      console.log(
        `[MemoryRouter] Pruned ${result.deleted} memories (${result.deletedByAge} by age, ${result.deletedBySize} by size)`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(msg);
      console.warn("[MemoryRouter] Prune failed:", msg);
    }

    return result;
  }

  /**
   * Auto-prune when cache exceeds limits.
   * Call this periodically or after adding memories.
   */
  async autoPrune(): Promise<void> {
    try {
      const stats = await this.getCacheStats();

      // Only prune if significantly over limit (10% buffer)
      const threshold = Math.floor(this.config.maxCacheSize * 1.1);
      if (stats.item_count > threshold) {
        await this.prune();
      }
    } catch (error) {
      console.warn("[MemoryRouter] Auto-prune check failed:", error);
    }
  }

  // Health & Status

  /**
   * Get health status.
   */
  async getHealth(): Promise<HealthStatus> {
    const stats = await this.getCacheStats();

    return {
      cacheAvailable: this.isCacheAvailable(),
      supermemoryOnline: false, // Always false - local only
      lastSyncTime: stats.last_sync_time,
      pendingUploads: 0, // No sync needed
      cacheItemCount: stats.item_count,
    };
  }

  /**
   * Generate embedding for text content.
   * Uses real embedding engine if available, falls back to random vectors.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.embeddingEngine && this.embeddingEngine.isReady()) {
      try {
        const embeddings = await this.embeddingEngine.embed([text]);
        if (embeddings.length > 0 && embeddings[0]) {
          return embeddings[0];
        }
      } catch (error) {
        console.warn("[MemoryRouter] Embedding generation failed:", error);
      }
    }

    // Fallback to random embedding
    const dimension = this.embeddingEngine?.dimension() || 768;
    return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
  }

  /**
   * Get the current embedding engine name.
   */
  getEmbeddingEngineName(): string {
    return this.embeddingEngine?.name() || "none";
  }
}
