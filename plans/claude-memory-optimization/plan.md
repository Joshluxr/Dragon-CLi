# Claude Memory Optimization Plan

## Executive Summary

This plan enhances our `@dragon/supermemory` system by adopting key optimizations from `claude-mem`, primarily the **progressive disclosure pattern** for ~10x token savings. The implementation spans 6 phases across the MCP server, supermemory package, daemon, and frontend.

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

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Claude Code Session                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────────────────────────────────────┐  │
│  │   Hooks      │    │              MCP Tools (NEW)                  │  │
│  │              │    │  ┌────────────┐ ┌─────────┐ ┌─────────────┐  │  │
│  │ SessionStart │    │  │mem-search  │ │mem-get  │ │mem-timeline │  │  │
│  │ UserPrompt   │    │  │~50-100 tok │ │~500 tok │ │~200 tok     │  │  │
│  │ PostToolUse  │    │  └────────────┘ └─────────┘ └─────────────┘  │  │
│  │ Stop         │    │                                               │  │
│  │ SessionEnd   │◄───┤  ┌────────────┐ ┌─────────┐                  │  │
│  │ (NEW)        │    │  │mem-add     │ │mem-stats│                  │  │
│  └──────────────┘    │  └────────────┘ └─────────┘                  │  │
│         │            └──────────────────────────────────────────────┘  │
│         │                              │                                │
│         ▼                              ▼                                │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     MemoryRouter (Enhanced)                       │  │
│  │  ┌─────────────────┐  ┌───────────────┐  ┌──────────────────┐   │  │
│  │  │  Token Estimator │  │ Privacy Filter│  │ Embedding Engine │   │  │
│  │  └─────────────────┘  └───────────────┘  └──────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                              │                                         │
│         ┌────────────────────┴────────────────────┐                   │
│         ▼                                         ▼                    │
│  ┌─────────────────┐                    ┌─────────────────┐           │
│  │   Zvec Cache    │                    │  Supermemory    │           │
│  │   (Local)       │◄──────sync────────►│  (Remote API)   │           │
│  │  + FTS5 Index   │                    │                 │           │
│  └─────────────────┘                    └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
```

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
- **MemoryTimeline**: See chronological context around events
- **MemoryAdd**: Store important decisions for future sessions

Use progressive disclosure: search first, then retrieve only what you need.
This saves tokens compared to loading all memories upfront.

**Quick start**: If this project looks unfamiliar, try:
\`MemorySearch query="project overview"\`
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
} satisfies Record<string, FeatureFlagDefinition>;
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

### Week 4-5: Lifecycle & Polish
7. **Phase 5.1-5.2**: Add SessionEnd hook
8. **Phase 7**: Transition to progressive disclosure (behind feature flag)

### Week 5-6: Testing & Rollout
9. Comprehensive testing
10. Gradual rollout via feature flags
11. Documentation updates

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Memory tokens per session | ~2000-5000 (upfront) | ~200-500 (on-demand) |
| Search relevance (MRR@10) | Unknown | >0.7 |
| Session start latency | ~3-5s | <1s |
| Memory recall accuracy | Unknown | >80% |

---

## Files to Create/Modify

### New Files
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

---

## Testing Strategy

1. **Unit Tests**: Token estimation, privacy filtering, embedding generation
2. **Integration Tests**: MCP tool handlers, search quality
3. **E2E Tests**: Full session with memory retrieval
4. **Load Tests**: Cache performance with large memory sets
5. **A/B Tests**: Progressive disclosure vs upfront injection
