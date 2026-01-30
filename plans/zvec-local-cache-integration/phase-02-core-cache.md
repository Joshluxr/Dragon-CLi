# Phase 2: Core Cache Implementation

**Status**: Pending
**Priority**: High
**Depends On**: Phase 1 (Infrastructure)

---

## Overview

Implement the core ZvecCache class in Python that handles all vector database operations: collection management, document CRUD, vector search, and metadata filtering.

---

## Context Links

- [Main Plan](./plan.md)
- [Phase 1: Infrastructure](./phase-01-infrastructure.md)
- [Zvec Research Report](../reports/zvec-research-report.md)

---

## Key Insights

1. **Schema design** - Must support both static profile memories and dynamic conversation memories
2. **Vector dimensions** - Need to match embedding model (768 for most, 1536 for OpenAI)
3. **Filtering** - SQL-like syntax for metadata queries
4. **Persistence** - Automatic disk persistence with flush()

---

## Requirements

### Functional

- Create/open/destroy collections per project
- Insert, update, upsert, delete memories
- Vector similarity search with top-k
- Metadata filtering (by type, date range, source)
- Batch operations for efficiency
- Collection statistics and health checks

### Non-Functional

- Insert latency < 10ms per document
- Search latency < 20ms for 10k vectors
- Support up to 100k memories per project
- Atomic batch operations

---

## Architecture

```python
class ZvecCache:
    """
    Local vector cache backed by Zvec.
    Provides fast similarity search and metadata filtering.
    """

    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.collections: Dict[str, Collection] = {}

    # Collection Management
    def open_collection(self, project: str) -> bool
    def close_collection(self, project: str) -> bool
    def destroy_collection(self, project: str) -> bool
    def get_stats(self, project: str) -> CollectionStats

    # Document Operations
    def insert(self, project: str, memories: List[Memory]) -> List[str]
    def update(self, project: str, memories: List[Memory]) -> bool
    def upsert(self, project: str, memories: List[Memory]) -> List[str]
    def delete(self, project: str, ids: List[str]) -> bool
    def fetch(self, project: str, ids: List[str]) -> List[Memory]

    # Search Operations
    def search(self, project: str, query: SearchQuery) -> List[SearchResult]
    def search_by_text(self, project: str, text: str, limit: int) -> List[SearchResult]

    # Sync Support
    def get_unsynced(self, project: str) -> List[Memory]
    def mark_synced(self, project: str, ids: List[str], sync_time: int) -> bool
    def get_modified_since(self, project: str, timestamp: int) -> List[Memory]
```

---

## Data Types

### Memory (Python)

```python
@dataclass
class Memory:
    id: str                          # Local UUID
    content: str                     # Memory text
    embedding: List[float]           # Vector (768 or 1536 dims)
    memory_type: str                 # static/dynamic/conversation/observation
    project: str                     # Container tag
    created_at: int                  # Unix timestamp
    updated_at: int                  # Last modified
    synced_at: Optional[int] = None  # Last SM sync
    memory_id: Optional[str] = None  # Supermemory ID
    source: str = "local"            # local/supermemory
    metadata: Optional[Dict] = None  # Additional metadata
```

### SearchQuery (Python)

```python
@dataclass
class SearchQuery:
    embedding: List[float]           # Query vector
    limit: int = 10                  # Top-k results
    filter: Optional[str] = None     # SQL-like filter
    output_fields: List[str] = None  # Fields to return
    min_score: float = 0.0           # Minimum similarity
```

### SearchResult (Python)

```python
@dataclass
class SearchResult:
    id: str
    content: str
    score: float
    memory_type: str
    created_at: int
    metadata: Optional[Dict] = None
```

---

## Implementation Steps

### 1. Collection Schema Definition

```python
def _create_schema(self, dimension: int = 768) -> CollectionSchema:
    return CollectionSchema(
        name="terragon_memories",
        fields=[
            VectorSchema(
                name="embedding",
                data_type=DataType.VECTOR_FP32,
                dimension=dimension,
                index_param=HnswIndexParam(
                    metric_type=MetricType.COSINE,
                    m=32,
                    ef_construction=200
                )
            ),
            FieldSchema("memory_id", DataType.STRING),
            FieldSchema("content", DataType.STRING),
            FieldSchema("memory_type", DataType.STRING,
                       index_param=InvertIndexParam()),
            FieldSchema("project", DataType.STRING),
            FieldSchema("created_at", DataType.INT64),
            FieldSchema("updated_at", DataType.INT64),
            FieldSchema("synced_at", DataType.INT64),
            FieldSchema("source", DataType.STRING,
                       index_param=InvertIndexParam()),
        ]
    )
```

### 2. Collection Lifecycle

```python
def open_collection(self, project: str) -> bool:
    """Open or create collection for project."""
    if project in self.collections:
        return True

    path = self._get_collection_path(project)
    schema = self._create_schema()

    try:
        if os.path.exists(path):
            collection = zvec.open(path)
        else:
            os.makedirs(path, exist_ok=True)
            collection = zvec.create_and_open(path, schema)

        self.collections[project] = collection
        return True
    except Exception as e:
        logger.error(f"Failed to open collection: {e}")
        return False
```

### 3. Document Operations

```python
def insert(self, project: str, memories: List[Memory]) -> List[str]:
    """Insert new memories, return IDs."""
    collection = self._get_collection(project)

    docs = [
        Doc(
            id=m.id,
            vectors={"embedding": m.embedding},
            fields={
                "memory_id": m.memory_id or "",
                "content": m.content,
                "memory_type": m.memory_type,
                "project": m.project,
                "created_at": m.created_at,
                "updated_at": m.updated_at,
                "synced_at": m.synced_at or 0,
                "source": m.source,
            }
        )
        for m in memories
    ]

    results = collection.insert(docs)
    collection.flush()

    return [m.id for m, r in zip(memories, results) if r.ok()]
```

### 4. Search Operations

```python
def search(self, project: str, query: SearchQuery) -> List[SearchResult]:
    """Vector similarity search with optional filtering."""
    collection = self._get_collection(project)

    vq = VectorQuery(
        field_name="embedding",
        vector=query.embedding,
        topk=query.limit,
        filter=query.filter,
        output_fields=query.output_fields or ["content", "memory_type", "created_at"]
    )

    results = collection.query(vq)

    return [
        SearchResult(
            id=doc.pk(),
            content=doc.get_any("content", DataType.STRING),
            score=doc.score(),
            memory_type=doc.get_any("memory_type", DataType.STRING),
            created_at=doc.get_any("created_at", DataType.INT64),
        )
        for doc in results
        if doc.score() >= query.min_score
    ]
```

### 5. Sync Support Methods

```python
def get_unsynced(self, project: str) -> List[Memory]:
    """Get memories that haven't been synced to Supermemory."""
    collection = self._get_collection(project)

    # Query for local memories not synced
    query = VectorQuery(
        field_name="embedding",
        vector=[0.0] * 768,  # Dummy vector
        topk=1000,
        filter="source='local' AND synced_at=0",
        output_fields=["content", "memory_type", "created_at", "updated_at"]
    )

    # Alternative: fetch all and filter (for non-vector query)
    # This is a workaround since Zvec requires vector for query
    pass

def mark_synced(self, project: str, ids: List[str], sync_time: int) -> bool:
    """Mark memories as synced with timestamp."""
    collection = self._get_collection(project)

    docs = collection.fetch(ids)
    updates = []

    for doc_id, doc in docs.items():
        doc.set_any("synced_at", DataType.INT64, sync_time)
        updates.append(doc)

    results = collection.update(updates)
    collection.flush()

    return all(r.ok() for r in results)
```

---

## Related Code Files

### Files to Create

- `packages/supermemory/python/zvec_bridge/cache.py`
- `packages/supermemory/python/zvec_bridge/models.py`
- `packages/supermemory/python/tests/test_cache.py`

### Files to Modify

- `packages/supermemory/python/zvec_bridge/server.py` (add cache methods)

---

## Todo List

- [ ] Define Memory and SearchQuery dataclasses
- [ ] Implement collection schema creation
- [ ] Implement open_collection / close_collection
- [ ] Implement destroy_collection
- [ ] Implement insert operation
- [ ] Implement update operation
- [ ] Implement upsert operation
- [ ] Implement delete operation
- [ ] Implement fetch operation
- [ ] Implement search operation with filtering
- [ ] Implement get_unsynced for sync support
- [ ] Implement mark_synced for sync support
- [ ] Implement get_stats for health checks
- [ ] Write unit tests for all operations
- [ ] Test with 10k+ memories for performance

---

## Success Criteria

1. All CRUD operations work correctly
2. Search returns relevant results (>0.8 recall)
3. Insert latency < 10ms per document
4. Search latency < 20ms for 10k vectors
5. Batch operations handle 1000+ documents
6. All tests pass

---

## Security Considerations

- Sanitize filter strings to prevent injection
- Validate embedding dimensions before insert
- Limit batch sizes to prevent memory issues
- Validate project names (no path traversal)

---

## Next Steps

After this phase:
→ Phase 3: Implement MemoryRouter that coordinates Zvec and Supermemory
