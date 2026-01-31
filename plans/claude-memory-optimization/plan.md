# Claude Memory Optimization Plan

## Executive Summary

This plan enhances our `@dragon/supermemory` system by adopting key optimizations from **claude-mem** (progressive disclosure) and **PageIndex** (hierarchical reasoning-based retrieval). The combination provides:

1. **~10x token savings** via progressive disclosure (claude-mem)
2. **Better relevance** via hierarchical tree navigation (PageIndex)
3. **Hybrid search** combining semantic similarity + keyword + reasoning-based retrieval

The implementation spans 8 phases across the MCP server, supermemory package, daemon, and frontend.

## Current State Analysis

### Our System (`@dragon/supermemory`)
- **Storage**: Supermemory.ai API + Zvec local cache (hybrid)
- **Hooks**: 4 hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop)
- **Context Injection**: Full XML dump at session start via `getContext()`
- **Search**: Vector similarity (dummy embeddings currently)
- **Token Management**: None - injects all context upfront

### Claude-Mem's Approach
- **Storage**: SQLite + Chroma (fully local)
- **Hooks**: 5 hooks (adds SessionEnd)
- **Context Injection**: Progressive disclosure via MCP tools
- **Search**: Hybrid semantic + FTS5 keyword
- **Token Management**: 3-layer workflow with ~10x savings

### PageIndex's Approach (NEW)
- **Core Insight**: "Similarity ≠ Relevance" - vector similarity alone isn't enough
- **Structure**: Hierarchical tree index (like table of contents)
- **Search**: LLM reasoning-based tree navigation (inspired by AlphaGo's MCTS)
- **No Chunking**: Preserves natural document/memory structure
- **Explainability**: Traceable retrieval paths with reasoning
- **Performance**: 98.7% accuracy on FinanceBench (vs vector-based RAG)

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Claude Code Session                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────┐    ┌─────────────────────────────────────────────────────┐│
│  │   Hooks      │    │                   MCP Tools                          ││
│  │              │    │  ┌────────────┐ ┌─────────┐ ┌─────────────────────┐ ││
│  │ SessionStart │    │  │mem-search  │ │mem-get  │ │mem-tree (PageIndex) │ ││
│  │ UserPrompt   │    │  │~50-100 tok │ │~500 tok │ │reasoning navigation │ ││
│  │ PostToolUse  │    │  └────────────┘ └─────────┘ └─────────────────────┘ ││
│  │ Stop         │    │  ┌────────────┐ ┌─────────┐ ┌─────────────────────┐ ││
│  │ SessionEnd   │◄───┤  │mem-add     │ │mem-stats│ │mem-navigate         │ ││
│  │ (NEW)        │    │  └────────────┘ └─────────┘ └─────────────────────┘ ││
│  └──────────────┘    └─────────────────────────────────────────────────────┘│
│         │                                    │                               │
│         ▼                                    ▼                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      MemoryRouter (Enhanced)                           │  │
│  │  ┌───────────────┐ ┌───────────────┐ ┌────────────────────────────┐   │  │
│  │  │Token Estimator│ │Privacy Filter │ │  Embedding Engine          │   │  │
│  │  └───────────────┘ └───────────────┘ └────────────────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────────────────┐   │  │
│  │  │              Memory Tree Index (PageIndex-inspired)             │   │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   │  │
│  │  │  │  Root: Project Context                                   │   │   │  │
│  │  │  │  ├── Sessions (chronological)                            │   │   │  │
│  │  │  │  │   ├── Session 1: "Auth implementation"                │   │   │  │
│  │  │  │  │   │   ├── Decisions: JWT vs Session                   │   │   │  │
│  │  │  │  │   │   └── Observations: 15 tool calls                 │   │   │  │
│  │  │  │  │   └── Session 2: "Bug fixes"                          │   │   │  │
│  │  │  │  ├── Patterns (learned behaviors)                        │   │   │  │
│  │  │  │  │   ├── "Uses Tailwind for styling"                     │   │   │  │
│  │  │  │  │   └── "Prefers functional components"                 │   │   │  │
│  │  │  │  └── Decisions (key choices)                             │   │   │  │
│  │  │  │       └── "Database: PostgreSQL with Drizzle ORM"        │   │   │  │
│  │  │  └─────────────────────────────────────────────────────────┘   │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│         ┌────────────────────┴────────────────────┐                         │
│         ▼                                         ▼                          │
│  ┌─────────────────┐                    ┌─────────────────┐                 │
│  │   Zvec Cache    │                    │  Supermemory    │                 │
│  │   (Local)       │◄──────sync────────►│  (Remote API)   │                 │
│  │  + FTS5 Index   │                    │                 │                 │
│  │  + Tree Index   │                    │                 │                 │
│  └─────────────────┘                    └─────────────────┘                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Why PageIndex-Style Tree Navigation?

Traditional vector search has a fundamental flaw: **similarity ≠ relevance**. A memory about "React hooks" might be semantically similar to a query about "fishing hooks" but completely irrelevant.

PageIndex solves this by:
1. **Organizing memories hierarchically** (like a table of contents)
2. **Using LLM reasoning** to navigate the tree (not just similarity)
3. **Providing explainable paths** to retrieved memories

For our memory system, this means:
- Sessions are organized by topic/intent, not just timestamp
- Claude can reason: "I need auth-related memories → Sessions category → Auth implementation session"
- Retrieval decisions are traceable and debuggable

---

## Phase 1: Progressive Disclosure MCP Tools

**Goal**: Replace upfront context injection with on-demand memory retrieval.

### 1.1 Create Memory MCP Tools

**Location**: `packages/mcp-server/src/tools/memory.ts`

```typescript
// Tool definitions
export const memoryTools: ToolDefinition[] = [
  {
    name: "MemorySearch",
    description: "Search stored memories by semantic similarity or keyword. Returns compact index with IDs and summaries (~50-100 tokens per result). Use MemoryGet to fetch full details.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (natural language or keywords)"
        },
        limit: {
          type: "number",
          default: 10,
          description: "Maximum results to return"
        },
        type: {
          type: "string",
          enum: ["all", "conversation", "observation", "session-summary", "user-prompt"],
          default: "all",
          description: "Filter by memory type"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "MemoryGet",
    description: "Fetch full content for specific memory IDs (~500-1000 tokens per item). Use after MemorySearch to get details for relevant items only.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Memory IDs from MemorySearch results"
        }
      },
      required: ["ids"]
    }
  },
  {
    name: "MemoryTimeline",
    description: "Get chronological view of memories around a specific time or event (~200 tokens). Useful for understanding sequence of past work.",
    inputSchema: {
      type: "object",
      properties: {
        anchor: {
          type: "string",
          description: "Memory ID or ISO timestamp to center timeline around"
        },
        before: { type: "number", default: 5, description: "Items before anchor" },
        after: { type: "number", default: 5, description: "Items after anchor" }
      },
      required: ["anchor"]
    }
  },
  {
    name: "MemoryAdd",
    description: "Manually store important context for future sessions. Use sparingly for key decisions, patterns, or learnings.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Content to remember" },
        type: {
          type: "string",
          enum: ["conversation", "observation", "decision", "pattern"],
          default: "conversation"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for categorization"
        }
      },
      required: ["content"]
    }
  },
  {
    name: "MemoryStats",
    description: "Get memory system statistics (token usage, item counts, sync status).",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];
```

### 1.2 Create Memory Tool Handlers

**Location**: `packages/mcp-server/src/handlers/memory.ts`

```typescript
import { MemoryRouter } from "@dragon/supermemory";

// Singleton router instance per project
const routers = new Map<string, MemoryRouter>();

function getRouter(projectPath: string): MemoryRouter {
  if (!routers.has(projectPath)) {
    routers.set(projectPath, new MemoryRouter(projectPath, {
      mode: "hybrid",
      cacheEnabled: true,
      syncEnabled: true,
    }));
  }
  return routers.get(projectPath)!;
}

export async function handleMemorySearch(args: {
  query: string;
  limit?: number;
  type?: string;
}): Promise<ToolResult> {
  const router = getRouter(process.cwd());
  await router.initialize();

  const results = await router.search(args.query, args.limit || 10);

  // Filter by type if specified
  const filtered = args.type && args.type !== "all"
    ? results.filter(r => r.metadata?.type === args.type)
    : results;

  // Format as compact index with token estimates
  const index = filtered.map(r => ({
    id: r.id,
    summary: truncate(r.content, 100), // ~50-100 tokens
    type: r.metadata?.type || "unknown",
    similarity: r.similarity?.toFixed(2),
    estimatedTokens: estimateTokens(r.content),
  }));

  return {
    content: [{
      type: "text",
      text: formatSearchResults(index),
    }],
  };
}

export async function handleMemoryGet(args: { ids: string[] }): Promise<ToolResult> {
  const router = getRouter(process.cwd());
  await router.initialize();

  const memories = await router.getByIds(args.ids); // New method needed

  return {
    content: [{
      type: "text",
      text: formatFullMemories(memories),
    }],
  };
}

export async function handleMemoryTimeline(args: {
  anchor: string;
  before?: number;
  after?: number;
}): Promise<ToolResult> {
  const router = getRouter(process.cwd());
  await router.initialize();

  const timeline = await router.getTimeline(args.anchor, args.before || 5, args.after || 5);

  return {
    content: [{
      type: "text",
      text: formatTimeline(timeline),
    }],
  };
}
```

### 1.3 Register Tools in MCP Server

**Location**: `packages/mcp-server/src/tools/index.ts`

```typescript
import { memoryTools } from "./memory.ts";

export const allTools: ToolDefinition[] = [
  ...sandboxTools,
  ...memoryTools,  // Add here
  ...databaseTools,
  // ...
];
```

**Location**: `packages/mcp-server/src/handlers/index.ts`

```typescript
import { handleMemoryTool, memoryToolNames } from "./memory.js";

export async function routeToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (memoryToolNames.includes(name)) {
    return handleMemoryTool(name, args);
  }
  // ... existing routing
}
```

### 1.4 Update System Prompt for Memory Usage

**Location**: `packages/daemon/src/claude.ts`

Add memory usage guidance to system prompt:

```typescript
const systemPrompt = `Your name is Toothless and you are a coding agent that works for Dragon Labs...

## Memory System
You have access to a persistent memory system via MCP tools:
- Use MemorySearch to find relevant past context (~50-100 tokens per result)
- Use MemoryGet to retrieve full details for specific IDs (~500-1000 tokens)
- Use MemoryTimeline to see chronological context around events
- Use MemoryAdd to store important decisions or patterns for future sessions

The memory system uses progressive disclosure to save tokens. Search first, then retrieve only what you need.`;
```

---

## Phase 2: Token Estimation & Budget Management

**Goal**: Enable Claude to make informed decisions about memory retrieval.

### 2.1 Token Estimator Utility

**Location**: `packages/supermemory/src/utils/tokens.ts`

```typescript
/**
 * Estimates tokens using cl100k_base approximation (Claude's tokenizer).
 * ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // More accurate estimation based on content type
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;

  // Code tends to have more tokens per character
  const isLikelyCode = /[{}\[\]();=]/.test(text);
  const multiplier = isLikelyCode ? 0.35 : 0.25;

  return Math.ceil(charCount * multiplier);
}

/**
 * Formats token count for display.
 */
export function formatTokenEstimate(tokens: number): string {
  if (tokens < 100) return `~${tokens} tokens`;
  if (tokens < 1000) return `~${Math.round(tokens / 10) * 10} tokens`;
  return `~${(tokens / 1000).toFixed(1)}k tokens`;
}

/**
 * Token budget tracker for memory retrieval.
 */
export class TokenBudget {
  private used = 0;

  constructor(private readonly limit: number = 8000) {}

  canFit(tokens: number): boolean {
    return this.used + tokens <= this.limit;
  }

  consume(tokens: number): void {
    this.used += tokens;
  }

  remaining(): number {
    return this.limit - this.used;
  }

  summary(): string {
    return `${this.used}/${this.limit} tokens used (${this.remaining()} remaining)`;
  }
}
```

### 2.2 Integrate Token Estimates in Search Results

Update `handleMemorySearch` to include token estimates:

```typescript
const index = filtered.map(r => ({
  id: r.id,
  summary: truncate(r.content, 100),
  type: r.metadata?.type || "unknown",
  similarity: r.similarity?.toFixed(2),
  tokens: estimateTokens(r.content), // Actual token count
  tokenLabel: formatTokenEstimate(estimateTokens(r.content)),
}));

// Include total estimate at bottom
const totalTokens = filtered.reduce((sum, r) => sum + estimateTokens(r.content), 0);
const summaryTokens = index.length * 75; // ~75 tokens per summary

return {
  content: [{
    type: "text",
    text: `## Memory Search Results (${index.length} items)
Summary tokens: ~${summaryTokens}
Full retrieval tokens: ~${totalTokens}

${formatSearchResults(index)}

**Tip**: Use MemoryGet with specific IDs to retrieve full content.`,
  }],
};
```

---

## Phase 3: Privacy Tag Support

**Goal**: Allow users to exclude sensitive content from memory storage.

### 3.1 Privacy Filter Implementation

**Location**: `packages/supermemory/src/utils/privacy.ts`

```typescript
/**
 * Privacy tag patterns to detect and filter.
 */
const PRIVACY_PATTERNS = [
  /<private>[\s\S]*?<\/private>/gi,
  /<secret>[\s\S]*?<\/secret>/gi,
  /<sensitive>[\s\S]*?<\/sensitive>/gi,
  /\b(password|api_key|secret_key|access_token|bearer)\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
];

/**
 * Environment variable patterns (for .env content).
 */
const ENV_PATTERNS = [
  /^[A-Z_]+=.+$/gm, // Loose env var pattern
  /\b(DATABASE_URL|REDIS_URL|AWS_|GITHUB_TOKEN|ANTHROPIC_|OPENAI_)\w*\s*=.+/gi,
];

export interface PrivacyFilterResult {
  filtered: string;
  removedCount: number;
  warnings: string[];
}

/**
 * Filters private content from text before storing in memory.
 */
export function filterPrivateContent(text: string): PrivacyFilterResult {
  let filtered = text;
  let removedCount = 0;
  const warnings: string[] = [];

  // Remove explicit privacy tags
  for (const pattern of PRIVACY_PATTERNS) {
    const matches = filtered.match(pattern) || [];
    removedCount += matches.length;
    filtered = filtered.replace(pattern, "[REDACTED]");
  }

  // Detect potential secrets (warn but don't auto-filter)
  for (const pattern of ENV_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push("Detected potential environment variables or secrets");
      break;
    }
  }

  return { filtered, removedCount, warnings };
}

/**
 * Checks if content should be stored at all.
 */
export function shouldStore(content: string): boolean {
  // Skip entirely if marked with <private store="false">
  if (/<private\s+store\s*=\s*["']?false["']?\s*>/i.test(content)) {
    return false;
  }

  // Skip very short content (likely not useful)
  if (content.trim().length < 20) {
    return false;
  }

  return true;
}
```

### 3.2 Integrate Privacy Filter in Memory Operations

**Location**: `packages/supermemory/src/cache/router.ts`

```typescript
import { filterPrivateContent, shouldStore } from "../utils/privacy";

async addMemory(content: string, type: string = "conversation"): Promise<string | null> {
  // Check if content should be stored
  if (!shouldStore(content)) {
    return null;
  }

  // Filter private content
  const { filtered, removedCount, warnings } = filterPrivateContent(content);

  if (warnings.length > 0) {
    console.warn("[MemoryRouter] Privacy warnings:", warnings);
  }

  if (removedCount > 0) {
    console.log(`[MemoryRouter] Filtered ${removedCount} private sections`);
  }

  // Continue with filtered content
  await this.initialize();
  const localId = uuidv4();
  // ... rest of implementation using `filtered` instead of `content`
}
```

---

## Phase 4: Embedding Generation

**Goal**: Replace dummy embeddings with real semantic vectors.

### 4.1 Embedding Engine Interface

**Location**: `packages/supermemory/src/embeddings/types.ts`

```typescript
export interface EmbeddingEngine {
  /**
   * Generate embeddings for one or more texts.
   */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Get the embedding dimension.
   */
  dimension(): number;

  /**
   * Get engine name for logging.
   */
  name(): string;
}

export interface EmbeddingConfig {
  engine: "local" | "openai" | "supermemory";
  model?: string;
  apiKey?: string;
  batchSize?: number;
}
```

### 4.2 Local Embedding Engine (Transformers.js)

**Location**: `packages/supermemory/src/embeddings/local.ts`

```typescript
import { pipeline, env } from "@xenova/transformers";

// Disable local model download prompts
env.allowLocalModels = false;

let embeddingPipeline: any = null;

export class LocalEmbeddingEngine implements EmbeddingEngine {
  private model = "Xenova/all-MiniLM-L6-v2"; // 384 dimensions, fast

  async embed(texts: string[]): Promise<number[][]> {
    if (!embeddingPipeline) {
      embeddingPipeline = await pipeline("feature-extraction", this.model);
    }

    const results: number[][] = [];
    for (const text of texts) {
      const output = await embeddingPipeline(text, {
        pooling: "mean",
        normalize: true,
      });
      results.push(Array.from(output.data));
    }

    return results;
  }

  dimension(): number {
    return 384;
  }

  name(): string {
    return `local:${this.model}`;
  }
}
```

### 4.3 OpenAI Embedding Engine (Optional)

**Location**: `packages/supermemory/src/embeddings/openai.ts`

```typescript
import OpenAI from "openai";

export class OpenAIEmbeddingEngine implements EmbeddingEngine {
  private client: OpenAI;
  private model = "text-embedding-3-small"; // 1536 dimensions

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    return response.data.map(d => d.embedding);
  }

  dimension(): number {
    return 1536;
  }

  name(): string {
    return `openai:${this.model}`;
  }
}
```

### 4.4 Embedding Factory

**Location**: `packages/supermemory/src/embeddings/factory.ts`

```typescript
import { EmbeddingEngine, EmbeddingConfig } from "./types";
import { LocalEmbeddingEngine } from "./local";
import { OpenAIEmbeddingEngine } from "./openai";

export function createEmbeddingEngine(config: EmbeddingConfig): EmbeddingEngine {
  switch (config.engine) {
    case "local":
      return new LocalEmbeddingEngine();
    case "openai":
      if (!config.apiKey) {
        throw new Error("OpenAI API key required for openai embedding engine");
      }
      return new OpenAIEmbeddingEngine(config.apiKey);
    default:
      // Fallback to local
      return new LocalEmbeddingEngine();
  }
}
```

### 4.5 Integrate Embeddings in MemoryRouter

**Location**: `packages/supermemory/src/cache/router.ts`

```typescript
import { createEmbeddingEngine, EmbeddingEngine } from "../embeddings/factory";

export class MemoryRouter {
  private embeddingEngine: EmbeddingEngine | null = null;

  async initialize(): Promise<void> {
    // ... existing initialization

    // Initialize embedding engine
    try {
      this.embeddingEngine = createEmbeddingEngine({
        engine: process.env.EMBEDDING_ENGINE as any || "local",
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log(`[MemoryRouter] Embedding engine: ${this.embeddingEngine.name()}`);
    } catch (error) {
      console.warn("[MemoryRouter] Embedding initialization failed:", error);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingEngine) {
      // Fallback to dummy embedding
      return Array.from({ length: 768 }, () => Math.random() * 2 - 1);
    }

    const [embedding] = await this.embeddingEngine.embed([text]);
    return embedding;
  }
}
```

---

## Phase 5: SessionEnd Hook & Enhanced Capture

**Goal**: Better session lifecycle handling and more reliable summary capture.

### 5.1 Add SessionEnd Hook

**Location**: `packages/supermemory/src/hooks/session-end-hook.ts`

```typescript
#!/usr/bin/env node
import { SupermemoryClient } from "../client";
import { loadSettings, isDebugEnabled } from "../utils/settings";
import { filterPrivateContent } from "../utils/privacy";

interface SessionEndInput {
  session_id: string;
  transcript_path?: string;
  exit_reason?: "completed" | "error" | "interrupted";
}

async function main() {
  const input: SessionEndInput = JSON.parse(
    await readStdin()
  );

  if (!input.session_id) {
    console.error("No session_id provided");
    process.exit(0);
  }

  const settings = loadSettings();
  const client = new SupermemoryClient();

  try {
    // Read full transcript if available
    let transcript = "";
    if (input.transcript_path) {
      transcript = await fs.readFile(input.transcript_path, "utf-8");
    }

    // Extract session summary
    const summary = extractSessionSummary(transcript, input.exit_reason);

    // Filter private content
    const { filtered } = filterPrivateContent(summary);

    // Store session summary
    await client.addMemory(filtered, "session-summary");

    // Store any key decisions or patterns found
    const decisions = extractDecisions(transcript);
    for (const decision of decisions) {
      await client.addMemory(decision, "decision");
    }

    if (isDebugEnabled()) {
      console.log(`[SessionEnd] Stored summary and ${decisions.length} decisions`);
    }
  } catch (error) {
    console.error("[SessionEnd] Error:", error);
  }
}

function extractSessionSummary(transcript: string, exitReason?: string): string {
  const lines = transcript.split("\n");

  // Get first user message (intent)
  const firstUserMsg = lines.find(l => l.startsWith("User:") || l.startsWith("Human:"));

  // Get key actions (edits, writes, etc.)
  const actions = lines
    .filter(l => /\b(Edit|Write|created|modified|deleted|fixed|implemented)\b/i.test(l))
    .slice(0, 10);

  // Get last assistant message (conclusion)
  const lastAssistantMsg = lines
    .filter(l => l.startsWith("Assistant:"))
    .pop();

  return `## Session Summary
**Exit Reason**: ${exitReason || "unknown"}
**Initial Request**: ${firstUserMsg || "N/A"}

**Key Actions**:
${actions.map(a => `- ${a.substring(0, 200)}`).join("\n")}

**Conclusion**: ${lastAssistantMsg?.substring(0, 500) || "N/A"}`;
}

function extractDecisions(transcript: string): string[] {
  const decisions: string[] = [];

  // Look for decision patterns
  const decisionPatterns = [
    /decided to (.+)/gi,
    /chose (.+) because/gi,
    /the approach is (.+)/gi,
    /will use (.+) for/gi,
  ];

  for (const pattern of decisionPatterns) {
    const matches = transcript.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 20) {
        decisions.push(`Decision: ${match[1].substring(0, 300)}`);
      }
    }
  }

  return decisions.slice(0, 5); // Limit to 5 key decisions
}

main().catch(console.error);
```

### 5.2 Update Hooks Configuration

**Location**: `packages/supermemory/plugin/hooks/hooks.json`

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "command": "node dist/hooks/context-hook.cjs",
      "timeout": 30000
    },
    {
      "event": "UserPromptSubmit",
      "command": "node dist/hooks/prompt-hook.cjs",
      "timeout": 15000
    },
    {
      "event": "PostToolUse",
      "command": "node dist/hooks/observation-hook.cjs",
      "timeout": 15000,
      "tools": ["Edit", "Write", "Bash", "Task"]
    },
    {
      "event": "Stop",
      "command": "node dist/hooks/summary-hook.cjs",
      "timeout": 30000
    },
    {
      "event": "SessionEnd",
      "command": "node dist/hooks/session-end-hook.cjs",
      "timeout": 45000
    }
  ]
}
```

### 5.3 Enhanced Observation Capture

**Location**: `packages/supermemory/src/hooks/observation-hook.ts`

Add smarter filtering:

```typescript
// Skip trivial observations
function shouldCaptureObservation(tool: string, result: string): boolean {
  // Skip read-only operations
  if (tool === "Read" || tool === "Glob" || tool === "Grep") {
    return false;
  }

  // Skip empty or error results
  if (!result || result.length < 50) {
    return false;
  }

  // Skip common noise
  const noisePatterns = [
    /^error: /i,
    /^warning: /i,
    /no files found/i,
    /permission denied/i,
  ];

  for (const pattern of noisePatterns) {
    if (pattern.test(result)) {
      return false;
    }
  }

  return true;
}

// Summarize long observations
function summarizeObservation(tool: string, result: string): string {
  if (result.length <= 500) {
    return result;
  }

  // For file edits, capture the key change
  if (tool === "Edit" || tool === "Write") {
    return `${tool}: ${result.substring(0, 200)}...[${result.length} chars total]`;
  }

  // For bash, capture command and first/last lines of output
  if (tool === "Bash") {
    const lines = result.split("\n");
    if (lines.length > 10) {
      return [
        ...lines.slice(0, 5),
        `... [${lines.length - 10} lines omitted] ...`,
        ...lines.slice(-5),
      ].join("\n");
    }
  }

  return result.substring(0, 500) + "...";
}
```

---

## Phase 6: FTS5 Keyword Search

**Goal**: Add keyword search fallback for exact matches.

### 6.1 Add SQLite FTS5 Index

**Location**: `packages/supermemory/python/zvec_bridge/fts.py`

```python
import sqlite3
from pathlib import Path

class FTS5Index:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self._create_tables()

    def _create_tables(self):
        self.conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                memory_id,
                content,
                memory_type,
                tokenize='porter unicode61'
            )
        """)
        self.conn.commit()

    def index(self, memory_id: str, content: str, memory_type: str):
        self.conn.execute(
            "INSERT INTO memory_fts (memory_id, content, memory_type) VALUES (?, ?, ?)",
            (memory_id, content, memory_type)
        )
        self.conn.commit()

    def search(self, query: str, limit: int = 10) -> list[dict]:
        cursor = self.conn.execute("""
            SELECT memory_id, snippet(memory_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                   memory_type, bm25(memory_fts) as score
            FROM memory_fts
            WHERE memory_fts MATCH ?
            ORDER BY bm25(memory_fts)
            LIMIT ?
        """, (query, limit))

        return [
            {"id": row[0], "snippet": row[1], "type": row[2], "score": row[3]}
            for row in cursor.fetchall()
        ]

    def delete(self, memory_id: str):
        self.conn.execute("DELETE FROM memory_fts WHERE memory_id = ?", (memory_id,))
        self.conn.commit()
```

### 6.2 Hybrid Search in MemoryRouter

**Location**: `packages/supermemory/src/cache/router.ts`

```typescript
async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
  await this.initialize();

  const results: MemoryItem[] = [];
  const seenIds = new Set<string>();

  // 1. Vector search (semantic similarity)
  const vectorResults = await this.vectorSearch(query, limit);
  for (const r of vectorResults) {
    results.push(r);
    seenIds.add(r.id);
  }

  // 2. FTS5 keyword search (exact matches)
  const keywordResults = await this.keywordSearch(query, limit);
  for (const r of keywordResults) {
    if (!seenIds.has(r.id)) {
      results.push(r);
      seenIds.add(r.id);
    }
  }

  // 3. Supermemory remote search (if not enough local results)
  if (results.length < limit && this.config.mode !== "cache-only") {
    const remoteResults = await this.supermemory.search(query, limit);
    for (const r of remoteResults) {
      if (!seenIds.has(r.id)) {
        results.push(r);
      }
    }
  }

  // Dedupe, sort, and limit
  return results
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit);
}

private async keywordSearch(query: string, limit: number): Promise<MemoryItem[]> {
  if (!this.zvecBridge) return [];

  try {
    const results = await this.zvecBridge.ftsSearch(
      this.projectInfo.containerTag,
      query,
      limit
    );

    return results.map(r => ({
      id: r.id,
      content: r.snippet,
      metadata: { type: r.type },
      similarity: Math.abs(r.score) / 10, // Normalize BM25 score
    }));
  } catch (error) {
    console.warn("[MemoryRouter] FTS search failed:", error);
    return [];
  }
}
```

---

## Phase 7: Remove Upfront Context Injection

**Goal**: Transition from full injection to progressive disclosure.

### 7.1 Update Context Hook

**Location**: `packages/supermemory/src/hooks/context-hook.ts`

Replace full injection with minimal guidance:

```typescript
async function main() {
  const settings = loadSettings();

  // Instead of injecting all memories, just inform Claude about the memory system
  const guidance = `<system-reminder>
## Memory System Available

You have access to a persistent memory system via MCP tools:
- **MemorySearch**: Find relevant past context (~50-100 tokens per result)
- **MemoryGet**: Retrieve full details for specific IDs (~500-1000 tokens)
- **MemoryTree**: View hierarchical memory structure for reasoning-based navigation
- **MemoryNavigate**: Drill into specific tree nodes
- **MemoryTimeline**: See chronological context around events
- **MemoryAdd**: Store important decisions for future sessions

Use progressive disclosure: search first, then retrieve only what you need.
This saves tokens compared to loading all memories upfront.

**Quick start**: If this project looks unfamiliar, try:
\`MemoryTree\` to see the memory hierarchy, then navigate to relevant sections.
</system-reminder>`;

  console.log(guidance);
}
```

### 7.2 Feature Flag for Gradual Rollout

**Location**: `packages/shared/src/model/feature-flags-definitions.ts`

```typescript
export const featureFlagsDefinitions = {
  // ... existing flags

  memoryProgressiveDisclosure: {
    defaultValue: false,
    description: "Use progressive disclosure for memory instead of upfront injection",
  },

  memoryMcpTools: {
    defaultValue: false,
    description: "Enable MCP tools for memory search/retrieval",
  },

  memoryTreeNavigation: {
    defaultValue: false,
    description: "Enable PageIndex-style tree navigation for memory retrieval",
  },
} satisfies Record<string, FeatureFlagDefinition>;
```

---

## Phase 8: PageIndex-Style Hierarchical Memory Tree (NEW)

**Goal**: Implement reasoning-based retrieval using hierarchical tree structure.

### 8.1 Memory Tree Schema

**Location**: `packages/supermemory/src/tree/types.ts`

```typescript
/**
 * PageIndex-inspired memory tree structure.
 * Enables LLM reasoning-based navigation instead of pure similarity search.
 */

export interface MemoryTreeNode {
  id: string;
  title: string;
  summary: string;                    // LLM-generated summary (~50 tokens)
  type: "root" | "category" | "session" | "topic" | "memory";

  // Hierarchy
  parentId: string | null;
  children: MemoryTreeNode[];
  depth: number;

  // Content bounds (for leaf nodes)
  memoryIds?: string[];               // IDs of memories in this node
  memoryCount: number;
  tokenEstimate: number;              // Estimated tokens if fully expanded

  // Temporal info
  startTime?: string;                 // ISO timestamp
  endTime?: string;

  // Metadata
  tags?: string[];
  relevanceHints?: string[];          // Keywords that indicate relevance
}

export interface MemoryTree {
  root: MemoryTreeNode;
  version: number;
  lastUpdated: string;
  totalMemories: number;
  totalTokens: number;
}

/**
 * Tree navigation result with reasoning trace.
 */
export interface TreeNavigationResult {
  path: string[];                     // Node IDs from root to target
  reasoning: string;                  // LLM's reasoning for this path
  node: MemoryTreeNode;
  memories?: MemoryItem[];            // Populated if leaf node
}
```

### 8.2 Memory Tree Builder

**Location**: `packages/supermemory/src/tree/builder.ts`

```typescript
import { MemoryTree, MemoryTreeNode } from "./types";
import { MemoryItem } from "../utils/formatter";
import { estimateTokens } from "../utils/tokens";

/**
 * Builds a hierarchical tree from flat memories.
 *
 * Structure:
 * - Root
 *   - Sessions (by time period)
 *     - Session 1: "User request summary"
 *       - Decisions
 *       - Observations
 *   - Patterns (learned behaviors)
 *   - Key Decisions (important choices)
 *   - Project Context (static info)
 */
export class MemoryTreeBuilder {
  private memories: MemoryItem[] = [];

  constructor(memories: MemoryItem[]) {
    this.memories = memories;
  }

  async build(): Promise<MemoryTree> {
    const root = this.createRootNode();

    // Group memories by type and session
    const sessions = this.groupBySession();
    const patterns = this.extractPatterns();
    const decisions = this.extractDecisions();
    const context = this.extractContext();

    // Build session nodes
    const sessionsNode = this.createCategoryNode("sessions", "Sessions", "Chronological session history");
    for (const [sessionId, sessionMemories] of sessions) {
      const sessionNode = await this.buildSessionNode(sessionId, sessionMemories);
      sessionsNode.children.push(sessionNode);
    }
    sessionsNode.memoryCount = sessionsNode.children.reduce((sum, c) => sum + c.memoryCount, 0);
    root.children.push(sessionsNode);

    // Build pattern nodes
    if (patterns.length > 0) {
      const patternsNode = this.createCategoryNode("patterns", "Learned Patterns", "Coding preferences and behaviors");
      patternsNode.memoryIds = patterns.map(p => p.id);
      patternsNode.memoryCount = patterns.length;
      patternsNode.tokenEstimate = patterns.reduce((sum, p) => sum + estimateTokens(p.content), 0);
      root.children.push(patternsNode);
    }

    // Build decisions node
    if (decisions.length > 0) {
      const decisionsNode = this.createCategoryNode("decisions", "Key Decisions", "Important architectural and design choices");
      decisionsNode.memoryIds = decisions.map(d => d.id);
      decisionsNode.memoryCount = decisions.length;
      decisionsNode.tokenEstimate = decisions.reduce((sum, d) => sum + estimateTokens(d.content), 0);
      root.children.push(decisionsNode);
    }

    // Build context node
    if (context.length > 0) {
      const contextNode = this.createCategoryNode("context", "Project Context", "Static project information");
      contextNode.memoryIds = context.map(c => c.id);
      contextNode.memoryCount = context.length;
      contextNode.tokenEstimate = context.reduce((sum, c) => sum + estimateTokens(c.content), 0);
      root.children.push(contextNode);
    }

    // Calculate totals
    root.memoryCount = this.memories.length;
    root.tokenEstimate = this.memories.reduce((sum, m) => sum + estimateTokens(m.content), 0);

    return {
      root,
      version: 1,
      lastUpdated: new Date().toISOString(),
      totalMemories: this.memories.length,
      totalTokens: root.tokenEstimate,
    };
  }

  private createRootNode(): MemoryTreeNode {
    return {
      id: "root",
      title: "Memory Index",
      summary: "Hierarchical index of all stored memories",
      type: "root",
      parentId: null,
      children: [],
      depth: 0,
      memoryCount: 0,
      tokenEstimate: 0,
    };
  }

  private createCategoryNode(id: string, title: string, summary: string): MemoryTreeNode {
    return {
      id,
      title,
      summary,
      type: "category",
      parentId: "root",
      children: [],
      depth: 1,
      memoryCount: 0,
      tokenEstimate: 0,
    };
  }

  private groupBySession(): Map<string, MemoryItem[]> {
    const sessions = new Map<string, MemoryItem[]>();

    for (const memory of this.memories) {
      const sessionId = memory.metadata?.sessionId || "unknown";
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, []);
      }
      sessions.get(sessionId)!.push(memory);
    }

    return sessions;
  }

  private async buildSessionNode(sessionId: string, memories: MemoryItem[]): Promise<MemoryTreeNode> {
    // Extract session summary from memories
    const summaryMemory = memories.find(m => m.metadata?.type === "session-summary");
    const title = summaryMemory?.content.substring(0, 50) || `Session ${sessionId.substring(0, 8)}`;

    // Group by type within session
    const decisions = memories.filter(m => m.metadata?.type === "decision");
    const observations = memories.filter(m => m.metadata?.type === "observation" || m.metadata?.type === "tool-observation");
    const prompts = memories.filter(m => m.metadata?.type === "user-prompt");

    const node: MemoryTreeNode = {
      id: `session-${sessionId}`,
      title,
      summary: summaryMemory?.content.substring(0, 100) || "Session details",
      type: "session",
      parentId: "sessions",
      children: [],
      depth: 2,
      memoryCount: memories.length,
      tokenEstimate: memories.reduce((sum, m) => sum + estimateTokens(m.content), 0),
      memoryIds: memories.map(m => m.id),
      startTime: memories[0]?.metadata?.timestamp,
      endTime: memories[memories.length - 1]?.metadata?.timestamp,
    };

    // Add sub-nodes for decisions and observations if substantial
    if (decisions.length > 2) {
      node.children.push({
        id: `${node.id}-decisions`,
        title: "Decisions",
        summary: `${decisions.length} decisions made`,
        type: "topic",
        parentId: node.id,
        children: [],
        depth: 3,
        memoryCount: decisions.length,
        tokenEstimate: decisions.reduce((sum, d) => sum + estimateTokens(d.content), 0),
        memoryIds: decisions.map(d => d.id),
      });
    }

    if (observations.length > 5) {
      node.children.push({
        id: `${node.id}-observations`,
        title: "Tool Observations",
        summary: `${observations.length} tool results captured`,
        type: "topic",
        parentId: node.id,
        children: [],
        depth: 3,
        memoryCount: observations.length,
        tokenEstimate: observations.reduce((sum, o) => sum + estimateTokens(o.content), 0),
        memoryIds: observations.map(o => o.id),
      });
    }

    return node;
  }

  private extractPatterns(): MemoryItem[] {
    return this.memories.filter(m => m.metadata?.type === "pattern");
  }

  private extractDecisions(): MemoryItem[] {
    return this.memories.filter(m => m.metadata?.type === "decision");
  }

  private extractContext(): MemoryItem[] {
    return this.memories.filter(m =>
      m.metadata?.type === "static" ||
      m.metadata?.type === "context" ||
      m.metadata?.type === "project-info"
    );
  }
}
```

### 8.3 LLM-Guided Tree Navigation

**Location**: `packages/supermemory/src/tree/navigator.ts`

```typescript
import { MemoryTree, MemoryTreeNode, TreeNavigationResult } from "./types";
import { MemoryItem } from "../utils/formatter";

/**
 * PageIndex-inspired tree navigation using LLM reasoning.
 *
 * Instead of vector similarity, we present the tree structure to Claude
 * and ask it to reason about which branches are most relevant.
 */
export class TreeNavigator {
  private tree: MemoryTree;

  constructor(tree: MemoryTree) {
    this.tree = tree;
  }

  /**
   * Format tree for Claude to reason about.
   * Shows structure with summaries and token estimates.
   */
  formatTreeForReasoning(maxDepth: number = 3): string {
    const lines: string[] = [];
    lines.push("## Memory Tree Index");
    lines.push("");
    lines.push(`Total: ${this.tree.totalMemories} memories (~${this.tree.totalTokens} tokens)`);
    lines.push("");

    this.formatNode(this.tree.root, lines, 0, maxDepth);

    lines.push("");
    lines.push("Use `MemoryNavigate node_id=\"<id>\"` to explore a branch.");
    lines.push("Use `MemoryGet ids=[...]` to retrieve specific memories.");

    return lines.join("\n");
  }

  private formatNode(node: MemoryTreeNode, lines: string[], depth: number, maxDepth: number): void {
    if (depth > maxDepth) return;

    const indent = "  ".repeat(depth);
    const tokenLabel = node.tokenEstimate > 1000
      ? `~${(node.tokenEstimate / 1000).toFixed(1)}k tokens`
      : `~${node.tokenEstimate} tokens`;

    if (node.type === "root") {
      // Skip root label, just show children
    } else {
      lines.push(`${indent}- **[${node.id}]** ${node.title}`);
      lines.push(`${indent}  ${node.summary} (${node.memoryCount} items, ${tokenLabel})`);
    }

    for (const child of node.children) {
      this.formatNode(child, lines, depth + 1, maxDepth);
    }
  }

  /**
   * Navigate to a specific node and return its details.
   */
  navigate(nodeId: string): TreeNavigationResult | null {
    const path: string[] = [];
    const node = this.findNode(this.tree.root, nodeId, path);

    if (!node) {
      return null;
    }

    return {
      path,
      reasoning: `Navigated to ${node.title}`,
      node,
    };
  }

  private findNode(current: MemoryTreeNode, targetId: string, path: string[]): MemoryTreeNode | null {
    path.push(current.id);

    if (current.id === targetId) {
      return current;
    }

    for (const child of current.children) {
      const found = this.findNode(child, targetId, path);
      if (found) return found;
    }

    path.pop();
    return null;
  }

  /**
   * Get expanded view of a node with its children's details.
   */
  expandNode(nodeId: string): string {
    const result = this.navigate(nodeId);
    if (!result) {
      return `Node "${nodeId}" not found.`;
    }

    const { node, path } = result;
    const lines: string[] = [];

    lines.push(`## ${node.title}`);
    lines.push(`Path: ${path.join(" → ")}`);
    lines.push(`${node.summary}`);
    lines.push("");

    if (node.memoryIds && node.memoryIds.length > 0) {
      lines.push(`**Contains ${node.memoryIds.length} memories** (~${node.tokenEstimate} tokens)`);
      lines.push(`Use \`MemoryGet ids=${JSON.stringify(node.memoryIds.slice(0, 5))}\` to retrieve.`);
    }

    if (node.children.length > 0) {
      lines.push("");
      lines.push("**Sub-sections:**");
      for (const child of node.children) {
        const tokenLabel = child.tokenEstimate > 1000
          ? `~${(child.tokenEstimate / 1000).toFixed(1)}k tokens`
          : `~${child.tokenEstimate} tokens`;
        lines.push(`- **[${child.id}]** ${child.title} (${child.memoryCount} items, ${tokenLabel})`);
        lines.push(`  ${child.summary}`);
      }
    }

    return lines.join("\n");
  }
}
```

### 8.4 Tree-Based MCP Tools

**Location**: `packages/mcp-server/src/tools/memory.ts` (additions)

```typescript
// Add to existing memoryTools array:

{
  name: "MemoryTree",
  description: "View the hierarchical memory index. Use this to understand what memories exist and reason about which branches to explore. More effective than keyword search for complex queries.",
  inputSchema: {
    type: "object",
    properties: {
      maxDepth: {
        type: "number",
        default: 2,
        description: "Maximum tree depth to display (1-4)"
      }
    }
  }
},
{
  name: "MemoryNavigate",
  description: "Navigate to a specific node in the memory tree and see its contents/children. Use after MemoryTree to drill into relevant sections.",
  inputSchema: {
    type: "object",
    properties: {
      nodeId: {
        type: "string",
        description: "The node ID from MemoryTree output (e.g., 'sessions', 'session-abc123', 'decisions')"
      }
    },
    required: ["nodeId"]
  }
}
```

### 8.5 Tree-Based Tool Handlers

**Location**: `packages/mcp-server/src/handlers/memory.ts` (additions)

```typescript
import { MemoryTreeBuilder } from "@dragon/supermemory/tree/builder";
import { TreeNavigator } from "@dragon/supermemory/tree/navigator";

// Cache tree per project
const treeCache = new Map<string, { tree: MemoryTree; navigator: TreeNavigator; timestamp: number }>();
const TREE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTreeNavigator(projectPath: string): Promise<TreeNavigator> {
  const cached = treeCache.get(projectPath);
  if (cached && Date.now() - cached.timestamp < TREE_CACHE_TTL) {
    return cached.navigator;
  }

  const router = getRouter(projectPath);
  await router.initialize();

  // Get all memories to build tree
  const memories = await router.getAllMemories();

  const builder = new MemoryTreeBuilder(memories);
  const tree = await builder.build();
  const navigator = new TreeNavigator(tree);

  treeCache.set(projectPath, { tree, navigator, timestamp: Date.now() });

  return navigator;
}

export async function handleMemoryTree(args: { maxDepth?: number }): Promise<ToolResult> {
  const navigator = await getTreeNavigator(process.cwd());
  const formatted = navigator.formatTreeForReasoning(args.maxDepth || 2);

  return {
    content: [{
      type: "text",
      text: formatted,
    }],
  };
}

export async function handleMemoryNavigate(args: { nodeId: string }): Promise<ToolResult> {
  const navigator = await getTreeNavigator(process.cwd());
  const expanded = navigator.expandNode(args.nodeId);

  return {
    content: [{
      type: "text",
      text: expanded,
    }],
  };
}
```

### 8.6 Hybrid Retrieval Strategy

**Location**: `packages/supermemory/src/cache/router.ts` (enhancement)

```typescript
/**
 * Enhanced search combining:
 * 1. Vector similarity (semantic)
 * 2. FTS5 keyword (exact match)
 * 3. Tree navigation (reasoning-based)
 *
 * The tree provides the "map" - Claude can reason about where to look.
 * Vector/FTS provide the "search" - quick similarity-based retrieval.
 */
async hybridSearch(
  query: string,
  options: {
    limit?: number;
    useVector?: boolean;
    useKeyword?: boolean;
    treeNodeHint?: string;  // Optional: limit search to specific tree branch
  } = {}
): Promise<MemoryItem[]> {
  const {
    limit = 10,
    useVector = true,
    useKeyword = true,
    treeNodeHint,
  } = options;

  await this.initialize();

  const results: MemoryItem[] = [];
  const seenIds = new Set<string>();

  // If tree node hint provided, filter to that branch first
  let candidateIds: Set<string> | null = null;
  if (treeNodeHint) {
    const tree = await this.getTree();
    const navigator = new TreeNavigator(tree);
    const navResult = navigator.navigate(treeNodeHint);
    if (navResult?.node.memoryIds) {
      candidateIds = new Set(navResult.node.memoryIds);
    }
  }

  // 1. Vector search
  if (useVector) {
    const vectorResults = await this.vectorSearch(query, limit * 2);
    for (const r of vectorResults) {
      if (candidateIds && !candidateIds.has(r.id)) continue;
      if (!seenIds.has(r.id)) {
        results.push(r);
        seenIds.add(r.id);
      }
    }
  }

  // 2. Keyword search
  if (useKeyword) {
    const keywordResults = await this.keywordSearch(query, limit * 2);
    for (const r of keywordResults) {
      if (candidateIds && !candidateIds.has(r.id)) continue;
      if (!seenIds.has(r.id)) {
        results.push(r);
        seenIds.add(r.id);
      }
    }
  }

  // Sort by relevance and limit
  return results
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit);
}
```

### 8.7 Auto-Categorization on Memory Add

**Location**: `packages/supermemory/src/tree/categorizer.ts`

```typescript
/**
 * Automatically categorizes memories into the tree structure.
 * Uses heuristics + optional LLM classification.
 */

export interface CategorizationResult {
  category: "session" | "pattern" | "decision" | "context" | "observation";
  sessionId?: string;
  confidence: number;
  tags: string[];
}

export function categorizeMemory(content: string, type: string): CategorizationResult {
  // Heuristic-based categorization

  // Decision patterns
  if (/\b(decided|chose|selected|will use|approach is)\b/i.test(content)) {
    return {
      category: "decision",
      confidence: 0.8,
      tags: extractTags(content),
    };
  }

  // Pattern detection
  if (/\b(always|usually|prefer|convention|standard)\b/i.test(content)) {
    return {
      category: "pattern",
      confidence: 0.7,
      tags: extractTags(content),
    };
  }

  // Context/static info
  if (/\b(project|repository|codebase|architecture|structure)\b/i.test(content)) {
    return {
      category: "context",
      confidence: 0.6,
      tags: extractTags(content),
    };
  }

  // Default to observation for tool outputs
  if (type === "tool-observation" || type === "observation") {
    return {
      category: "observation",
      confidence: 0.9,
      tags: extractTags(content),
    };
  }

  // Fallback
  return {
    category: "session",
    confidence: 0.5,
    tags: extractTags(content),
  };
}

function extractTags(content: string): string[] {
  const tags: string[] = [];

  // Extract technology mentions
  const techPatterns = [
    /\b(React|Vue|Angular|Next\.js|TypeScript|JavaScript|Python|Rust|Go)\b/gi,
    /\b(PostgreSQL|MySQL|MongoDB|Redis|Drizzle|Prisma)\b/gi,
    /\b(Tailwind|CSS|SCSS|styled-components)\b/gi,
    /\b(API|REST|GraphQL|gRPC|WebSocket)\b/gi,
  ];

  for (const pattern of techPatterns) {
    const matches = content.match(pattern) || [];
    tags.push(...matches.map(m => m.toLowerCase()));
  }

  return [...new Set(tags)].slice(0, 10);
}
```

---

## Implementation Order

### Week 1-2: Foundation
1. **Phase 1.1-1.3**: Create MCP tools for memory (MemorySearch, MemoryGet, MemoryTimeline)
2. **Phase 2**: Add token estimation utilities

### Week 2-3: Privacy & Quality
3. **Phase 3**: Implement privacy filtering
4. **Phase 5.3**: Enhance observation capture

### Week 3-4: Search Quality
5. **Phase 4**: Implement real embedding generation
6. **Phase 6**: Add FTS5 keyword search

### Week 4-5: Tree Navigation (PageIndex)
7. **Phase 8.1-8.3**: Memory tree schema, builder, and navigator
8. **Phase 8.4-8.5**: Tree-based MCP tools (MemoryTree, MemoryNavigate)
9. **Phase 8.6-8.7**: Hybrid retrieval and auto-categorization

### Week 5-6: Lifecycle & Integration
10. **Phase 5.1-5.2**: Add SessionEnd hook
11. **Phase 7**: Transition to progressive disclosure (behind feature flag)

### Week 6-7: Testing & Rollout
12. Comprehensive testing (unit, integration, E2E)
13. A/B testing: tree nav vs vector-only vs hybrid
14. Gradual rollout via feature flags
15. Documentation updates

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Memory tokens per session | ~2000-5000 (upfront) | ~200-500 (on-demand) |
| Search relevance (MRR@10) | Unknown | >0.8 |
| Session start latency | ~3-5s | <1s |
| Memory recall accuracy | Unknown | >85% |
| Tree navigation success | N/A | >90% reach relevant node |

---

## Files to Create/Modify

### New Files (Phase 1-7 - claude-mem inspired)
- `packages/mcp-server/src/tools/memory.ts`
- `packages/mcp-server/src/handlers/memory.ts`
- `packages/supermemory/src/utils/tokens.ts`
- `packages/supermemory/src/utils/privacy.ts`
- `packages/supermemory/src/embeddings/types.ts`
- `packages/supermemory/src/embeddings/local.ts`
- `packages/supermemory/src/embeddings/openai.ts`
- `packages/supermemory/src/embeddings/factory.ts`
- `packages/supermemory/src/hooks/session-end-hook.ts`
- `packages/supermemory/python/zvec_bridge/fts.py`

### New Files (Phase 8 - PageIndex inspired)
- `packages/supermemory/src/tree/types.ts`
- `packages/supermemory/src/tree/builder.ts`
- `packages/supermemory/src/tree/navigator.ts`
- `packages/supermemory/src/tree/categorizer.ts`
- `packages/supermemory/src/tree/index.ts`

### Modified Files
- `packages/mcp-server/src/tools/index.ts`
- `packages/mcp-server/src/handlers/index.ts`
- `packages/supermemory/src/cache/router.ts`
- `packages/supermemory/src/hooks/context-hook.ts`
- `packages/supermemory/src/hooks/observation-hook.ts`
- `packages/supermemory/plugin/hooks/hooks.json`
- `packages/daemon/src/claude.ts`
- `packages/shared/src/model/feature-flags-definitions.ts`

---

## Risk Mitigation

1. **Backward Compatibility**: Use feature flags for gradual rollout
2. **API Dependency**: Local embedding engine as fallback
3. **Performance**: Cache warmed on session start
4. **Privacy**: Explicit filtering before storage
5. **Token Budget**: Clear estimates shown to Claude
6. **Tree Staleness**: Rebuild tree on significant memory additions
7. **LLM Reasoning Errors**: Fallback to vector search if tree navigation fails

---

## Testing Strategy

1. **Unit Tests**: Token estimation, privacy filtering, embedding generation, tree building
2. **Integration Tests**: MCP tool handlers, search quality, tree navigation
3. **E2E Tests**: Full session with memory retrieval via tree + vector hybrid
4. **Load Tests**: Cache performance with large memory sets, tree with 1000+ nodes
5. **A/B Tests**: Tree navigation vs vector-only vs hybrid approach
6. **Relevance Tests**: Compare retrieval quality across methods using golden test set

---

## How It All Works Together

### Memory Flow (Write Path)

```
User Action / Tool Result
         │
         ▼
   PostToolUse Hook ────► Privacy Filter ────► Categorizer
         │                                         │
         │                        ┌────────────────┘
         ▼                        ▼
   MemoryRouter.addMemory() ◄─── Auto-tags & category
         │
         ├──────────────────┬─────────────────────┐
         ▼                  ▼                     ▼
    Zvec Cache         FTS5 Index           Tree Index
    (vectors)          (keywords)          (hierarchy)
         │                  │                     │
         └──────────────────┼─────────────────────┘
                            ▼
                    Supermemory API
                    (remote backup)
```

### Memory Flow (Read Path - Progressive Disclosure)

```
Claude needs context
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Option A: MemoryTree (PageIndex-style)             │
│  "Show me the memory hierarchy"                     │
│                                                     │
│  Returns: ~200 tokens                               │
│  ┌──────────────────────────────────────────────┐  │
│  │ Memory Index                                  │  │
│  │ ├── Sessions (45 items, ~12k tokens)         │  │
│  │ │   ├── [session-abc] Auth implementation    │  │
│  │ │   └── [session-def] Bug fixes              │  │
│  │ ├── Patterns (8 items, ~2k tokens)           │  │
│  │ └── Decisions (12 items, ~3k tokens)         │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  Claude reasons: "I need auth details"             │
│         │                                          │
│         ▼                                          │
│  MemoryNavigate node_id="session-abc"              │
│  Returns: ~100 tokens with memory IDs              │
│         │                                          │
│         ▼                                          │
│  MemoryGet ids=["mem-123", "mem-456"]              │
│  Returns: ~800 tokens (full content)               │
│                                                     │
│  Total: ~1100 tokens (vs ~12000 upfront)           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Option B: MemorySearch (claude-mem style)          │
│  "Search for authentication"                        │
│                                                     │
│  Returns: ~300 tokens (compact index)               │
│  ┌──────────────────────────────────────────────┐  │
│  │ Results:                                      │  │
│  │ - [mem-123] JWT token setup... (~400 tok)    │  │
│  │ - [mem-456] Auth middleware... (~350 tok)    │  │
│  │ - [mem-789] Password hashing... (~280 tok)   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  Claude picks relevant IDs                          │
│         │                                          │
│         ▼                                          │
│  MemoryGet ids=["mem-123", "mem-456"]              │
│  Returns: ~750 tokens                               │
│                                                     │
│  Total: ~1050 tokens                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Option C: Hybrid (Tree + Search)                   │
│                                                     │
│  1. MemoryTree → Identify relevant branch           │
│  2. MemorySearch with treeNodeHint → Focused search │
│  3. MemoryGet → Retrieve specific items             │
│                                                     │
│  Best of both: Structure + Similarity               │
└─────────────────────────────────────────────────────┘
```

### Why This Design is Better

| Approach | Tokens | Relevance | Explainability |
|----------|--------|-----------|----------------|
| **Current (upfront)** | ~5000 | Medium | None |
| **Vector-only** | ~500 | Medium-High | Low |
| **Tree-only** | ~500 | High | High |
| **Hybrid (recommended)** | ~500-1000 | Highest | High |

**Key insight from PageIndex**: Similarity ≠ Relevance

- Vector search finds "similar" memories but may miss truly relevant ones
- Tree navigation lets Claude *reason* about what's relevant
- Combining both gives the best results
