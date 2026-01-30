# Phase 5: Testing & Documentation

## Priority

Medium

## Status

Pending

## Description

Comprehensive testing and documentation for the Supermemory integration.

## Context Links

- [Phase 4: Skills & Commands](./phase-04-skills-commands.md)
- [Terragon Testing Patterns](../../packages/shared/src/model/thread.test.ts)

## Key Insights

- Use vitest for unit tests (consistent with existing packages)
- Mock Supermemory API calls for isolated testing
- Test hooks with simulated stdin/stdout
- Integration tests should verify full workflow

## Requirements

### Functional

- Unit tests for all utility modules
- Unit tests for client wrapper
- Integration tests for hooks
- End-to-end test for full workflow

### Non-Functional

- Test coverage > 80%
- All tests run in CI/CD
- Clear documentation for setup and usage

## Architecture

```
packages/supermemory/
├── src/
│   ├── __tests__/
│   │   ├── client.test.ts
│   │   ├── settings.test.ts
│   │   ├── container.test.ts
│   │   ├── formatter.test.ts
│   │   └── hooks/
│   │       ├── context-hook.test.ts
│   │       └── observation-hook.test.ts
│   └── __mocks__/
│       └── supermemory.ts
└── docs/
    ├── README.md
    ├── setup.md
    └── troubleshooting.md
```

## Related Code Files

### Files to Create

- `packages/supermemory/src/__tests__/client.test.ts`
- `packages/supermemory/src/__tests__/settings.test.ts`
- `packages/supermemory/src/__tests__/container.test.ts`
- `packages/supermemory/src/__tests__/formatter.test.ts`
- `packages/supermemory/src/__mocks__/supermemory.ts`
- `packages/supermemory/docs/README.md`
- `packages/supermemory/docs/setup.md`

## Implementation Steps

### Step 1: Mock Supermemory SDK (`src/__mocks__/supermemory.ts`)

```typescript
export class Supermemory {
  private memories: Map<string, any> = new Map();

  constructor(_options: { apiKey: string }) {
    // Mock constructor
  }

  async getProfile(options: {
    containerTag: string;
  }): Promise<{ memories: any[] }> {
    const memories = Array.from(this.memories.values()).filter(
      (m) => m.containerTag === options.containerTag,
    );
    return { memories };
  }

  async addMemory(
    content: string,
    containerTag: string,
    metadata: any,
  ): Promise<{ id: string }> {
    const id = `mem_${Date.now()}`;
    this.memories.set(id, { id, content, containerTag, metadata });
    return { id };
  }

  async search(
    query: string,
    options: { containerTag: string; limit: number },
  ): Promise<{ memories: any[] }> {
    const memories = Array.from(this.memories.values())
      .filter((m) => m.containerTag === options.containerTag)
      .filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
      .slice(0, options.limit)
      .map((m) => ({ ...m, similarity: 0.85 }));
    return { memories };
  }

  // For test setup
  _addTestMemory(memory: any): void {
    this.memories.set(memory.id, memory);
  }

  _clearMemories(): void {
    this.memories.clear();
  }
}
```

### Step 2: Settings Tests (`src/__tests__/settings.test.ts`)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  loadSettings,
  saveSettings,
  getApiKey,
  isDebugEnabled,
} from "../utils/settings";

vi.mock("fs");
vi.mock("os");

describe("settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/mock/home");
  });

  describe("loadSettings", () => {
    it("should return default settings when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings = loadSettings();

      expect(settings.skipTools).toEqual([]);
      expect(settings.captureTools).toEqual(["Edit", "Write", "Bash", "Task"]);
      expect(settings.maxProfileItems).toBe(50);
      expect(settings.debug).toBe(false);
    });

    it("should merge saved settings with defaults", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          skipTools: ["Read"],
          maxProfileItems: 100,
        }),
      );

      const settings = loadSettings();

      expect(settings.skipTools).toEqual(["Read"]);
      expect(settings.maxProfileItems).toBe(100);
      expect(settings.captureTools).toEqual(["Edit", "Write", "Bash", "Task"]);
    });

    it("should handle corrupted settings file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json");

      const settings = loadSettings();

      expect(settings).toEqual({
        skipTools: [],
        captureTools: ["Edit", "Write", "Bash", "Task"],
        maxProfileItems: 50,
        debug: false,
      });
    });
  });

  describe("getApiKey", () => {
    it("should return API key from environment", () => {
      process.env.SUPERMEMORY_CC_API_KEY = "sm_test_key";

      expect(getApiKey()).toBe("sm_test_key");

      delete process.env.SUPERMEMORY_CC_API_KEY;
    });

    it("should return undefined when not set", () => {
      delete process.env.SUPERMEMORY_CC_API_KEY;

      expect(getApiKey()).toBeUndefined();
    });
  });

  describe("isDebugEnabled", () => {
    it("should return true when env var is set", () => {
      process.env.SUPERMEMORY_DEBUG = "true";

      expect(isDebugEnabled()).toBe(true);

      delete process.env.SUPERMEMORY_DEBUG;
    });
  });
});
```

### Step 3: Formatter Tests (`src/__tests__/formatter.test.ts`)

```typescript
import { describe, it, expect } from "vitest";
import {
  formatContextForClaude,
  formatSearchResults,
  MemoryItem,
} from "../utils/formatter";

describe("formatter", () => {
  describe("formatContextForClaude", () => {
    it("should format memories as XML", () => {
      const memories: MemoryItem[] = [
        {
          id: "mem_1",
          content: "Test memory content",
          metadata: { type: "conversation", project: "test" },
          similarity: 0.95,
        },
      ];

      const result = formatContextForClaude(memories);

      expect(result.itemCount).toBe(1);
      expect(result.xml).toContain("<supermemory-context>");
      expect(result.xml).toContain('similarity="95%"');
      expect(result.xml).toContain("Test memory content");
    });

    it("should handle empty memories", () => {
      const result = formatContextForClaude([]);

      expect(result.itemCount).toBe(0);
      expect(result.xml).toContain("No previous memories found");
    });

    it("should respect maxItems limit", () => {
      const memories: MemoryItem[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem_${i}`,
        content: `Memory ${i}`,
      }));

      const result = formatContextForClaude(memories, 10);

      expect(result.itemCount).toBe(10);
    });

    it("should escape XML special characters", () => {
      const memories: MemoryItem[] = [
        {
          id: "mem_1",
          content: '<script>alert("xss")</script>',
        },
      ];

      const result = formatContextForClaude(memories);

      expect(result.xml).not.toContain("<script>");
      expect(result.xml).toContain("&lt;script&gt;");
    });
  });

  describe("formatSearchResults", () => {
    it("should format results with similarity scores", () => {
      const results: MemoryItem[] = [
        { id: "mem_1", content: "First result", similarity: 0.95 },
        { id: "mem_2", content: "Second result", similarity: 0.8 },
      ];

      const formatted = formatSearchResults(results, "test query");

      expect(formatted).toContain("Found 2 memories");
      expect(formatted).toContain("95% match");
      expect(formatted).toContain("80% match");
    });

    it("should truncate long content", () => {
      const longContent = "x".repeat(1000);
      const results: MemoryItem[] = [{ id: "mem_1", content: longContent }];

      const formatted = formatSearchResults(results, "test");

      expect(formatted).toContain("...");
      expect(formatted.length).toBeLessThan(longContent.length);
    });

    it("should handle no results", () => {
      const formatted = formatSearchResults([], "nonexistent");

      expect(formatted).toContain("No memories found");
      expect(formatted).toContain("nonexistent");
    });
  });
});
```

### Step 4: Client Tests (`src/__tests__/client.test.ts`)

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupermemoryClient } from "../client";

vi.mock("supermemory");

describe("SupermemoryClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPERMEMORY_CC_API_KEY = "sm_test_key";
  });

  afterEach(() => {
    delete process.env.SUPERMEMORY_CC_API_KEY;
  });

  describe("getContext", () => {
    it("should return formatted context", async () => {
      const client = new SupermemoryClient("/test/project");
      const context = await client.getContext();

      expect(context.xml).toContain("<supermemory-context>");
    });
  });

  describe("addMemory", () => {
    it("should add memory and return id", async () => {
      const client = new SupermemoryClient("/test/project");
      const id = await client.addMemory("Test content", "test");

      expect(id).toBeDefined();
      expect(id).toMatch(/^mem_/);
    });
  });

  describe("search", () => {
    it("should search and return results", async () => {
      const client = new SupermemoryClient("/test/project");

      // Add some test data first
      await client.addMemory("Test memory about authentication", "manual");

      const results = await client.search("authentication");

      expect(results).toBeInstanceOf(Array);
    });
  });

  describe("error handling", () => {
    it("should throw when API key not set", () => {
      delete process.env.SUPERMEMORY_CC_API_KEY;

      const client = new SupermemoryClient();

      expect(() => client["getClient"]()).toThrow("SUPERMEMORY_CC_API_KEY");
    });
  });
});
```

### Step 5: Documentation (`docs/README.md`)

````markdown
# @terragon/supermemory

Supermemory integration for persistent memory across Claude Code sessions.

## Features

- **Automatic Context**: Relevant memories loaded at session start
- **Session Capture**: Conversations automatically saved for future recall
- **Codebase Indexing**: Index project architecture and patterns
- **Memory Search**: Find past work with natural language queries

## Installation

The plugin is included in the Terragon monorepo.

## Configuration

### Environment Variables

```bash
# Required: Your Supermemory API key
export SUPERMEMORY_CC_API_KEY="sm_your_key_here"

# Optional: Enable debug logging
export SUPERMEMORY_DEBUG="true"

# Optional: Skip specific tools from capture
export SUPERMEMORY_SKIP_TOOLS="Read,Glob"
```
````

### Settings File

Create `~/.supermemory-claude/settings.json`:

```json
{
  "skipTools": ["Read"],
  "captureTools": ["Edit", "Write", "Bash", "Task"],
  "maxProfileItems": 50,
  "debug": false
}
```

## Usage

### Commands

- `/supermemory:index` - Index the current codebase
- `/supermemory:logout` - Clear credentials

### Skills

Use the `super-search` skill to find past work:

- "What did I work on yesterday?"
- "How did I implement authentication?"
- "Find the database migration changes"

## API

```typescript
import { SupermemoryClient } from "@terragon/supermemory";

const client = new SupermemoryClient();

// Get context for current project
const context = await client.getContext();

// Add a memory
await client.addMemory("Content to remember", "manual");

// Search memories
const results = await client.search("authentication");
```

## Troubleshooting

See [troubleshooting.md](./troubleshooting.md) for common issues.

````

### Step 6: vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/__mocks__/**', 'src/__tests__/**'],
    },
  },
});
````

## Todo List

- [ ] Create mock for supermemory SDK
- [ ] Write settings tests
- [ ] Write formatter tests
- [ ] Write container tests
- [ ] Write client tests
- [ ] Write hook integration tests
- [ ] Create README.md documentation
- [ ] Create setup.md guide
- [ ] Create troubleshooting.md
- [ ] Verify test coverage > 80%
- [ ] Add to CI/CD pipeline

## Success Criteria

- All unit tests pass
- Test coverage exceeds 80%
- Documentation is complete and accurate
- Package integrates with CI/CD

## Risk Assessment

- **Low**: Standard testing patterns
- **Medium**: Mocking external API requires careful design

## Security Considerations

- Tests should not use real API keys
- Mock data should not contain sensitive information

## Next Steps

After completing this phase:

- Deploy and monitor in staging
- Gather user feedback
- Iterate based on usage patterns
