# Phase 4: Sync Engine Implementation

**Status**: Pending
**Priority**: Medium
**Depends On**: Phase 3 (Memory Router)

---

## Overview

Implement a robust synchronization engine that keeps the local Zvec cache in sync with the remote Supermemory service. Handles bidirectional sync, conflict resolution, retry logic, and provides observability into sync status.

---

## Context Links

- [Main Plan](./plan.md)
- [Phase 3: Memory Router](./phase-03-memory-router.md)
- [Supermemory Client](../../packages/supermemory/src/client.ts)

---

## Key Insights

1. **Eventual consistency** - Local and remote may diverge temporarily
2. **Last-write-wins** - Simple conflict resolution using timestamps
3. **Idempotent operations** - Safe to retry failed syncs
4. **Audit trail** - Log all sync operations for debugging

---

## Requirements

### Functional

- Bidirectional sync (local ↔ remote)
- Automatic retry with exponential backoff
- Conflict detection and resolution
- Sync triggers: session start, session end, periodic, manual
- Sync status persistence across sessions
- Detailed sync logging

### Non-Functional

- Sync latency < 5s for 100 memories
- Zero data loss during network failures
- < 1% sync conflicts in normal usage
- Background sync doesn't block main thread

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Sync Engine                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ SyncScheduler│───▶│ SyncExecutor │───▶│ ConflictResolver │  │
│  │              │    │              │    │                  │  │
│  │ - Triggers   │    │ - Upload     │    │ - Last-write     │  │
│  │ - Intervals  │    │ - Download   │    │ - Merge          │  │
│  │ - Debounce   │    │ - Retry      │    │ - Manual         │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                   │                     │             │
│         ▼                   ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SyncState                             │   │
│  │                                                          │   │
│  │  - lastSyncTime: number                                  │   │
│  │  - pendingUploads: Map<id, Memory>                       │   │
│  │  - pendingDownloads: Map<id, Memory>                     │   │
│  │  - conflicts: ConflictRecord[]                           │   │
│  │  - syncHistory: SyncLogEntry[]                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                   │                     │             │
│         ▼                   ▼                     ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │    Zvec      │    │ Supermemory  │    │   Sync Log       │  │
│  │  (Local)     │    │   (Remote)   │    │   (Disk)         │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Sync Flow

### Full Sync Process

```
┌─────────────────────────────────────────────────────────────┐
│                    Full Sync Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. PREPARE                                                  │
│     ├─ Load sync state from disk                            │
│     ├─ Check network connectivity                           │
│     └─ Acquire sync lock (prevent concurrent syncs)         │
│                                                              │
│  2. UPLOAD (Local → Remote)                                  │
│     ├─ Get unsynced memories from Zvec                      │
│     ├─ For each memory:                                      │
│     │   ├─ Upload to Supermemory                            │
│     │   ├─ On success: mark synced in Zvec                  │
│     │   └─ On failure: queue for retry                      │
│     └─ Update upload count                                   │
│                                                              │
│  3. DOWNLOAD (Remote → Local)                                │
│     ├─ Fetch profile from Supermemory                       │
│     ├─ Compare with local memories                          │
│     ├─ For new/updated memories:                            │
│     │   ├─ Check for conflicts                              │
│     │   ├─ Resolve conflicts (last-write-wins)              │
│     │   └─ Upsert to Zvec                                   │
│     └─ Update download count                                 │
│                                                              │
│  4. FINALIZE                                                 │
│     ├─ Update lastSyncTime                                  │
│     ├─ Persist sync state                                   │
│     ├─ Release sync lock                                    │
│     └─ Emit sync complete event                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Conflict Resolution

```
┌─────────────────────────────────────────────────────────────┐
│                 Conflict Detection                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  A conflict occurs when:                                     │
│    - Same memory_id exists in both local and remote         │
│    - Both have been modified since last sync                │
│    - Content differs                                         │
│                                                              │
│  Resolution Strategy: Last-Write-Wins                        │
│                                                              │
│    IF local.updated_at > remote.updated_at:                 │
│      → Keep local, upload to remote                         │
│    ELSE:                                                     │
│      → Keep remote, update local                            │
│                                                              │
│  Conflict Record:                                            │
│    {                                                         │
│      memoryId: string,                                       │
│      localContent: string,                                   │
│      remoteContent: string,                                  │
│      localTimestamp: number,                                 │
│      remoteTimestamp: number,                                │
│      resolution: 'local' | 'remote',                        │
│      resolvedAt: number                                      │
│    }                                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### 1. SyncState Interface

```typescript
// packages/supermemory/src/cache/sync-state.ts

export interface SyncState {
  lastSyncTime: number;
  lastSyncResult: SyncResult | null;
  pendingUploads: Map<string, PendingUpload>;
  retryQueue: RetryItem[];
  conflicts: ConflictRecord[];
}

export interface PendingUpload {
  localId: string;
  content: string;
  type: string;
  createdAt: number;
  retries: number;
  lastError?: string;
}

export interface RetryItem {
  operation: "upload" | "download";
  memoryId: string;
  nextRetry: number;
  retries: number;
  maxRetries: number;
}

export interface ConflictRecord {
  memoryId: string;
  localContent: string;
  remoteContent: string;
  localTimestamp: number;
  remoteTimestamp: number;
  resolution: "local" | "remote" | "pending";
  resolvedAt?: number;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
  duration: number;
}
```

### 2. SyncScheduler Class

```typescript
// packages/supermemory/src/cache/sync-scheduler.ts

export interface SyncSchedulerConfig {
  autoSyncEnabled: boolean;
  syncIntervalMs: number; // Default: 5 minutes
  syncOnSessionStart: boolean; // Default: true
  syncOnSessionEnd: boolean; // Default: true (blocking)
  debounceMs: number; // Default: 1000
}

export class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private executor: SyncExecutor;
  private config: SyncSchedulerConfig;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(executor: SyncExecutor, config: SyncSchedulerConfig) {
    this.executor = executor;
    this.config = config;
  }

  start(): void {
    if (!this.config.autoSyncEnabled || this.timer) return;

    this.timer = setInterval(async () => {
      await this.triggerSync("periodic");
    }, this.config.syncIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async triggerSync(trigger: SyncTrigger): Promise<SyncResult> {
    return this.executor.execute(trigger);
  }

  // Debounced sync for rapid changes
  debouncedSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.triggerSync("debounced").catch(console.error);
    }, this.config.debounceMs);
  }
}

export type SyncTrigger =
  | "session_start"
  | "session_end"
  | "periodic"
  | "manual"
  | "debounced";
```

### 3. SyncExecutor Class

```typescript
// packages/supermemory/src/cache/sync-executor.ts

export class SyncExecutor {
  private zvecBridge: ZvecBridge;
  private supermemory: SupermemoryClient;
  private state: SyncState;
  private lock: AsyncLock;
  private project: string;

  constructor(
    zvecBridge: ZvecBridge,
    supermemory: SupermemoryClient,
    project: string,
  ) {
    this.zvecBridge = zvecBridge;
    this.supermemory = supermemory;
    this.project = project;
    this.lock = new AsyncLock();
    this.state = this.loadState();
  }

  async execute(trigger: SyncTrigger): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      errors: [],
      duration: 0,
    };

    // Acquire lock
    const release = await this.lock.acquire();

    try {
      // 1. Upload local changes
      const uploadResult = await this.uploadLocal();
      result.uploaded = uploadResult.count;
      result.errors.push(...uploadResult.errors);

      // 2. Download remote changes
      const downloadResult = await this.downloadRemote();
      result.downloaded = downloadResult.count;
      result.conflicts = downloadResult.conflicts;
      result.errors.push(...downloadResult.errors);

      // 3. Process retry queue
      await this.processRetryQueue();

      // 4. Update state
      this.state.lastSyncTime = Date.now();
      this.state.lastSyncResult = result;
      this.saveState();

      result.success = result.errors.length === 0;
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
    } finally {
      result.duration = Date.now() - startTime;
      release();
    }

    this.logSync(trigger, result);
    return result;
  }

  private async uploadLocal(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    const unsynced = await this.zvecBridge.call<CachedMemory[]>(
      "get_unsynced",
      { project: this.project },
    );

    for (const memory of unsynced) {
      try {
        const remoteId = await this.supermemory.addMemory(
          memory.content,
          memory.memory_type,
        );

        if (remoteId) {
          await this.zvecBridge.call("mark_synced", {
            project: this.project,
            ids: [memory.id],
            sync_time: Date.now(),
            memory_id: remoteId,
          });
          count++;
        }
      } catch (error) {
        errors.push(`Upload failed for ${memory.id}: ${error}`);
        this.queueRetry("upload", memory.id);
      }
    }

    return { count, errors };
  }

  private async downloadRemote(): Promise<{
    count: number;
    conflicts: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let count = 0;
    let conflicts = 0;

    try {
      const context = await this.supermemory.getContext();

      // Get local memories for conflict detection
      const localMemories = await this.zvecBridge.call<CachedMemory[]>(
        "get_all",
        { project: this.project },
      );

      const localById = new Map(
        localMemories.filter((m) => m.memory_id).map((m) => [m.memory_id!, m]),
      );

      // Process remote memories
      for (const remote of context.memories || []) {
        const local = localById.get(remote.id);

        if (local) {
          // Check for conflict
          if (this.hasConflict(local, remote)) {
            const resolution = this.resolveConflict(local, remote);
            conflicts++;

            if (resolution === "remote") {
              await this.updateLocal(remote);
              count++;
            }
          }
        } else {
          // New remote memory, download it
          await this.insertLocal(remote);
          count++;
        }
      }
    } catch (error) {
      errors.push(`Download failed: ${error}`);
    }

    return { count, conflicts, errors };
  }

  private hasConflict(local: CachedMemory, remote: RemoteMemory): boolean {
    // Conflict if both modified since last sync and content differs
    return (
      local.updated_at > local.synced_at! && local.content !== remote.content
    );
  }

  private resolveConflict(
    local: CachedMemory,
    remote: RemoteMemory,
  ): "local" | "remote" {
    // Last-write-wins
    const resolution = local.updated_at > remote.updatedAt ? "local" : "remote";

    // Record conflict
    this.state.conflicts.push({
      memoryId: remote.id,
      localContent: local.content,
      remoteContent: remote.content,
      localTimestamp: local.updated_at,
      remoteTimestamp: remote.updatedAt,
      resolution,
      resolvedAt: Date.now(),
    });

    return resolution;
  }
}
```

### 4. Retry Logic with Exponential Backoff

```typescript
private queueRetry(operation: 'upload' | 'download', memoryId: string): void {
  const existing = this.state.retryQueue.find(
    r => r.memoryId === memoryId && r.operation === operation
  );

  if (existing) {
    existing.retries++;
    existing.nextRetry = this.calculateNextRetry(existing.retries);
  } else {
    this.state.retryQueue.push({
      operation,
      memoryId,
      nextRetry: Date.now() + 5000, // 5 second initial delay
      retries: 1,
      maxRetries: 5,
    });
  }
}

private calculateNextRetry(retries: number): number {
  // Exponential backoff: 5s, 10s, 20s, 40s, 80s
  const delay = 5000 * Math.pow(2, retries - 1);
  const maxDelay = 5 * 60 * 1000; // 5 minutes max
  return Date.now() + Math.min(delay, maxDelay);
}

private async processRetryQueue(): Promise<void> {
  const now = Date.now();
  const ready = this.state.retryQueue.filter(r => r.nextRetry <= now);

  for (const item of ready) {
    if (item.retries >= item.maxRetries) {
      // Give up after max retries
      this.state.retryQueue = this.state.retryQueue.filter(
        r => r !== item
      );
      continue;
    }

    try {
      if (item.operation === 'upload') {
        // Re-attempt upload
        // ...
      }
      // Remove from queue on success
      this.state.retryQueue = this.state.retryQueue.filter(r => r !== item);
    } catch {
      // Will retry on next sync
    }
  }
}
```

### 5. Sync State Persistence

```typescript
private loadState(): SyncState {
  const statePath = path.join(
    getCacheDir(),
    this.project,
    'sync-state.json'
  );

  try {
    if (fs.existsSync(statePath)) {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      return {
        ...data,
        pendingUploads: new Map(Object.entries(data.pendingUploads || {})),
      };
    }
  } catch (error) {
    console.warn('[SyncEngine] Failed to load state:', error);
  }

  return {
    lastSyncTime: 0,
    lastSyncResult: null,
    pendingUploads: new Map(),
    retryQueue: [],
    conflicts: [],
  };
}

private saveState(): void {
  const statePath = path.join(
    getCacheDir(),
    this.project,
    'sync-state.json'
  );

  const data = {
    ...this.state,
    pendingUploads: Object.fromEntries(this.state.pendingUploads),
  };

  fs.writeFileSync(statePath, JSON.stringify(data, null, 2));
}
```

---

## Related Code Files

### Files to Create

- `packages/supermemory/src/cache/sync-state.ts`
- `packages/supermemory/src/cache/sync-scheduler.ts`
- `packages/supermemory/src/cache/sync-executor.ts`
- `packages/supermemory/src/cache/conflict-resolver.ts`
- `packages/supermemory/src/__tests__/sync-engine.test.ts`

### Files to Modify

- `packages/supermemory/src/cache/router.ts` (integrate sync)

---

## Todo List

- [ ] Define SyncState and related interfaces
- [ ] Implement SyncScheduler with trigger types
- [ ] Implement SyncExecutor.execute() main flow
- [ ] Implement uploadLocal() with error handling
- [ ] Implement downloadRemote() with conflict detection
- [ ] Implement conflict resolution (last-write-wins)
- [ ] Implement retry queue with exponential backoff
- [ ] Implement processRetryQueue()
- [ ] Implement state persistence (loadState/saveState)
- [ ] Add sync logging for debugging
- [ ] Integrate with MemoryRouter
- [ ] Write unit tests for conflict resolution
- [ ] Write unit tests for retry logic
- [ ] Write integration tests for full sync
- [ ] Test network failure scenarios
- [ ] Test concurrent sync prevention

---

## Success Criteria

1. Full sync completes in < 5s for 100 memories
2. Conflicts detected and resolved correctly
3. Retry queue processes failed operations
4. State persists across sessions
5. No data loss during network failures
6. All tests pass

---

## Security Considerations

- Validate sync state before loading
- Sanitize conflict records (no sensitive data in logs)
- Rate limit sync triggers to prevent abuse
- Secure state file permissions

---

## Next Steps

After this phase:
→ Phase 5: Integration with hooks, commands, and final testing
