/**
 * MemoryRouter - Unified interface routing between Zvec cache and Supermemory.
 */

import { v4 as uuidv4 } from "uuid";
import { ZvecBridge } from "./bridge";
import { detectPlatform, getCacheDir } from "./platform";
import type {
  CachedMemory,
  MemoryRouterConfig,
  SyncResult,
  HealthStatus,
  CacheStats,
} from "./types";
import { SupermemoryClient } from "../client";
import type { MemoryItem, FormattedContext } from "../utils/formatter";
import { getProjectInfo, type ProjectInfo } from "../utils/container";
import { formatContextForClaude } from "../utils/formatter";

const DEFAULT_CONFIG: MemoryRouterConfig = {
  mode: "hybrid",
  cacheEnabled: true,
  syncEnabled: true,
  syncIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxCacheSize: 50,
  ttlSeconds: 30 * 24 * 60 * 60, // 30 days
};

/**
 * MemoryRouter provides a unified interface for memory operations,
 * intelligently routing between local Zvec cache and remote Supermemory.
 */
export class MemoryRouter {
  private zvecBridge: ZvecBridge | null = null;
  private supermemory: SupermemoryClient;
  private projectInfo: ProjectInfo;
  private config: MemoryRouterConfig;
  private syncTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private lastRefresh = 0;
  private refreshIntervalMs = 60000; // 1 minute cache freshness

  constructor(workingDir?: string, config: Partial<MemoryRouterConfig> = {}) {
    this.projectInfo = getProjectInfo(workingDir);
    this.supermemory = new SupermemoryClient(workingDir);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the router and cache if available.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.cacheEnabled && this.config.mode !== "remote-only") {
      try {
        const platform = await detectPlatform();

        if (platform.supported && platform.pythonPath) {
          this.zvecBridge = new ZvecBridge({
            pythonPath: platform.pythonPath,
            cacheDir: getCacheDir(),
            dimension: 768,
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
    this.stopBackgroundSync();

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
   * Check if Supermemory is reachable.
   */
  async isOnline(): Promise<boolean> {
    try {
      await this.supermemory.getContext();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get project info.
   */
  getProjectInfo(): ProjectInfo {
    return this.projectInfo;
  }

  // Core Operations

  /**
   * Get context for Claude, using cache when available.
   */
  async getContext(): Promise<FormattedContext> {
    await this.initialize();

    const memories: MemoryItem[] = [];
    let cacheHit = false;

    // Try cache first
    if (this.isCacheAvailable() && this.config.mode !== "remote-only") {
      try {
        const cached = await this.zvecBridge!.getRecent(
          this.projectInfo.containerTag,
          this.config.maxCacheSize,
        );

        if (cached.length > 0) {
          for (const m of cached) {
            memories.push({
              id: m.memory_id || m.id,
              content: m.content,
              metadata: { type: m.memory_type },
            });
          }
          cacheHit = true;
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache read failed:", error);
      }
    }

    // Refresh from Supermemory if needed
    if (!cacheHit || this.shouldRefresh()) {
      if (this.config.mode !== "cache-only") {
        this.refreshFromSupermemory().catch(console.error);
      }
    }

    // If no cache hit and not cache-only mode, fetch from Supermemory
    if (!cacheHit && this.config.mode !== "cache-only") {
      try {
        const context = await this.supermemory.getContext();
        return context;
      } catch (error) {
        console.warn("[MemoryRouter] Remote fetch failed:", error);
      }
    }

    return formatContextForClaude(memories, this.config.maxCacheSize);
  }

  /**
   * Add a memory, writing to both cache and remote.
   */
  async addMemory(
    content: string,
    type: string = "conversation",
  ): Promise<string | null> {
    await this.initialize();

    const localId = uuidv4();
    const timestamp = Date.now();

    // Generate a dummy embedding (in production, use actual embedding model)
    const embedding = this.generateDummyEmbedding();

    // Write to cache (synchronous)
    if (this.isCacheAvailable() && this.config.mode !== "remote-only") {
      try {
        const memory: CachedMemory = {
          id: localId,
          content,
          embedding,
          memory_type: type as CachedMemory["memory_type"],
          project: this.projectInfo.containerTag,
          created_at: timestamp,
          updated_at: timestamp,
          synced_at: undefined,
          source: "local",
        };

        await this.zvecBridge!.insert(this.projectInfo.containerTag, [memory]);
      } catch (error) {
        console.warn("[MemoryRouter] Cache write failed:", error);
      }
    }

    // Write to Supermemory (async, non-blocking)
    if (this.config.mode !== "cache-only") {
      this.syncToSupermemory(localId, content, type).catch(console.error);
    }

    return localId;
  }

  /**
   * Search memories.
   */
  async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
    await this.initialize();

    const results: MemoryItem[] = [];
    const seenIds = new Set<string>();

    // Generate dummy embedding for query
    const embedding = this.generateDummyEmbedding();

    // Search cache
    if (this.isCacheAvailable() && this.config.mode !== "remote-only") {
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
          if (r.memory_id) seenIds.add(r.memory_id);
        }
      } catch (error) {
        console.warn("[MemoryRouter] Cache search failed:", error);
      }
    }

    // Search Supermemory for broader results
    if (this.config.mode !== "cache-only" && results.length < limit) {
      try {
        const remote = await this.supermemory.search(query, limit);

        for (const r of remote) {
          if (!seenIds.has(r.id)) {
            results.push(r);
          }
        }
      } catch (error) {
        console.warn("[MemoryRouter] Remote search failed:", error);
      }
    }

    // Sort by relevance and limit
    return results
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);
  }

  // Cache Management

  /**
   * Warm the cache by loading from Supermemory.
   */
  async warmCache(): Promise<void> {
    if (!this.isCacheAvailable()) {
      return;
    }

    await this.refreshFromSupermemory();
  }

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

  // Sync Operations

  /**
   * Trigger a manual sync.
   */
  async syncNow(): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      errors: [],
      duration: 0,
    };

    if (!this.isCacheAvailable()) {
      result.errors.push("Cache not available");
      result.duration = Date.now() - startTime;
      return result;
    }

    try {
      // Upload unsynced local memories
      const unsynced = await this.zvecBridge!.getUnsynced(
        this.projectInfo.containerTag,
      );

      for (const memory of unsynced) {
        try {
          const remoteId = await this.supermemory.addMemory(
            memory.content,
            memory.memory_type,
          );

          if (remoteId) {
            await this.zvecBridge!.markSynced(
              this.projectInfo.containerTag,
              [memory.id],
              Date.now(),
              remoteId,
            );
            result.uploaded++;
          }
        } catch (error) {
          result.errors.push(`Upload failed: ${memory.id}`);
        }
      }

      // Download new memories from Supermemory
      await this.refreshFromSupermemory();
      result.downloaded = 0; // Would need to track actual downloads

      result.success = result.errors.length === 0;
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Start background sync.
   */
  startBackgroundSync(): void {
    if (!this.config.syncEnabled || this.syncTimer) {
      return;
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncNow();
      } catch (error) {
        console.error("[MemoryRouter] Background sync failed:", error);
      }
    }, this.config.syncIntervalMs);
  }

  /**
   * Stop background sync.
   */
  stopBackgroundSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
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
      supermemoryOnline: await this.isOnline(),
      lastSyncTime: stats.last_sync_time,
      pendingUploads: stats.pending_uploads,
      cacheItemCount: stats.item_count,
    };
  }

  // Private methods

  private shouldRefresh(): boolean {
    return Date.now() - this.lastRefresh > this.refreshIntervalMs;
  }

  private async refreshFromSupermemory(): Promise<void> {
    if (!this.isCacheAvailable()) {
      return;
    }

    try {
      // Fetch context from Supermemory - we don't use the result here
      // because we'd need actual embeddings, but we update the refresh time
      await this.supermemory.getContext();
      this.lastRefresh = Date.now();

      // Store memories in cache
      // Note: We'd need actual embeddings here - this is a simplified version
    } catch (error) {
      console.warn("[MemoryRouter] Refresh failed:", error);
    }
  }

  private async syncToSupermemory(
    localId: string,
    content: string,
    type: string,
  ): Promise<void> {
    try {
      const remoteId = await this.supermemory.addMemory(content, type);

      if (remoteId && this.isCacheAvailable()) {
        await this.zvecBridge!.markSynced(
          this.projectInfo.containerTag,
          [localId],
          Date.now(),
          remoteId,
        );
      }
    } catch (error) {
      console.warn("[MemoryRouter] Sync to Supermemory failed:", error);
    }
  }

  private generateDummyEmbedding(): number[] {
    // In production, use actual embedding model
    // This is a placeholder that creates a random-ish vector
    return Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  }
}
