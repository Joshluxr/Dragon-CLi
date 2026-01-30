# Phase 5: Integration & Testing

**Status**: Pending
**Priority**: High
**Depends On**: Phases 1-4

---

## Overview

Integrate the Zvec local cache with the existing Supermemory hooks, commands, and skills. Update all touch points to use the new MemoryRouter, add configuration options, implement comprehensive testing, and ensure seamless user experience.

---

## Context Links

- [Main Plan](./plan.md)
- [Existing Hooks](../../packages/supermemory/src/hooks/)
- [Existing Commands](../../packages/supermemory/src/commands/)
- [Plugin Config](../../packages/supermemory/plugin/)

---

## Key Insights

1. **Drop-in replacement** - MemoryRouter has same API as SupermemoryClient
2. **Backward compatible** - Existing users see no change (cache is optional optimization)
3. **Progressive enhancement** - Cache enables new capabilities (offline, faster search)
4. **Observable** - Users can see cache status and sync progress

---

## Requirements

### Functional

- All hooks use MemoryRouter instead of direct SupermemoryClient
- New `/cache` command for cache management
- New `/sync` command for manual sync
- Cache status in context output
- Settings for cache behavior

### Non-Functional

- Zero regression in existing functionality
- < 5% code change in hooks
- Full test coverage for integration points
- Clear documentation for users

---

## Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                    Integration Points                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HOOKS (update to use MemoryRouter)                             │
│  ├── context-hook.ts     → getContext()                         │
│  ├── prompt-hook.ts      → addMemory() (user prompts)           │
│  ├── observation-hook.ts → addMemory() (tool outputs)           │
│  └── summary-hook.ts     → addMemory() + syncNow()              │
│                                                                  │
│  COMMANDS (new)                                                  │
│  ├── cache.md            → Cache management command             │
│  └── sync.md             → Manual sync command                  │
│                                                                  │
│  SKILLS (update)                                                │
│  └── super-search        → Use MemoryRouter.search()            │
│                                                                  │
│  SETTINGS (extend)                                               │
│  └── settings.ts         → Add cache configuration              │
│                                                                  │
│  CONFIG (new)                                                    │
│  └── hooks.json          → Environment detection                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### 1. Update Settings Interface

```typescript
// packages/supermemory/src/utils/settings.ts

export interface SupermemorySettings {
  // Existing settings
  skipTools: string[];
  captureTools: string[];
  maxProfileItems: number;
  debug: boolean;

  // New cache settings
  cache: {
    enabled: boolean; // Default: true (if platform supports)
    mode: "hybrid" | "cache-only" | "remote-only"; // Default: 'hybrid'
    syncEnabled: boolean; // Default: true
    syncIntervalMinutes: number; // Default: 5
    maxCacheSizeMb: number; // Default: 100
    ttlDays: number; // Default: 30
  };
}

const DEFAULT_CACHE_SETTINGS = {
  enabled: true,
  mode: "hybrid" as const,
  syncEnabled: true,
  syncIntervalMinutes: 5,
  maxCacheSizeMb: 100,
  ttlDays: 30,
};
```

### 2. Create Router Factory

```typescript
// packages/supermemory/src/cache/factory.ts

let globalRouter: MemoryRouter | null = null;

export async function getMemoryRouter(): Promise<MemoryRouter> {
  if (globalRouter) return globalRouter;

  const settings = loadSettings();
  const projectInfo = getProjectInfo();

  // Check if cache should be enabled
  const cacheEnabled = settings.cache.enabled && (await checkZvecSupport());

  const config: MemoryRouterConfig = {
    mode: cacheEnabled ? settings.cache.mode : "remote-only",
    cacheEnabled,
    syncEnabled: settings.cache.syncEnabled,
    syncIntervalMs: settings.cache.syncIntervalMinutes * 60 * 1000,
    maxCacheSize: settings.cache.maxProfileItems,
    ttlSeconds: settings.cache.ttlDays * 24 * 60 * 60,
  };

  globalRouter = new MemoryRouter(projectInfo, config);
  await globalRouter.initialize();

  return globalRouter;
}

export function resetRouter(): void {
  if (globalRouter) {
    globalRouter.stopBackgroundSync();
    globalRouter = null;
  }
}
```

### 3. Update Context Hook

```typescript
// packages/supermemory/src/hooks/context-hook.ts

import { getMemoryRouter } from "../cache/factory";
import { readStdin, writeOutput, HookInput } from "./types";

async function main(): Promise<void> {
  const input: HookInput = await readStdin();

  // Skip if no API key
  const apiKey = getApiKey();
  if (!apiKey) {
    writeOutput({ context: "" });
    return;
  }

  try {
    const router = await getMemoryRouter();

    // Get context (uses cache if available)
    const context = await router.getContext();

    // Add cache status indicator
    const cacheStatus = router.isCacheAvailable()
      ? `<!-- Cache: enabled, ${await router.getCacheStats().then((s) => s.itemCount)} items -->`
      : "<!-- Cache: disabled -->";

    writeOutput({
      context: context.xml + "\n" + cacheStatus,
    });

    // Start background sync if enabled
    router.startBackgroundSync();
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[Supermemory] Context hook error:", error);
    }
    writeOutput({ context: "" });
  }
}

main();
```

### 4. Update Summary Hook (with sync)

```typescript
// packages/supermemory/src/hooks/summary-hook.ts

import { getMemoryRouter, resetRouter } from "../cache/factory";

async function main(): Promise<void> {
  const input: HookInput = await readStdin();

  const apiKey = getApiKey();
  if (!apiKey) {
    writeOutput({});
    return;
  }

  try {
    const router = await getMemoryRouter();

    // Save session summary
    if (input.summary) {
      await router.addMemory(
        `Session Summary:\n${input.summary}`,
        "conversation",
      );
    }

    // Final sync before session ends (blocking)
    if (router.isCacheAvailable()) {
      const syncResult = await router.syncNow();

      if (isDebugEnabled()) {
        console.log("[Supermemory] Final sync:", syncResult);
      }
    }

    // Cleanup
    router.stopBackgroundSync();
    resetRouter();

    writeOutput({});
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[Supermemory] Summary hook error:", error);
    }
    writeOutput({});
  }
}

main();
```

### 5. Create Cache Command

```markdown
## <!-- packages/supermemory/plugin/commands/cache.md -->

## description: Manage the local memory cache

# Supermemory Cache Management

Manage the local Zvec cache for faster memory access.

## Check Cache Status

\`\`\`bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/cache-status.cjs"
\`\`\`

Shows:

- Cache enabled/disabled
- Number of cached memories
- Cache size on disk
- Last sync time
- Pending uploads

## Clear Cache

\`\`\`bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/cache-clear.cjs"
\`\`\`

Removes all locally cached memories. Remote data is preserved.

## Warm Cache

\`\`\`bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/cache-warm.cjs"
\`\`\`

Pre-loads memories from Supermemory into local cache.
```

### 6. Create Sync Command

```markdown
## <!-- packages/supermemory/plugin/commands/sync.md -->

## description: Manually sync memories with Supermemory

# Sync Memories

Manually trigger synchronization between local cache and Supermemory.

## Run Sync

\`\`\`bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/sync-now.cjs"
\`\`\`

This will:

1. Upload any unsynced local memories to Supermemory
2. Download new memories from Supermemory to local cache
3. Resolve any conflicts (last-write-wins)

## View Sync Status

\`\`\`bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/sync-status.cjs"
\`\`\`

Shows:

- Last sync time
- Pending uploads
- Pending downloads
- Recent conflicts
```

### 7. Implement Command Scripts

```typescript
// packages/supermemory/src/commands/cache-status.ts

import { getMemoryRouter } from "../cache/factory";

async function main(): Promise<void> {
  const router = await getMemoryRouter();

  if (!router.isCacheAvailable()) {
    console.log("Cache Status: DISABLED");
    console.log("Reason: Platform not supported or cache disabled in settings");
    return;
  }

  const stats = await router.getCacheStats();
  const health = await router.getHealth();

  console.log("Cache Status: ENABLED");
  console.log(`Items: ${stats.itemCount}`);
  console.log(`Size: ${formatBytes(stats.sizeBytes)}`);
  console.log(`Last Sync: ${formatTime(stats.lastSyncTime)}`);
  console.log(`Pending Uploads: ${stats.pendingUploads}`);
  console.log(
    `Supermemory: ${health.supermemoryOnline ? "ONLINE" : "OFFLINE"}`,
  );
}

main().catch(console.error);
```

```typescript
// packages/supermemory/src/commands/sync-now.ts

import { getMemoryRouter } from "../cache/factory";

async function main(): Promise<void> {
  const router = await getMemoryRouter();

  if (!router.isCacheAvailable()) {
    console.log("Cannot sync: Cache is not available");
    return;
  }

  console.log("Starting sync...");
  const result = await router.syncNow();

  console.log(`Sync completed in ${result.duration}ms`);
  console.log(`  Uploaded: ${result.uploaded}`);
  console.log(`  Downloaded: ${result.downloaded}`);
  console.log(`  Conflicts: ${result.conflicts}`);

  if (result.errors.length > 0) {
    console.log("Errors:");
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

main().catch(console.error);
```

### 8. Update Super-Search Skill

```markdown
## <!-- packages/supermemory/plugin/skills/super-search/SKILL.md -->

## description: Search your coding memory for past work and sessions

# Super Search

Search through your memories to find information from past work sessions.

## When to Use

Use this skill when the user:

- Asks about past work or previous sessions
- Wants to recall how something was implemented
- Asks "what did I work on" or similar
- Wants to find decisions or notes from earlier

## How to Search

Execute the search with:

\`\`\`bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/search-memory.cjs" "QUERY"
\`\`\`

Replace QUERY with the user's search terms.

**Note**: Search uses the local cache for fast results, with optional remote search for broader coverage.

## Examples

- "what did I work on yesterday"
- "how did I implement authentication"
- "database migration changes"
- "API endpoint for users"

## Response Guidelines

- Present results clearly with relevance scores
- Indicate if results are from cache or remote
- Offer to search with different terms if results are insufficient
- Summarize key findings from the search results
```

### 9. Update Build Scripts

```typescript
// packages/supermemory/scripts/build-commands.ts

// Add new command builds
const commands = [
  "search-memory",
  "add-memory",
  "cache-status", // NEW
  "cache-clear", // NEW
  "cache-warm", // NEW
  "sync-now", // NEW
  "sync-status", // NEW
];
```

### 10. Update hooks.json

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/context-hook.cjs\"",
      "timeout": 30000,
      "env": {
        "SUPERMEMORY_CACHE_ENABLED": "true"
      }
    },
    {
      "event": "UserPromptSubmit",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/prompt-hook.cjs\"",
      "timeout": 15000
    },
    {
      "event": "PostToolUse",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/observation-hook.cjs\"",
      "timeout": 15000,
      "tools": ["Edit", "Write", "Bash", "Task"]
    },
    {
      "event": "Stop",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/summary-hook.cjs\"",
      "timeout": 60000
    }
  ]
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// packages/supermemory/src/__tests__/integration.test.ts

describe("MemoryRouter Integration", () => {
  describe("with cache enabled", () => {
    it("should return cached context on second call", async () => {
      // ...
    });

    it("should write to both cache and remote", async () => {
      // ...
    });

    it("should merge search results from cache and remote", async () => {
      // ...
    });
  });

  describe("with cache disabled", () => {
    it("should fall back to remote only", async () => {
      // ...
    });
  });

  describe("offline mode", () => {
    it("should work with cache when remote unavailable", async () => {
      // ...
    });
  });
});
```

### Integration Tests

```typescript
describe("Hook Integration", () => {
  it("context-hook should use cache when available", async () => {
    // Spawn hook process
    // Verify cache was queried
  });

  it("summary-hook should sync before exit", async () => {
    // Spawn hook process
    // Verify sync was triggered
  });
});
```

### E2E Tests

```typescript
describe("End-to-End Cache Flow", () => {
  it("should persist memories across sessions", async () => {
    // Session 1: Add memory
    // Session 2: Verify memory in cache
  });

  it("should sync memories to remote", async () => {
    // Add memory locally
    // Trigger sync
    // Verify in Supermemory
  });
});
```

---

## Related Code Files

### Files to Modify

- `packages/supermemory/src/utils/settings.ts`
- `packages/supermemory/src/hooks/context-hook.ts`
- `packages/supermemory/src/hooks/prompt-hook.ts`
- `packages/supermemory/src/hooks/observation-hook.ts`
- `packages/supermemory/src/hooks/summary-hook.ts`
- `packages/supermemory/src/commands/search-memory.ts`
- `packages/supermemory/plugin/hooks/hooks.json`
- `packages/supermemory/plugin/skills/super-search/SKILL.md`
- `packages/supermemory/scripts/build-commands.ts`
- `packages/supermemory/scripts/build-hooks.ts`

### Files to Create

- `packages/supermemory/src/cache/factory.ts`
- `packages/supermemory/src/commands/cache-status.ts`
- `packages/supermemory/src/commands/cache-clear.ts`
- `packages/supermemory/src/commands/cache-warm.ts`
- `packages/supermemory/src/commands/sync-now.ts`
- `packages/supermemory/src/commands/sync-status.ts`
- `packages/supermemory/plugin/commands/cache.md`
- `packages/supermemory/plugin/commands/sync.md`
- `packages/supermemory/src/__tests__/integration.test.ts`

---

## Todo List

- [ ] Extend settings interface with cache options
- [ ] Create router factory with platform detection
- [ ] Update context-hook to use MemoryRouter
- [ ] Update prompt-hook to use MemoryRouter
- [ ] Update observation-hook to use MemoryRouter
- [ ] Update summary-hook with sync on exit
- [ ] Create cache-status command
- [ ] Create cache-clear command
- [ ] Create cache-warm command
- [ ] Create sync-now command
- [ ] Create sync-status command
- [ ] Add /cache command documentation
- [ ] Add /sync command documentation
- [ ] Update super-search skill
- [ ] Update build scripts for new commands
- [ ] Write unit tests for factory
- [ ] Write integration tests for hooks
- [ ] Write E2E tests for full flow
- [ ] Test on Linux x86_64
- [ ] Test on macOS ARM64
- [ ] Test fallback on unsupported platforms
- [ ] Update documentation

---

## Success Criteria

1. All existing tests continue to pass
2. New cache functionality works on supported platforms
3. Graceful fallback on unsupported platforms
4. /cache and /sync commands work correctly
5. < 10ms context retrieval when cached
6. Zero data loss during sync
7. 90%+ test coverage for new code

---

## Security Considerations

- Validate all command inputs
- Sanitize output in status commands
- No sensitive data in logs
- Secure cache directory permissions

---

## Rollout Plan

1. **Alpha**: Internal testing with cache disabled by default
2. **Beta**: Enable cache for opt-in users via settings
3. **GA**: Enable cache by default on supported platforms

---

## Documentation Updates

- Update README with cache feature
- Add troubleshooting guide for cache issues
- Document platform requirements
- Add sync conflict resolution explanation
