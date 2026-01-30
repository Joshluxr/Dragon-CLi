# Zvec Local Vector Cache Integration Plan

**Created**: 2026-01-30
**Completed**: 2026-01-30
**Status**: Complete
**Priority**: Medium
**Estimated Phases**: 5

---

## Executive Summary

This plan integrates Alibaba's Zvec embedded vector database as a **local caching layer** for the existing Supermemory integration. The architecture provides:

1. **Zero-latency local retrieval** - No network roundtrips for frequently accessed memories
2. **Offline capability** - Full functionality without internet connection
3. **Hybrid architecture** - Local hot cache + cloud persistent storage
4. **Automatic sync** - Background synchronization between Zvec and Supermemory

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Claude Code Agent                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Hooks      │───▶│ MemoryRouter │───▶│  Supermemory     │  │
│  │ (context,    │    │              │    │  (Cloud/Remote)  │  │
│  │  prompt,     │    │  - Read:     │    │                  │  │
│  │  tool,       │    │    Zvec first│    │  - Persistent    │  │
│  │  summary)    │    │    then SM   │    │  - Cross-device  │  │
│  └──────────────┘    │              │    │  - Profile mgmt  │  │
│                      │  - Write:    │    └──────────────────┘  │
│                      │    Both      │              ▲            │
│                      │    parallel  │              │            │
│                      │              │              │ Sync       │
│                      │  - Sync:     │              │            │
│                      │    Background│              │            │
│                      └──────┬───────┘              │            │
│                             │                      │            │
│                             ▼                      │            │
│                      ┌──────────────┐              │            │
│                      │    Zvec      │──────────────┘            │
│                      │ (Local Cache)│                           │
│                      │              │                           │
│                      │ - In-process │                           │
│                      │ - <5ms reads │                           │
│                      │ - Offline    │                           │
│                      │ - Per-project│                           │
│                      └──────────────┘                           │
│                             │                                    │
│                             ▼                                    │
│                      ~/.dragon/                                │
│                        zvec-cache/                               │
│                          {project}/                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Read Path (Context Retrieval)

When the agent needs context at session start:

```
1. Query Zvec local cache (< 5ms)
   └─▶ Return cached memories immediately

2. Background: Query Supermemory (100-500ms)
   └─▶ Merge new/updated memories into Zvec
   └─▶ Update freshness timestamps
```

**Benefit**: Agent gets context instantly from local cache while cloud sync happens in background.

### 2. Write Path (Memory Storage)

When the agent captures new information:

```
1. Write to Zvec local cache (immediate)
   └─▶ Available for next local query

2. Async: Write to Supermemory (background)
   └─▶ Persisted to cloud
   └─▶ Available on other devices
```

**Benefit**: No write latency impact on agent workflow.

### 3. Search Path (Memory Search)

When user searches memories:

```
1. Search Zvec with query vector (< 10ms)
   └─▶ Return local results

2. Optional: Search Supermemory for broader results
   └─▶ Merge and deduplicate
```

**Benefit**: Instant search results for recent/local memories.

### 4. Sync Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Sync Triggers                             │
├─────────────────────────────────────────────────────────────┤
│ 1. Session Start    │ Pull: SM → Zvec (background)          │
│ 2. Session End      │ Push: Zvec → SM (blocking for summary)│
│ 3. Idle (5 min)     │ Bidirectional sync                    │
│ 4. Manual /sync     │ Full bidirectional sync               │
└─────────────────────────────────────────────────────────────┘

Conflict Resolution:
- Last-write-wins based on timestamp
- Supermemory is source of truth for cross-device
- Zvec is source of truth for local session
```

---

## Data Model

### Zvec Collection Schema

```python
schema = CollectionSchema(
    name="dragon_memories",
    fields=[
        # Vector field for semantic search
        VectorSchema(
            name="embedding",
            data_type=DataType.VECTOR_FP32,
            dimension=768,  # Match embedding model
            index_param=HnswIndexParam(
                metric_type=MetricType.COSINE,
                m=32,
                ef_construction=200,
                quantize_type=QuantizeType.UNDEFINED
            )
        ),
        # Metadata fields
        FieldSchema("memory_id", DataType.STRING),      # Supermemory ID
        FieldSchema("content", DataType.STRING),        # Memory text
        FieldSchema("memory_type", DataType.STRING),    # static/dynamic/conversation
        FieldSchema("project", DataType.STRING),        # Project identifier
        FieldSchema("created_at", DataType.INT64),      # Unix timestamp
        FieldSchema("updated_at", DataType.INT64),      # Last modified
        FieldSchema("synced_at", DataType.INT64),       # Last SM sync
        FieldSchema("source", DataType.STRING),         # local/supermemory
    ]
)
```

### Memory Item Interface

```typescript
interface CachedMemory {
  id: string; // Local UUID
  memoryId?: string; // Supermemory ID (if synced)
  content: string; // Memory content
  embedding: number[]; // Vector embedding
  type: "static" | "dynamic" | "conversation" | "observation";
  project: string; // Container tag
  createdAt: number; // Unix timestamp
  updatedAt: number; // Last modified
  syncedAt?: number; // Last sync with Supermemory
  source: "local" | "supermemory";
}
```

---

## Phase Overview

| Phase | Name           | Description                                            | Status   |
| ----- | -------------- | ------------------------------------------------------ | -------- |
| 1     | Infrastructure | Python environment, Zvec package, directory structure  | Complete |
| 2     | Core Cache     | ZvecCache class with CRUD operations                   | Complete |
| 3     | Memory Router  | Unified interface routing between Zvec and Supermemory | Complete |
| 4     | Sync Engine    | Background synchronization logic                       | Complete |
| 5     | Integration    | Hook updates, commands, testing                        | Complete |

---

## Success Criteria

1. **Performance**: Context retrieval < 10ms for cached items
2. **Reliability**: Zero data loss during sync failures
3. **Offline**: Full read/write functionality without network
4. **Transparency**: Seamless experience - user doesn't need to manage cache
5. **Testing**: 90%+ test coverage for cache and sync logic

---

## Risk Assessment

| Risk                          | Impact | Probability | Mitigation                                |
| ----------------------------- | ------ | ----------- | ----------------------------------------- |
| Python/Node bridge complexity | High   | Medium      | Use subprocess for Zvec, JSON IPC         |
| Sync conflicts                | Medium | Low         | Last-write-wins, audit log                |
| Embedding model mismatch      | High   | Low         | Store model version, re-embed on mismatch |
| Disk space growth             | Low    | Medium      | LRU eviction, max cache size config       |
| Platform compatibility        | Medium | Low         | Fallback to Supermemory-only mode         |

---

## Dependencies

- Zvec requires Python 3.10-3.12 (Linux x86_64 / macOS ARM64)
- Embedding generation (can use Supermemory's or local model)
- Existing Supermemory integration

---

## Related Files

- Phase details: `phase-01-infrastructure.md` through `phase-05-integration.md`
- Research: `../reports/zvec-research-report.md`
- Supermemory package: `packages/supermemory/`
