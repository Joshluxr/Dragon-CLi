"""
Zvec Bridge - Python-side implementation for local vector cache.
Communicates with Node.js via JSON-RPC over stdin/stdout.
"""

from .cache import ZvecCache
from .models import Memory, SearchQuery, SearchResult

__all__ = ["ZvecCache", "Memory", "SearchQuery", "SearchResult"]
