"""
Data models for Zvec cache operations.
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any


@dataclass
class Memory:
    """Represents a cached memory item."""

    id: str
    content: str
    embedding: List[float]
    memory_type: str  # static/dynamic/conversation/observation
    project: str  # Container tag
    created_at: int  # Unix timestamp (ms)
    updated_at: int  # Last modified (ms)
    synced_at: Optional[int] = None  # Last SM sync (ms)
    memory_id: Optional[str] = None  # Supermemory ID
    source: str = "local"  # local/supermemory
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Memory":
        """Create from dictionary."""
        return cls(**data)


@dataclass
class SearchQuery:
    """Query specification for vector similarity search."""

    embedding: List[float]
    limit: int = 10
    filter: Optional[str] = None
    output_fields: Optional[List[str]] = None
    min_score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class SearchResult:
    """Result from a vector search."""

    id: str
    content: str
    score: float
    memory_type: str
    created_at: int
    memory_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class CacheStats:
    """Statistics about the cache."""

    item_count: int
    size_bytes: int
    last_sync_time: int
    pending_uploads: int
    index_completeness: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)
