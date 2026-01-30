# Phase 3: Memory Router Implementation

**Status**: Pending
**Priority**: High
**Depends On**: Phase 1 (Infrastructure), Phase 2 (Core Cache)

---

## Overview

Implement the MemoryRouter class that provides a unified interface for memory operations, intelligently routing between the local Zvec cache and the remote Supermemory service based on availability, latency, and sync status.

---

## Context Links

- [Main Plan](./plan.md)
- [Phase 2: Core Cache](./phase-02-core-cache.md)
- [Supermemory Client](../../packages/supermemory/src/client.ts)

---

## Key Insights

1. **Read-through cache** - Check Zvec first, fall back to Supermemory
2. **Write-through** - Write to both, Zvec synchronous, Supermemory async
3. **Graceful degradation** - Works with either backend unavailable
4. **Transparent API** - Hooks don't need to know about caching

---

## Requirements

### Functional

- Unified API matching current SupermemoryClient interface
- Automatic routing based on availability
- Background sync without blocking operations
- Configurable cache behavior (cache-first, cache-only, remote-only)
- Health status reporting

### Non-Functional

- < 10ms latency for cached reads
- Transparent fallback (no user intervention)
- < 1% cache miss rate for recent memories
- Zero data loss during network outages

---

## Architecture

```typescript
interface MemoryRouterConfig {
  mode: "hybrid" | "cache-only" | "remote-only";
  cacheEnabled: boolean;
  syncEnabled: boolean;
  syncIntervalMs: number;
  maxCacheSize: number;
  ttlSeconds: number;
}

class MemoryRouter {
  private zvecBridge: ZvecBridge | null;
  private supermemory: SupermemoryClient;
  private config: MemoryRouterConfig;
  private syncTimer: NodeJS.Timeout | null;

  // Core Operations (matches SupermemoryClient API)
  async getContext(): Promise<FormattedContext>;
  async addMemory(content: string, type: string): Promise<string | null>;
  async search(query: string, limit?: number): Promise<MemoryItem[]>;

  // Cache Management
  async warmCache(): Promise<void>;
  async clearCache(): Promise<void>;
  async getCacheStats(): Promise<CacheStats>;

  // Sync Operations
  async syncNow(): Promise<SyncResult>;
  startBackgroundSync(): void;
  stopBackgroundSync(): void;

  // Health & Status
  async getHealth(): Promise<HealthStatus>;
  isOnline(): boolean;
  isCacheAvailable(): boolean;
}
```

---

## Routing Logic

### getContext() - Read Path

```
┌─────────────────────────────────────────────────────────────┐
│                     getContext()                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Check cache availability                                 │
│     └─ No → Skip to step 3                                  │
│                                                              │
│  2. Query Zvec cache                                        │
│     ├─ Cache hit (fresh) → Return immediately               │
│     └─ Cache miss/stale → Continue to step 3                │
│                                                              │
│  3. Query Supermemory (if available)                        │
│     ├─ Online → Fetch profile                               │
│     │   └─ Update Zvec cache (background)                   │
│     └─ Offline → Use cached data (even if stale)            │
│                                                              │
│  4. Merge and return formatted context                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### addMemory() - Write Path

```
┌─────────────────────────────────────────────────────────────┐
│                     addMemory()                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Generate embedding for content                           │
│     └─ Use local model or Supermemory API                   │
│                                                              │
│  2. Write to Zvec cache (synchronous)                       │
│     ├─ Success → Memory available locally                   │
│     └─ Failure → Log, continue to remote                    │
│                                                              │
│  3. Write to Supermemory (async, non-blocking)              │
│     ├─ Success → Mark memory as synced                      │
│     └─ Failure → Queue for retry                            │
│                                                              │
│  4. Return local ID immediately                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### search() - Search Path

```
┌─────────────────────────────────────────────────────────────┐
│                     search()                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Generate embedding for query                             │
│                                                              │
│  2. Search Zvec cache                                        │
│     └─ Returns local results (fast)                         │
│                                                              │
│  3. Optionally search Supermemory (if online)               │
│     └─ For broader/older results                            │
│                                                              │
│  4. Merge results                                            │
│     ├─ Deduplicate by memory_id                             │
│     └─ Sort by relevance score                              │
│                                                              │
│  5. Return merged results                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### 1. MemoryRouter Class Structure

```typescript
// packages/supermemory/src/cache/router.ts

export class MemoryRouter {
  private zvecBridge: ZvecBridge | null = null;
  private supermemory: SupermemoryClient;
  private projectInfo: ProjectInfo;
  private config: MemoryRouterConfig;
  private syncTimer: NodeJS.Timeout | null = null;
  private pendingSync: Map<string, CachedMemory> = new Map();

  constructor(
    projectInfo: ProjectInfo,
    config: Partial<MemoryRouterConfig> = {},
  ) {
    this.projectInfo = projectInfo;
    this.supermemory = new SupermemoryClient(projectInfo.workingDir);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.config.cacheEnabled) {
      try {
        this.zvecBridge = new ZvecBridge({
          pythonPath: await findPython(),
          scriptPath: BRIDGE_SCRIPT_PATH,
          cacheDir: getCacheDir(),
          timeout: 30000,
        });
        await this.zvecBridge.start();
        await this.zvecBridge.call("open_collection", {
          project: this.projectInfo.containerTag,
        });
      } catch (error) {
        console.warn("[MemoryRouter] Cache unavailable:", error);
        this.zvecBridge = null;
      }
    }
  }
}
```

### 2. getContext Implementation

```typescript
async getContext(): Promise<FormattedContext> {
  const startTime = Date.now();
  let cacheHit = false;
  let memories: MemoryItem[] = [];

  // Try cache first
  if (this.isCacheAvailable()) {
    try {
      const cached = await this.zvecBridge!.call<CachedMemory[]>(
        'get_recent',
        { project: this.projectInfo.containerTag, limit: 50 }
      );

      if (cached.length > 0) {
        memories = cached.map(this.toMemoryItem);
        cacheHit = true;
      }
    } catch (error) {
      console.warn('[MemoryRouter] Cache read failed:', error);
    }
  }

  // Fetch from Supermemory (background or blocking)
  if (!cacheHit || this.shouldRefresh()) {
    this.refreshFromSupermemory().catch(console.error);
  }

  // If no cache hit and online, wait for Supermemory
  if (!cacheHit && this.isOnline()) {
    try {
      const context = await this.supermemory.getContext();
      return context;
    } catch (error) {
      console.warn('[MemoryRouter] Remote fetch failed:', error);
    }
  }

  return formatContextForClaude(memories, this.config.maxCacheSize);
}
```

### 3. addMemory Implementation

```typescript
async addMemory(content: string, type: string = 'conversation'): Promise<string | null> {
  const localId = generateUUID();
  const timestamp = Date.now();

  // Generate embedding
  const embedding = await this.generateEmbedding(content);

  // Write to cache (synchronous)
  if (this.isCacheAvailable()) {
    try {
      await this.zvecBridge!.call('insert', {
        project: this.projectInfo.containerTag,
        memories: [{
          id: localId,
          content,
          embedding,
          memory_type: type,
          project: this.projectInfo.containerTag,
          created_at: timestamp,
          updated_at: timestamp,
          synced_at: 0,
          source: 'local',
        }]
      });
    } catch (error) {
      console.warn('[MemoryRouter] Cache write failed:', error);
    }
  }

  // Write to Supermemory (async)
  this.syncToSupermemory(localId, content, type).catch(console.error);

  return localId;
}

private async syncToSupermemory(
  localId: string,
  content: string,
  type: string
): Promise<void> {
  try {
    const remoteId = await this.supermemory.addMemory(content, type);

    if (remoteId && this.isCacheAvailable()) {
      await this.zvecBridge!.call('mark_synced', {
        project: this.projectInfo.containerTag,
        ids: [localId],
        sync_time: Date.now(),
        memory_id: remoteId,
      });
    }
  } catch (error) {
    // Queue for retry
    this.pendingSync.set(localId, { content, type, retries: 0 });
  }
}
```

### 4. search Implementation

```typescript
async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
  const embedding = await this.generateEmbedding(query);
  const results: MemoryItem[] = [];
  const seenIds = new Set<string>();

  // Search cache
  if (this.isCacheAvailable()) {
    try {
      const cached = await this.zvecBridge!.call<SearchResult[]>('search', {
        project: this.projectInfo.containerTag,
        query: { embedding, limit, min_score: 0.5 }
      });

      for (const r of cached) {
        results.push(this.toMemoryItem(r));
        if (r.memory_id) seenIds.add(r.memory_id);
      }
    } catch (error) {
      console.warn('[MemoryRouter] Cache search failed:', error);
    }
  }

  // Search Supermemory for broader results
  if (this.isOnline() && results.length < limit) {
    try {
      const remote = await this.supermemory.search(query, limit);

      for (const r of remote) {
        if (!seenIds.has(r.id)) {
          results.push(r);
        }
      }
    } catch (error) {
      console.warn('[MemoryRouter] Remote search failed:', error);
    }
  }

  // Sort by relevance and limit
  return results
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit);
}
```

### 5. Background Sync

```typescript
startBackgroundSync(): void {
  if (!this.config.syncEnabled || this.syncTimer) return;

  this.syncTimer = setInterval(async () => {
    await this.syncNow();
  }, this.config.syncIntervalMs);
}

async syncNow(): Promise<SyncResult> {
  const result: SyncResult = {
    uploaded: 0,
    downloaded: 0,
    conflicts: 0,
    errors: [],
  };

  if (!this.isCacheAvailable() || !this.isOnline()) {
    return result;
  }

  try {
    // Push unsynced local memories
    const unsynced = await this.zvecBridge!.call<CachedMemory[]>(
      'get_unsynced',
      { project: this.projectInfo.containerTag }
    );

    for (const memory of unsynced) {
      try {
        const remoteId = await this.supermemory.addMemory(
          memory.content,
          memory.memory_type
        );
        if (remoteId) {
          await this.zvecBridge!.call('mark_synced', {
            project: this.projectInfo.containerTag,
            ids: [memory.id],
            sync_time: Date.now(),
            memory_id: remoteId,
          });
          result.uploaded++;
        }
      } catch (error) {
        result.errors.push(`Upload failed: ${memory.id}`);
      }
    }

    // Pull new memories from Supermemory
    const context = await this.supermemory.getContext();
    // ... cache new memories

  } catch (error) {
    result.errors.push(`Sync failed: ${error}`);
  }

  return result;
}
```

---

## Related Code Files

### Files to Create

- `packages/supermemory/src/cache/router.ts`
- `packages/supermemory/src/cache/config.ts`
- `packages/supermemory/src/__tests__/router.test.ts`

### Files to Modify

- `packages/supermemory/src/index.ts` (export MemoryRouter)
- `packages/supermemory/src/client.ts` (add embedding generation)

---

## Todo List

- [ ] Create MemoryRouterConfig interface
- [ ] Implement MemoryRouter constructor and initialize()
- [ ] Implement getContext() with cache-first logic
- [ ] Implement addMemory() with dual-write
- [ ] Implement search() with result merging
- [ ] Implement warmCache() for preloading
- [ ] Implement clearCache() for manual clear
- [ ] Implement getCacheStats() for monitoring
- [ ] Implement syncNow() for manual sync
- [ ] Implement startBackgroundSync() / stopBackgroundSync()
- [ ] Implement getHealth() for status reporting
- [ ] Add embedding generation (or use Supermemory's)
- [ ] Write unit tests with mocked backends
- [ ] Write integration tests with real Zvec
- [ ] Test offline mode behavior
- [ ] Test sync conflict resolution

---

## Success Criteria

1. getContext() returns in < 10ms when cached
2. addMemory() returns immediately (non-blocking)
3. search() merges results correctly
4. Offline mode works with cached data
5. Sync uploads all pending memories
6. All tests pass with 90%+ coverage

---

## Security Considerations

- Validate all data from cache before use
- Sanitize content before embedding generation
- Rate limit sync operations
- Audit log for sync conflicts

---

## Next Steps

After this phase:
→ Phase 4: Implement the Sync Engine with conflict resolution
