"""
ZvecCache - Core cache implementation using Zvec vector database.
"""

import os
import logging
from typing import List, Dict, Optional, Any

from .models import Memory, SearchQuery, SearchResult, CacheStats

logger = logging.getLogger(__name__)

# Zvec imports - handle gracefully if not available
try:
    import zvec
    from zvec import (
        CollectionSchema,
        VectorSchema,
        FieldSchema,
        DataType,
        Doc,
        VectorQuery,
        HnswIndexParam,
        HnswQueryParam,
        MetricType,
        CollectionOption,
        InvertIndexParam,
    )

    ZVEC_AVAILABLE = True
except ImportError:
    ZVEC_AVAILABLE = False
    logger.warning("Zvec not available - cache will be disabled")


class ZvecCache:
    """
    Local vector cache backed by Zvec.
    Provides fast similarity search and metadata filtering.
    """

    VECTOR_DIMENSION = 768  # Default embedding dimension

    def __init__(self, base_dir: str, dimension: int = 768):
        """
        Initialize the cache.

        Args:
            base_dir: Base directory for cache storage
            dimension: Vector embedding dimension
        """
        self.base_dir = base_dir
        self.dimension = dimension
        self.collections: Dict[str, Any] = {}

        if not ZVEC_AVAILABLE:
            logger.warning("Zvec not available - operating in no-op mode")

    def _get_collection_path(self, project: str) -> str:
        """Get the file path for a project's collection."""
        # Sanitize project name for filesystem
        safe_name = project.replace("/", "_").replace(":", "_").replace(" ", "_")
        return os.path.join(self.base_dir, safe_name, "collection")

    def _create_schema(self) -> "CollectionSchema":
        """Create the collection schema."""
        if not ZVEC_AVAILABLE:
            raise RuntimeError("Zvec not available")

        return CollectionSchema(
            name="terragon_memories",
            fields=[
                VectorSchema(
                    name="embedding",
                    data_type=DataType.VECTOR_FP32,
                    dimension=self.dimension,
                    index_param=HnswIndexParam(
                        metric_type=MetricType.COSINE,
                        m=32,
                        ef_construction=200,
                    ),
                ),
                FieldSchema("memory_id", DataType.STRING),
                FieldSchema("content", DataType.STRING),
                FieldSchema(
                    "memory_type",
                    DataType.STRING,
                    index_param=InvertIndexParam(),
                ),
                FieldSchema("project", DataType.STRING),
                FieldSchema("created_at", DataType.INT64),
                FieldSchema("updated_at", DataType.INT64),
                FieldSchema("synced_at", DataType.INT64),
                FieldSchema(
                    "source",
                    DataType.STRING,
                    index_param=InvertIndexParam(),
                ),
            ],
        )

    def _get_collection(self, project: str) -> Any:
        """Get or raise if collection not open."""
        if project not in self.collections:
            raise RuntimeError(f"Collection not open for project: {project}")
        return self.collections[project]

    # Collection Management

    def open_collection(self, project: str) -> bool:
        """
        Open or create a collection for a project.

        Args:
            project: Project identifier (container tag)

        Returns:
            True if successful, False otherwise
        """
        if not ZVEC_AVAILABLE:
            return False

        if project in self.collections:
            return True

        path = self._get_collection_path(project)

        try:
            if os.path.exists(path):
                collection = zvec.open(
                    path, CollectionOption(read_only=False, enable_mmap=True)
                )
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                schema = self._create_schema()
                collection = zvec.create_and_open(
                    path, schema, CollectionOption(read_only=False, enable_mmap=True)
                )

            self.collections[project] = collection
            logger.info(f"Opened collection for project: {project}")
            return True
        except Exception as e:
            logger.error(f"Failed to open collection: {e}")
            return False

    def close_collection(self, project: str) -> bool:
        """Close a collection."""
        if project in self.collections:
            try:
                # Zvec collections are auto-closed when dereferenced
                del self.collections[project]
                return True
            except Exception as e:
                logger.error(f"Failed to close collection: {e}")
                return False
        return True

    def destroy_collection(self, project: str) -> bool:
        """Destroy a collection and delete all data."""
        if not ZVEC_AVAILABLE:
            return False

        try:
            if project in self.collections:
                self.collections[project].destroy()
                del self.collections[project]
            return True
        except Exception as e:
            logger.error(f"Failed to destroy collection: {e}")
            return False

    def get_stats(self, project: str) -> Optional[CacheStats]:
        """Get collection statistics."""
        if not ZVEC_AVAILABLE or project not in self.collections:
            return None

        try:
            collection = self.collections[project]
            stats = collection.stats

            # Get pending uploads count
            unsynced = self.get_unsynced(project)

            return CacheStats(
                item_count=stats.doc_count,
                size_bytes=0,  # Zvec doesn't expose this directly
                last_sync_time=0,  # Would need to track separately
                pending_uploads=len(unsynced),
                index_completeness=sum(stats.index_completeness.values())
                / max(len(stats.index_completeness), 1),
            )
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return None

    # Document Operations

    def insert(self, project: str, memories: List[Memory]) -> List[str]:
        """
        Insert new memories.

        Args:
            project: Project identifier
            memories: List of memories to insert

        Returns:
            List of successfully inserted IDs
        """
        if not ZVEC_AVAILABLE or not memories:
            return []

        collection = self._get_collection(project)
        inserted_ids = []

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
                },
            )
            for m in memories
        ]

        try:
            results = collection.insert(docs)
            collection.flush()

            for m, r in zip(memories, results):
                if r.ok():
                    inserted_ids.append(m.id)
                else:
                    logger.warning(f"Failed to insert {m.id}: {r.message()}")

            return inserted_ids
        except Exception as e:
            logger.error(f"Insert failed: {e}")
            return []

    def update(self, project: str, memories: List[Memory]) -> bool:
        """Update existing memories."""
        if not ZVEC_AVAILABLE or not memories:
            return False

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
                },
            )
            for m in memories
        ]

        try:
            results = collection.update(docs)
            collection.flush()
            return all(r.ok() for r in results)
        except Exception as e:
            logger.error(f"Update failed: {e}")
            return False

    def upsert(self, project: str, memories: List[Memory]) -> List[str]:
        """Insert or update memories."""
        if not ZVEC_AVAILABLE or not memories:
            return []

        collection = self._get_collection(project)
        upserted_ids = []

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
                },
            )
            for m in memories
        ]

        try:
            results = collection.upsert(docs)
            collection.flush()

            for m, r in zip(memories, results):
                if r.ok():
                    upserted_ids.append(m.id)

            return upserted_ids
        except Exception as e:
            logger.error(f"Upsert failed: {e}")
            return []

    def delete(self, project: str, ids: List[str]) -> bool:
        """Delete memories by ID."""
        if not ZVEC_AVAILABLE or not ids:
            return False

        collection = self._get_collection(project)

        try:
            results = collection.delete(ids)
            collection.flush()
            return all(r.ok() for r in results)
        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return False

    def fetch(self, project: str, ids: List[str]) -> List[Memory]:
        """Fetch memories by ID."""
        if not ZVEC_AVAILABLE or not ids:
            return []

        collection = self._get_collection(project)

        try:
            docs_dict = collection.fetch(ids)
            memories = []

            for doc_id, doc in docs_dict.items():
                memories.append(
                    Memory(
                        id=doc.pk(),
                        content=doc.get_any("content", DataType.STRING),
                        embedding=[],  # Don't return embeddings in fetch
                        memory_type=doc.get_any("memory_type", DataType.STRING),
                        project=doc.get_any("project", DataType.STRING),
                        created_at=doc.get_any("created_at", DataType.INT64),
                        updated_at=doc.get_any("updated_at", DataType.INT64),
                        synced_at=doc.get_any("synced_at", DataType.INT64) or None,
                        memory_id=doc.get_any("memory_id", DataType.STRING) or None,
                        source=doc.get_any("source", DataType.STRING),
                    )
                )

            return memories
        except Exception as e:
            logger.error(f"Fetch failed: {e}")
            return []

    # Search Operations

    def search(self, project: str, query: SearchQuery) -> List[SearchResult]:
        """
        Vector similarity search with optional filtering.

        Args:
            project: Project identifier
            query: Search query specification

        Returns:
            List of search results sorted by relevance
        """
        if not ZVEC_AVAILABLE:
            return []

        collection = self._get_collection(project)

        try:
            vq = VectorQuery(
                field_name="embedding",
                vector=query.embedding,
                topk=query.limit,
                filter=query.filter,
                output_fields=query.output_fields
                or ["content", "memory_type", "created_at", "memory_id"],
                query_params=HnswQueryParam(ef=300),
            )

            results = collection.query(vq)

            return [
                SearchResult(
                    id=doc.pk(),
                    content=doc.get_any("content", DataType.STRING),
                    score=doc.score(),
                    memory_type=doc.get_any("memory_type", DataType.STRING),
                    created_at=doc.get_any("created_at", DataType.INT64),
                    memory_id=doc.get_any("memory_id", DataType.STRING) or None,
                )
                for doc in results
                if doc.score() >= query.min_score
            ]
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    # Sync Support

    def get_unsynced(self, project: str) -> List[Memory]:
        """Get memories that haven't been synced to Supermemory."""
        if not ZVEC_AVAILABLE or project not in self.collections:
            return []

        # Since Zvec requires a vector for queries, we need to fetch all and filter
        # This is a workaround - in production, we'd track unsynced separately
        try:
            collection = self.collections[project]
            stats = collection.stats

            if stats.doc_count == 0:
                return []

            # Fetch recent documents and filter for unsynced
            # Using a zero vector with high topk as workaround
            vq = VectorQuery(
                field_name="embedding",
                vector=[0.0] * self.dimension,
                topk=min(stats.doc_count, 1000),
                filter="source='local' AND synced_at=0",
                output_fields=[
                    "content",
                    "memory_type",
                    "created_at",
                    "updated_at",
                    "memory_id",
                    "source",
                ],
            )

            results = collection.query(vq)

            return [
                Memory(
                    id=doc.pk(),
                    content=doc.get_any("content", DataType.STRING),
                    embedding=[],
                    memory_type=doc.get_any("memory_type", DataType.STRING),
                    project=project,
                    created_at=doc.get_any("created_at", DataType.INT64),
                    updated_at=doc.get_any("updated_at", DataType.INT64),
                    synced_at=None,
                    memory_id=None,
                    source="local",
                )
                for doc in results
            ]
        except Exception as e:
            logger.error(f"Get unsynced failed: {e}")
            return []

    def mark_synced(
        self, project: str, ids: List[str], sync_time: int, memory_id: str = None
    ) -> bool:
        """Mark memories as synced with timestamp."""
        if not ZVEC_AVAILABLE or not ids:
            return False

        try:
            memories = self.fetch(project, ids)

            for m in memories:
                m.synced_at = sync_time
                if memory_id:
                    m.memory_id = memory_id
                # Need embedding for update
                m.embedding = [0.0] * self.dimension  # Placeholder

            return self.update(project, memories)
        except Exception as e:
            logger.error(f"Mark synced failed: {e}")
            return False

    def get_recent(self, project: str, limit: int = 50) -> List[Memory]:
        """Get most recent memories."""
        if not ZVEC_AVAILABLE or project not in self.collections:
            return []

        try:
            collection = self.collections[project]

            # Query with zero vector to get all, sorted by created_at
            vq = VectorQuery(
                field_name="embedding",
                vector=[0.0] * self.dimension,
                topk=limit,
                output_fields=[
                    "content",
                    "memory_type",
                    "created_at",
                    "updated_at",
                    "synced_at",
                    "memory_id",
                    "source",
                ],
            )

            results = collection.query(vq)

            memories = [
                Memory(
                    id=doc.pk(),
                    content=doc.get_any("content", DataType.STRING),
                    embedding=[],
                    memory_type=doc.get_any("memory_type", DataType.STRING),
                    project=project,
                    created_at=doc.get_any("created_at", DataType.INT64),
                    updated_at=doc.get_any("updated_at", DataType.INT64),
                    synced_at=doc.get_any("synced_at", DataType.INT64) or None,
                    memory_id=doc.get_any("memory_id", DataType.STRING) or None,
                    source=doc.get_any("source", DataType.STRING),
                )
                for doc in results
            ]

            # Sort by created_at descending
            memories.sort(key=lambda m: m.created_at, reverse=True)
            return memories[:limit]
        except Exception as e:
            logger.error(f"Get recent failed: {e}")
            return []

    def get_all(self, project: str) -> List[Memory]:
        """Get all memories for a project."""
        if not ZVEC_AVAILABLE or project not in self.collections:
            return []

        try:
            stats = self.collections[project].stats
            return self.get_recent(project, limit=stats.doc_count)
        except Exception as e:
            logger.error(f"Get all failed: {e}")
            return []
