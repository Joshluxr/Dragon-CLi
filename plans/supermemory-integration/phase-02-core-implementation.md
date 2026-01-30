# Phase 2: Core Implementation

## Priority

High

## Status

Pending

## Description

Implement the core Supermemory client wrapper and utility modules that power all hooks and commands.

## Context Links

- [Phase 1: Infrastructure Setup](./phase-01-infrastructure-setup.md)
- [supermemory SDK](https://github.com/supermemoryai/supermemory)

## Key Insights

- SupermemoryClient provides: `getProfile()`, `addMemory()`, `search()`
- Container tags identify projects/workspaces
- Settings allow customization of capture behavior
- Authentication can be via env var or interactive browser flow

## Requirements

### Functional

- Wrap Supermemory SDK with Dragon-specific logic
- Implement settings management (load/save)
- Implement container/project identification
- Implement context formatting for Claude injection
- Implement authentication flow

### Non-Functional

- Type-safe TypeScript implementation
- Comprehensive error handling
- Debug logging support
- Graceful degradation when API unavailable

## Architecture

```
src/
├── client.ts           # Supermemory client wrapper
└── utils/
    ├── settings.ts     # Settings management
    ├── container.ts    # Project/container identification
    ├── auth.ts         # Authentication flow
    └── formatter.ts    # Context formatting
```

## Related Code Files

### Files to Create

- `packages/supermemory/src/client.ts`
- `packages/supermemory/src/utils/settings.ts`
- `packages/supermemory/src/utils/container.ts`
- `packages/supermemory/src/utils/auth.ts`
- `packages/supermemory/src/utils/formatter.ts`

### Files to Reference

- `packages/utils/src/error.ts` (error handling patterns)
- `packages/shared/src/model/threads.ts` (data patterns)

## Implementation Steps

### Step 1: Settings Management (`utils/settings.ts`)

```typescript
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface SupermemorySettings {
  skipTools: string[];
  captureTools: string[];
  maxProfileItems: number;
  debug: boolean;
}

const DEFAULT_SETTINGS: SupermemorySettings = {
  skipTools: [],
  captureTools: ["Edit", "Write", "Bash", "Task"],
  maxProfileItems: 50,
  debug: false,
};

const SETTINGS_DIR = path.join(os.homedir(), ".supermemory-claude");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

export function loadSettings(): SupermemorySettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    }
  } catch (error) {
    console.error("[Supermemory] Failed to load settings:", error);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Partial<SupermemorySettings>): void {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) {
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    const current = loadSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
  } catch (error) {
    console.error("[Supermemory] Failed to save settings:", error);
  }
}

export function getApiKey(): string | undefined {
  return process.env.SUPERMEMORY_CC_API_KEY;
}

export function isDebugEnabled(): boolean {
  return process.env.SUPERMEMORY_DEBUG === "true" || loadSettings().debug;
}
```

### Step 2: Container/Project Identification (`utils/container.ts`)

```typescript
import * as path from "path";
import * as fs from "fs";

export interface ProjectInfo {
  containerTag: string;
  projectName: string;
  workingDir: string;
}

export function getProjectInfo(workingDir?: string): ProjectInfo {
  const cwd = workingDir || process.cwd();

  // Try to get project name from package.json
  const packageJsonPath = findPackageJson(cwd);
  let projectName = path.basename(cwd);

  if (packageJsonPath) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (pkg.name) {
        projectName = pkg.name;
      }
    } catch {
      // Use directory name as fallback
    }
  }

  // Container tag is based on the root directory
  const containerTag = `project:${sanitizeTag(projectName)}`;

  return {
    containerTag,
    projectName,
    workingDir: cwd,
  };
}

function findPackageJson(dir: string): string | null {
  let current = dir;
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      return pkgPath;
    }
    current = path.dirname(current);
  }
  return null;
}

function sanitizeTag(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
```

### Step 3: Context Formatter (`utils/formatter.ts`)

```typescript
export interface MemoryItem {
  id: string;
  content: string;
  metadata?: {
    type?: string;
    project?: string;
    timestamp?: string;
  };
  similarity?: number;
}

export interface FormattedContext {
  xml: string;
  itemCount: number;
}

export function formatContextForClaude(
  memories: MemoryItem[],
  maxItems: number = 50,
): FormattedContext {
  const limited = memories.slice(0, maxItems);

  if (limited.length === 0) {
    return {
      xml: "<supermemory-context>\n  <note>No previous memories found for this project.</note>\n</supermemory-context>",
      itemCount: 0,
    };
  }

  const items = limited
    .map((mem, idx) => {
      const meta = mem.metadata || {};
      const similarity = mem.similarity
        ? ` similarity="${Math.round(mem.similarity * 100)}%"`
        : "";
      return `  <memory id="${mem.id}"${similarity}>
    <type>${meta.type || "unknown"}</type>
    <content>${escapeXml(mem.content)}</content>
  </memory>`;
    })
    .join("\n");

  return {
    xml: `<supermemory-context>
${items}
</supermemory-context>`,
    itemCount: limited.length,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatSearchResults(
  results: MemoryItem[],
  query: string,
): string {
  if (results.length === 0) {
    return `No memories found for query: "${query}"`;
  }

  const formatted = results
    .map((r, i) => {
      const sim = r.similarity
        ? ` (${Math.round(r.similarity * 100)}% match)`
        : "";
      const preview =
        r.content.length > 500 ? r.content.slice(0, 500) + "..." : r.content;
      return `${i + 1}. ${preview}${sim}`;
    })
    .join("\n\n");

  return `Found ${results.length} memories:\n\n${formatted}`;
}
```

### Step 4: Client Wrapper (`client.ts`)

```typescript
import { Supermemory } from "supermemory";
import { getApiKey, isDebugEnabled, loadSettings } from "./utils/settings";
import { getProjectInfo, ProjectInfo } from "./utils/container";
import {
  formatContextForClaude,
  MemoryItem,
  FormattedContext,
} from "./utils/formatter";

export class SupermemoryClient {
  private client: Supermemory | null = null;
  private projectInfo: ProjectInfo;

  constructor(workingDir?: string) {
    this.projectInfo = getProjectInfo(workingDir);
  }

  private getClient(): Supermemory {
    if (!this.client) {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("SUPERMEMORY_CC_API_KEY environment variable not set");
      }
      this.client = new Supermemory({ apiKey });
    }
    return this.client;
  }

  async getContext(): Promise<FormattedContext> {
    try {
      const settings = loadSettings();
      const profile = await this.getClient().getProfile({
        containerTag: this.projectInfo.containerTag,
      });

      const memories: MemoryItem[] = profile.memories || [];
      return formatContextForClaude(memories, settings.maxProfileItems);
    } catch (error) {
      this.logDebug("Failed to get context:", error);
      return {
        xml: "<supermemory-context><error>Failed to load memories</error></supermemory-context>",
        itemCount: 0,
      };
    }
  }

  async addMemory(
    content: string,
    type: string = "conversation",
  ): Promise<string | null> {
    try {
      const result = await this.getClient().addMemory(
        content,
        this.projectInfo.containerTag,
        {
          type,
          project: this.projectInfo.projectName,
          timestamp: new Date().toISOString(),
        },
      );
      this.logDebug("Memory added:", result.id);
      return result.id;
    } catch (error) {
      this.logDebug("Failed to add memory:", error);
      return null;
    }
  }

  async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
    try {
      const results = await this.getClient().search(query, {
        containerTag: this.projectInfo.containerTag,
        limit,
      });
      return results.memories || [];
    } catch (error) {
      this.logDebug("Search failed:", error);
      return [];
    }
  }

  getProjectInfo(): ProjectInfo {
    return this.projectInfo;
  }

  private logDebug(...args: unknown[]): void {
    if (isDebugEnabled()) {
      console.log("[Supermemory]", ...args);
    }
  }
}
```

## Todo List

- [ ] Create utils/settings.ts
- [ ] Create utils/container.ts
- [ ] Create utils/formatter.ts
- [ ] Create utils/auth.ts
- [ ] Create client.ts
- [ ] Write unit tests for each module
- [ ] Verify TypeScript compilation
- [ ] Test with mock API responses

## Success Criteria

- All utility modules export correctly
- Client wrapper handles all API operations
- Error handling is graceful
- Debug logging works when enabled
- Unit tests pass

## Risk Assessment

- **Medium**: SDK API changes could break implementation
- **Mitigation**: Pin SDK version, implement error handling

## Security Considerations

- API key never logged even in debug mode
- Settings file has appropriate permissions

## Next Steps

After completing this phase:

- Phase 3: Hook Implementation
