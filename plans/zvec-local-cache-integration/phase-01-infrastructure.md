# Phase 1: Infrastructure Setup

**Status**: Pending
**Priority**: High
**Depends On**: None

---

## Overview

Set up the foundational infrastructure for Zvec integration including Python environment management, package installation, directory structure, and the Python-Node.js bridge for communication.

---

## Context Links

- [Zvec Research Report](../reports/zvec-research-report.md)
- [Main Plan](./plan.md)
- [Supermemory Package](../../packages/supermemory/)

---

## Key Insights

1. **Zvec is Python-only** - No native Node.js bindings, requires subprocess bridge
2. **Platform constraints** - Python 3.10-3.12, Linux x86_64 or macOS ARM64
3. **Embedded database** - File-based storage, no server needed
4. **Memory-mapped I/O** - Efficient for large datasets

---

## Requirements

### Functional

- Python virtual environment for Zvec dependencies
- JSON-based IPC between Node.js and Python
- Graceful fallback when Zvec unavailable (platform/Python mismatch)
- Project-scoped cache directories

### Non-Functional

- Startup time < 500ms for Python subprocess
- Memory overhead < 50MB baseline
- No user intervention for environment setup

---

## Architecture

```
packages/supermemory/
├── src/
│   ├── cache/
│   │   ├── bridge.ts          # Node.js ↔ Python IPC
│   │   ├── types.ts           # Shared types
│   │   └── platform.ts        # Platform detection
│   └── ...
├── python/
│   ├── requirements.txt       # zvec, numpy
│   ├── setup.py              # Optional: editable install
│   └── zvec_bridge/
│       ├── __init__.py
│       ├── server.py         # JSON-RPC server
│       ├── cache.py          # Zvec operations
│       └── embeddings.py     # Vector generation
└── scripts/
    └── setup-python.ts       # Auto-setup script
```

---

## Implementation Steps

### 1. Create Python Package Structure

```bash
packages/supermemory/python/
├── requirements.txt
├── zvec_bridge/
│   ├── __init__.py
│   ├── server.py
│   ├── cache.py
│   └── embeddings.py
```

### 2. Python Dependencies (requirements.txt)

```
zvec>=0.1.0
numpy>=1.24.0
```

### 3. Platform Detection (platform.ts)

```typescript
export interface PlatformInfo {
  supported: boolean;
  os: "linux" | "darwin" | "win32" | "other";
  arch: "x64" | "arm64" | "other";
  pythonPath?: string;
  pythonVersion?: string;
  reason?: string;
}

export async function detectPlatform(): Promise<PlatformInfo>;
export async function findPython(): Promise<string | null>;
export async function checkZvecSupport(): Promise<boolean>;
```

### 4. Python Bridge (bridge.ts)

```typescript
export interface BridgeConfig {
  pythonPath: string;
  scriptPath: string;
  cacheDir: string;
  timeout: number;
}

export class ZvecBridge {
  private process: ChildProcess | null = null;

  async start(): Promise<void>;
  async stop(): Promise<void>;
  async call<T>(method: string, params: unknown): Promise<T>;
  isRunning(): boolean;
}
```

### 5. JSON-RPC Server (server.py)

```python
#!/usr/bin/env python3
"""
JSON-RPC server for Zvec operations.
Communicates via stdin/stdout with Node.js parent process.
"""
import sys
import json
from zvec_bridge.cache import ZvecCache

def main():
    cache = ZvecCache()

    for line in sys.stdin:
        request = json.loads(line)
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")

        try:
            result = getattr(cache, method)(**params)
            response = {"id": request_id, "result": result}
        except Exception as e:
            response = {"id": request_id, "error": str(e)}

        print(json.dumps(response), flush=True)

if __name__ == "__main__":
    main()
```

### 6. Auto-Setup Script (setup-python.ts)

```typescript
/**
 * Automatically sets up Python environment for Zvec.
 * - Detects existing Python 3.10-3.12
 * - Creates virtual environment if needed
 * - Installs requirements
 * - Validates Zvec import
 */
export async function setupPythonEnvironment(): Promise<SetupResult>;
```

### 7. Cache Directory Structure

```
~/.dragon/
└── zvec-cache/
    ├── config.json           # Global settings
    └── {project-hash}/       # Per-project cache
        ├── collection/       # Zvec data files
        ├── metadata.json     # Project info, last sync
        └── sync.log          # Sync history
```

---

## Related Code Files

### Files to Create

- `packages/supermemory/python/requirements.txt`
- `packages/supermemory/python/zvec_bridge/__init__.py`
- `packages/supermemory/python/zvec_bridge/server.py`
- `packages/supermemory/python/zvec_bridge/cache.py`
- `packages/supermemory/python/zvec_bridge/embeddings.py`
- `packages/supermemory/src/cache/bridge.ts`
- `packages/supermemory/src/cache/types.ts`
- `packages/supermemory/src/cache/platform.ts`
- `packages/supermemory/scripts/setup-python.ts`

### Files to Modify

- `packages/supermemory/package.json` (add scripts)
- `packages/supermemory/tsconfig.json` (if needed)

---

## Todo List

- [ ] Create Python package directory structure
- [ ] Write requirements.txt with zvec and numpy
- [ ] Implement platform detection (platform.ts)
- [ ] Implement Python bridge (bridge.ts)
- [ ] Implement JSON-RPC server (server.py)
- [ ] Create auto-setup script (setup-python.ts)
- [ ] Add npm scripts for Python setup
- [ ] Write unit tests for platform detection
- [ ] Write unit tests for bridge communication
- [ ] Test on Linux x86_64
- [ ] Test on macOS ARM64
- [ ] Document fallback behavior for unsupported platforms

---

## Success Criteria

1. `pnpm --filter @dragon/supermemory setup:python` creates working environment
2. Bridge can start/stop Python subprocess
3. Bridge can send/receive JSON-RPC messages
4. Platform detection correctly identifies supported systems
5. Graceful fallback message on unsupported platforms

---

## Security Considerations

- Python subprocess runs with same permissions as parent
- No network exposure (stdin/stdout only)
- Cache directory permissions: user-only (0700)
- Input validation on JSON-RPC messages

---

## Next Steps

After this phase:
→ Phase 2: Implement ZvecCache class with full CRUD operations
