# Memory System Bottleneck Fixes - Implementation Plan

## Status: ✅ COMPLETE

All phases have been implemented and tested.

## Executive Summary

This plan addressed 5 key bottlenecks in the Claude memory system:

1. ✅ **MCP handlers use in-memory demo storage** → Connected standalone storage with tree navigation
2. ✅ **No real FTS5 keyword search** → Added keyword and hybrid search methods
3. ✅ **No semantic chunking** → Added SemanticChunker for long memories
4. ✅ **Dummy embeddings** → Integrated real embedding engines (OpenAI, local)
5. ✅ **No automatic pruning** → Added TTL-based cleanup and size limits

---

## Phase 1: Connect MCP Handlers to MemoryRouter

### 1.1 Current Problem

The MCP handlers in `packages/mcp-server/src/handlers/memory.ts` use:

```typescript
const memoryStore = new Map<string, MemoryItem>(); // Demo only!
```

### 1.2 Solution

Create a MemoryService that wraps MemoryRouter for MCP handler use.

### 1.3 Files to Modify

- `packages/mcp-server/src/handlers/memory.ts` - Replace demo storage
- `packages/supermemory/src/cache/router.ts` - Add new methods for MCP
- NEW: `packages/supermemory/src/services/memory-service.ts` - Facade for MCP

### 1.4 Implementation Steps

1. **Add methods to MemoryRouter**:

   - `getAllMemories()` - Get all memories for tree building
   - `getMemoryById(id: string)` - Get specific memory
   - `getMemoriesByIds(ids: string[])` - Batch get
   - `getMemoriesBySession(sessionId: string)` - Filter by session
   - `getTimeline(anchor: string, before: number, after: number)` - Timeline view

2. **Create MemoryService**:

   ```typescript
   export class MemoryService {
     private router: MemoryRouter;
     private treeBuilder: MemoryTreeBuilder;
     private treeNavigator: TreeNavigator;

     async search(
       query: string,
       limit: number,
       type?: string,
     ): Promise<MemoryItem[]>;
     async get(ids: string[]): Promise<MemoryItem[]>;
     async add(content: string, type: string, tags?: string[]): Promise<string>;
     async getTree(maxDepth?: number): Promise<string>;
     async navigate(nodeId: string): Promise<string>;
     async getTimeline(
       anchor: string,
       before: number,
       after: number,
     ): Promise<MemoryItem[]>;
     async getStats(): Promise<MemoryStats>;
   }
   ```

3. **Update memory handlers** to use MemoryService instead of Map

### 1.5 Testing

- Unit tests for MemoryService
- Integration tests with mock MemoryRouter

---

## Phase 2: Add FTS5 Keyword Search

### 2.1 Current Problem

The Zvec cache only supports vector similarity search. Keyword search falls back to string.includes().

### 2.2 Solution

Add FTS5 index to Zvec Python backend for fast keyword search.

### 2.3 Files to Modify

- `packages/supermemory/python/zvec_bridge/cache.py` - Add FTS5 table
- `packages/supermemory/python/zvec_bridge/server.py` - Add FTS5 methods
- `packages/supermemory/src/cache/bridge.ts` - Add FTS5 bridge methods
- `packages/supermemory/src/cache/router.ts` - Add keyword search method

### 2.4 Implementation Steps

1. **Add SQLite FTS5 in cache.py**:

   ```python
   # Create FTS5 virtual table alongside Zvec
   def create_fts_index(self):
       conn = sqlite3.connect(self.db_path)
       conn.execute('''
           CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts
           USING fts5(memory_id, content, memory_type, tokenize='porter');
       ''')

   def keyword_search(self, query: str, limit: int = 10) -> List[dict]:
       # BM25 ranking with FTS5
       cursor.execute('''
           SELECT memory_id, content, memory_type, bm25(memory_fts) as score
           FROM memory_fts
           WHERE memory_fts MATCH ?
           ORDER BY score LIMIT ?
       ''', (query, limit))
   ```

2. **Add sync between Zvec and FTS5**:

   - On insert: Add to both Zvec collection and FTS5 table
   - On delete: Remove from both
   - Keep memory_id as the linking key

3. **Add hybrid search in router**:

   ```typescript
   async hybridSearch(query: string, limit: number): Promise<MemoryItem[]> {
     // 1. Vector search (semantic)
     const vectorResults = await this.search(query, limit);

     // 2. Keyword search (exact match)
     const keywordResults = await this.keywordSearch(query, limit);

     // 3. RRF (Reciprocal Rank Fusion) to combine
     return this.mergeResults(vectorResults, keywordResults, limit);
   }
   ```

### 2.5 Testing

- Test keyword search finds exact matches
- Test hybrid search combines vector + keyword
- Benchmark: Keyword < 10ms, Hybrid < 50ms

---

## Phase 3: Semantic Chunking for Long Memories

### 3.1 Current Problem

Long tool outputs (>2000 chars) are truncated or stored as single items, losing information.

### 3.2 Solution

Chunk long content into semantic units before storage.

### 3.3 Files to Create/Modify

- NEW: `packages/supermemory/src/utils/chunker.ts` - Semantic chunking
- `packages/supermemory/src/hooks/observation-hook.ts` - Use chunker
- `packages/supermemory/src/cache/router.ts` - Store chunks with parent link

### 3.4 Implementation Steps

1. **Create chunker.ts**:

   ```typescript
   export interface Chunk {
     content: string;
     startOffset: number;
     endOffset: number;
     chunkIndex: number;
     totalChunks: number;
   }

   export function chunkContent(
     content: string,
     options?: ChunkOptions,
   ): Chunk[] {
     // Strategy 1: Code - chunk by function/class boundaries
     // Strategy 2: Prose - chunk by paragraph/sentence
     // Strategy 3: Mixed - detect and apply appropriate strategy
   }

   // Chunking strategies:
   // - Max size: 1500 chars per chunk
   // - Overlap: 150 chars between chunks for context
   // - Smart boundaries: Don't split mid-sentence or mid-code-block
   ```

2. **Chunking strategies**:

   - **Code detection**: Look for `function`, `class`, `const`, `{`, `}`
   - **Code chunking**: Split at function/class/block boundaries
   - **Prose chunking**: Split at paragraph breaks, then sentences
   - **Fallback**: Split at last space before max_size

3. **Update observation-hook.ts**:

   ```typescript
   if (content.length > CHUNK_THRESHOLD) {
     const chunks = chunkContent(content, { maxSize: 1500, overlap: 150 });
     for (const chunk of chunks) {
       await client.addMemory(chunk.content, "observation", {
         parentId: observationId,
         chunkIndex: chunk.chunkIndex,
         totalChunks: chunk.totalChunks,
       });
     }
   }
   ```

4. **Update router to handle chunks**:
   - Store chunk metadata (parentId, chunkIndex, totalChunks)
   - When retrieving, optionally reassemble chunks

### 3.5 Testing

- Test chunking preserves code structure
- Test chunk overlap provides context
- Test reassembly produces original content

---

## Phase 4: Real Embedding Integration

### 4.1 Current Problem

`generateDummyEmbedding()` creates random vectors - no real semantic search.

### 4.2 Solution

Integrate the embedding engines from `packages/supermemory/src/embeddings/`.

### 4.3 Files to Modify

- `packages/supermemory/src/cache/router.ts` - Use EmbeddingEngine
- `packages/supermemory/src/utils/settings.ts` - Add embeddingConfig
- `packages/supermemory/src/embeddings/factory.ts` - Improve initialization

### 4.4 Implementation Steps

1. **Update MemoryRouter to use EmbeddingEngine**:

   ```typescript
   private embeddingEngine: EmbeddingEngine;

   async initialize(): Promise<void> {
     // ... existing init ...

     // Initialize embedding engine
     this.embeddingEngine = createEmbeddingEngine(settings.embeddingEngine);
     await this.embeddingEngine.initialize();
   }

   private async generateEmbedding(text: string): Promise<number[]> {
     const [embedding] = await this.embeddingEngine.embed([text]);
     return embedding;
   }
   ```

2. **Fix LocalEmbeddingEngine with caching**:

   ```typescript
   // Cache loaded model to avoid reload
   private static modelCache: Map<string, Pipeline> = new Map();

   // Batch processing for efficiency
   async embed(texts: string[]): Promise<number[][]> {
     // Process in batches of 10
   }
   ```

3. **Add embedding dimension validation**:

   - Zvec expects 768-dim (ada-002)
   - MiniLM-L6 produces 384-dim
   - Add dimension adapter or reconfigure Zvec

4. **Handle embedding engine fallback**:
   ```typescript
   async embed(texts: string[]): Promise<number[][]> {
     try {
       return await this.primaryEngine.embed(texts);
     } catch (error) {
       console.warn('Primary embedding failed, using fallback');
       return await this.fallbackEngine.embed(texts);
     }
   }
   ```

### 4.5 Testing

- Test embedding dimension matches Zvec schema
- Test fallback works when primary fails
- Benchmark: Local < 100ms/text, OpenAI < 500ms/text

---

## Phase 5: Automatic Pruning & Cleanup

### 5.1 Current Problem

Memories accumulate indefinitely, wasting storage and slowing search.

### 5.2 Solution

Add TTL-based pruning and importance scoring.

### 5.3 Files to Modify

- `packages/supermemory/src/cache/router.ts` - Add pruning methods
- `packages/supermemory/python/zvec_bridge/cache.py` - Add delete by TTL
- NEW: `packages/supermemory/src/utils/importance.ts` - Importance scoring

### 5.4 Implementation Steps

1. **Add importance scoring**:

   ```typescript
   export function calculateImportance(memory: CachedMemory): number {
     let score = 0.5; // Base score

     // Type-based importance
     if (memory.memory_type === "decision") score += 0.3;
     if (memory.memory_type === "pattern") score += 0.2;
     if (memory.memory_type === "context") score += 0.2;

     // Recency decay
     const ageHours = (Date.now() - memory.created_at) / (1000 * 60 * 60);
     score *= Math.exp(-ageHours / (30 * 24)); // 30-day half-life

     // Access frequency boost (future: track access count)

     return Math.min(1.0, score);
   }
   ```

2. **Add pruning to router**:

   ```typescript
   async pruneOldMemories(options: PruneOptions = {}): Promise<PruneResult> {
     const {
       maxAge = 30 * 24 * 60 * 60 * 1000, // 30 days
       maxItems = 1000,
       keepHighImportance = 100,
     } = options;

     // 1. Get all memories
     const all = await this.getAllMemories();

     // 2. Calculate importance scores
     const scored = all.map(m => ({
       ...m,
       importance: calculateImportance(m),
     }));

     // 3. Sort by importance
     scored.sort((a, b) => b.importance - a.importance);

     // 4. Keep top N important + recent within TTL
     const toKeep = new Set<string>();
     const toDelete: string[] = [];

     for (const m of scored) {
       const age = Date.now() - m.created_at;
       if (toKeep.size < keepHighImportance || age < maxAge) {
         toKeep.add(m.id);
       } else if (toKeep.size < maxItems) {
         toKeep.add(m.id);
       } else {
         toDelete.push(m.id);
       }
     }

     // 5. Delete pruned memories
     await this.deleteMemories(toDelete);

     return { deleted: toDelete.length, remaining: toKeep.size };
   }
   ```

3. **Add scheduled pruning**:

   ```typescript
   startBackgroundPruning(intervalMs = 24 * 60 * 60 * 1000): void {
     setInterval(() => this.pruneOldMemories(), intervalMs);
   }
   ```

4. **Add Zvec delete methods**:

   ```python
   def delete_by_ids(self, ids: List[str]) -> int:
       # Delete from Zvec collection and FTS5
       pass

   def delete_by_ttl(self, ttl_seconds: int) -> int:
       # Delete memories older than TTL
       pass
   ```

### 5.5 Testing

- Test pruning keeps important memories
- Test TTL deletes old memories
- Test importance scoring prioritizes decisions/patterns

---

## Implementation Order

1. **Phase 1** (Core): Connect MCP handlers to MemoryRouter
2. **Phase 4** (Dependency): Real embeddings (needed for search)
3. **Phase 2** (Enhancement): FTS5 keyword search
4. **Phase 3** (Enhancement): Semantic chunking
5. **Phase 5** (Maintenance): Automatic pruning

---

## Estimated Changes

| Phase     | Files Modified | New Files | LOC Changed |
| --------- | -------------- | --------- | ----------- |
| 1         | 2              | 1         | ~400        |
| 2         | 4              | 0         | ~300        |
| 3         | 3              | 1         | ~250        |
| 4         | 3              | 0         | ~200        |
| 5         | 3              | 1         | ~300        |
| **Total** | **15**         | **3**     | **~1450**   |

---

## Testing Strategy

1. **Unit Tests**: Each new function
2. **Integration Tests**: Router ↔ Zvec ↔ FTS5
3. **E2E Tests**: MCP handler → Router → Storage → Retrieval
4. **Performance Tests**:
   - Search < 100ms for 1000 memories
   - Embedding < 100ms for local model
   - Pruning < 1s for 1000 memories
