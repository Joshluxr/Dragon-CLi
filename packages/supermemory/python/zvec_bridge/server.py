#!/usr/bin/env python3
"""
JSON-RPC server for Zvec operations.
Communicates via stdin/stdout with Node.js parent process.
"""

import os
import sys
import json
import logging
import traceback
from typing import Any, Dict

from .cache import ZvecCache
from .models import Memory, SearchQuery

# Configure logging to stderr (stdout is for JSON-RPC)
logging.basicConfig(
    level=logging.INFO,
    format="[ZvecBridge] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


class ZvecServer:
    """JSON-RPC server for Zvec cache operations."""

    def __init__(self, base_dir: str, dimension: int = 768):
        """Initialize the server with cache."""
        self.cache = ZvecCache(base_dir, dimension)
        logger.info(f"ZvecServer initialized with base_dir: {base_dir}")

    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a single JSON-RPC request."""
        method = request.get("method", "")
        params = request.get("params", {})
        request_id = request.get("id")

        try:
            result = self._dispatch(method, params)
            return {"id": request_id, "result": result}
        except Exception as e:
            logger.error(f"Error handling {method}: {e}")
            logger.error(traceback.format_exc())
            return {"id": request_id, "error": str(e)}

    def _dispatch(self, method: str, params: Dict[str, Any]) -> Any:
        """Dispatch method call to appropriate handler."""
        handlers = {
            # Collection management
            "open_collection": self._open_collection,
            "close_collection": self._close_collection,
            "destroy_collection": self._destroy_collection,
            "get_stats": self._get_stats,
            # Document operations
            "insert": self._insert,
            "update": self._update,
            "upsert": self._upsert,
            "delete": self._delete,
            "fetch": self._fetch,
            # Search operations
            "search": self._search,
            # Sync support
            "get_unsynced": self._get_unsynced,
            "mark_synced": self._mark_synced,
            "get_recent": self._get_recent,
            "get_all": self._get_all,
            # Utility
            "ping": self._ping,
            "shutdown": self._shutdown,
        }

        handler = handlers.get(method)
        if not handler:
            raise ValueError(f"Unknown method: {method}")

        return handler(params)

    # Collection management

    def _open_collection(self, params: Dict) -> bool:
        project = params["project"]
        return self.cache.open_collection(project)

    def _close_collection(self, params: Dict) -> bool:
        project = params["project"]
        return self.cache.close_collection(project)

    def _destroy_collection(self, params: Dict) -> bool:
        project = params["project"]
        return self.cache.destroy_collection(project)

    def _get_stats(self, params: Dict) -> Dict:
        project = params["project"]
        stats = self.cache.get_stats(project)
        return stats.to_dict() if stats else None

    # Document operations

    def _insert(self, params: Dict) -> list:
        project = params["project"]
        memories = [Memory.from_dict(m) for m in params["memories"]]
        return self.cache.insert(project, memories)

    def _update(self, params: Dict) -> bool:
        project = params["project"]
        memories = [Memory.from_dict(m) for m in params["memories"]]
        return self.cache.update(project, memories)

    def _upsert(self, params: Dict) -> list:
        project = params["project"]
        memories = [Memory.from_dict(m) for m in params["memories"]]
        return self.cache.upsert(project, memories)

    def _delete(self, params: Dict) -> bool:
        project = params["project"]
        ids = params["ids"]
        return self.cache.delete(project, ids)

    def _fetch(self, params: Dict) -> list:
        project = params["project"]
        ids = params["ids"]
        memories = self.cache.fetch(project, ids)
        return [m.to_dict() for m in memories]

    # Search operations

    def _search(self, params: Dict) -> list:
        project = params["project"]
        query_data = params["query"]
        query = SearchQuery(
            embedding=query_data["embedding"],
            limit=query_data.get("limit", 10),
            filter=query_data.get("filter"),
            output_fields=query_data.get("output_fields"),
            min_score=query_data.get("min_score", 0.0),
        )
        results = self.cache.search(project, query)
        return [r.to_dict() for r in results]

    # Sync support

    def _get_unsynced(self, params: Dict) -> list:
        project = params["project"]
        memories = self.cache.get_unsynced(project)
        return [m.to_dict() for m in memories]

    def _mark_synced(self, params: Dict) -> bool:
        project = params["project"]
        ids = params["ids"]
        sync_time = params["sync_time"]
        memory_id = params.get("memory_id")
        return self.cache.mark_synced(project, ids, sync_time, memory_id)

    def _get_recent(self, params: Dict) -> list:
        project = params["project"]
        limit = params.get("limit", 50)
        memories = self.cache.get_recent(project, limit)
        return [m.to_dict() for m in memories]

    def _get_all(self, params: Dict) -> list:
        project = params["project"]
        memories = self.cache.get_all(project)
        return [m.to_dict() for m in memories]

    # Utility

    def _ping(self, params: Dict) -> str:
        return "pong"

    def _shutdown(self, params: Dict) -> bool:
        logger.info("Shutdown requested")
        return True


def main():
    """Main entry point for the server."""
    import argparse

    parser = argparse.ArgumentParser(description="Zvec Bridge Server")
    parser.add_argument(
        "--base-dir",
        default="~/.dragon/zvec-cache",
        help="Base directory for cache storage",
    )
    parser.add_argument(
        "--dimension", type=int, default=768, help="Vector embedding dimension"
    )
    args = parser.parse_args()

    # Expand user path
    base_dir = os.path.expanduser(args.base_dir)
    os.makedirs(base_dir, exist_ok=True)

    server = ZvecServer(base_dir, args.dimension)
    logger.info("Server started, waiting for requests...")

    # Read JSON-RPC requests from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            response = server.handle_request(request)

            # Check for shutdown
            if request.get("method") == "shutdown":
                print(json.dumps(response), flush=True)
                break

            print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            error_response = {"id": None, "error": f"Invalid JSON: {e}"}
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            error_response = {"id": None, "error": f"Server error: {e}"}
            print(json.dumps(error_response), flush=True)

    logger.info("Server shutting down")


if __name__ == "__main__":
    main()
