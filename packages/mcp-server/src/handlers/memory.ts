/**
 * Memory Tool Handlers
 *
 * Implements progressive disclosure memory retrieval combining:
 * - claude-mem's 3-layer workflow (search → select → get)
 * - PageIndex's hierarchical tree navigation
 *
 * Optimized for:
 * - Token efficiency (budgets, compact output)
 * - Speed (caching, lazy loading, inverted index)
 * - Accuracy (higher similarity threshold, deduplication, stemming)
 */

import type { ToolResult } from "../types/index.js";
import type { MemoryToolName } from "../tools/memory.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Token budgets per operation
  TOKEN_BUDGETS: {
    search: 400, // Compact index output
    tree: 600, // Tree structure
    navigate: 500, // Node expansion
    get: 2000, // Full content retrieval
    stats: 200, // Statistics
    timeline: 400, // Timeline view
  },
  // Similarity thresholds
  MIN_SIMILARITY: 0.65, // Raised from 0.5 for higher precision
  // Cache settings
  TREE_CACHE_TTL: 30 * 60 * 1000, // 30 minutes (was 5 min)
  // Output limits
  MAX_SEARCH_RESULTS: 20,
  MAX_CHILDREN_DISPLAY: 10,
  SUMMARY_TRUNCATE_LENGTH: 60, // Compact summaries
  TITLE_TRUNCATE_LENGTH: 40,
};

// ============================================================================
// TYPES
// ============================================================================

interface MemoryItem {
  id: string;
  content: string;
  contentHash?: string; // For deduplication
  tokenCount?: number; // Cached token count
  metadata?: {
    type?: string;
    timestamp?: string;
    sessionId?: string;
    tags?: string[];
  };
  similarity?: number;
}

interface MemoryTree {
  root: MemoryTreeNode;
  version: number;
  lastUpdated: string;
  totalMemories: number;
  totalTokens: number;
  maxDepth: number; // Cached depth
  nodeIndex: Map<string, MemoryTreeNode>; // Fast lookup
}

interface MemoryTreeNode {
  id: string;
  title: string;
  summary: string;
  type: string;
  parentId: string | null;
  children: MemoryTreeNode[];
  depth: number;
  memoryIds?: string[];
  memoryCount: number;
  tokenEstimate: number;
  startTime?: string;
  endTime?: string;
  tags?: string[];
}

// Inverted index for fast keyword search
interface InvertedIndex {
  terms: Map<string, Set<string>>; // term -> memory IDs
  lastBuilt: number;
}

// ============================================================================
// STORAGE & CACHING
// ============================================================================

const memoryStore = new Map<string, MemoryItem>();
let cachedTree: MemoryTree | null = null;
let treeLastBuilt = 0;
let invertedIndex: InvertedIndex = { terms: new Map(), lastBuilt: 0 };

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

function estimateTokens(text: string): number {
  if (!text) return 0;
  const isCode = /[{}\[\]();=<>]/.test(text) && /\n/.test(text);
  const hasUrls = /https?:\/\//.test(text);
  let multiplier = 0.25;
  if (isCode) multiplier = 0.35;
  else if (hasUrls) multiplier = 0.4;
  return Math.ceil(text.length * multiplier);
}

function formatTokens(tokens: number): string {
  if (tokens < 100) return `~${tokens}tk`;
  if (tokens < 1000) return `~${Math.round(tokens / 10) * 10}tk`;
  return `~${(tokens / 1000).toFixed(1)}k`;
}

function truncate(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

// ============================================================================
// TEXT PROCESSING (Stemming, Tokenization)
// ============================================================================

// Simple Porter-like suffix stripping for English
const SUFFIX_RULES: [RegExp, string][] = [
  [/ing$/, ""],
  [/ed$/, ""],
  [/tion$/, "t"],
  [/ness$/, ""],
  [/ment$/, ""],
  [/able$/, ""],
  [/ible$/, ""],
  [/ful$/, ""],
  [/less$/, ""],
  [/ous$/, ""],
  [/ive$/, ""],
  [/ly$/, ""],
  [/er$/, ""],
  [/est$/, ""],
  [/ies$/, "y"],
  [/es$/, ""],
  [/s$/, ""],
];

function stem(word: string): string {
  if (word.length < 4) return word;
  let result = word.toLowerCase();
  for (const [pattern, replacement] of SUFFIX_RULES) {
    if (
      pattern.test(result) &&
      result.replace(pattern, replacement).length >= 3
    ) {
      result = result.replace(pattern, replacement);
      break; // Apply only one rule
    }
  }
  return result;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function stemTokens(tokens: string[]): string[] {
  return tokens.map(stem);
}

// Content hash for deduplication
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ============================================================================
// INVERTED INDEX
// ============================================================================

function buildInvertedIndex(memories: MemoryItem[]): void {
  invertedIndex.terms.clear();

  for (const memory of memories) {
    const tokens = tokenize(memory.content);
    const stems = stemTokens(tokens);
    const uniqueStems = new Set(stems);

    // Also index tags
    if (memory.metadata?.tags) {
      for (const tag of memory.metadata.tags) {
        uniqueStems.add(stem(tag.toLowerCase()));
      }
    }

    for (const term of uniqueStems) {
      if (!invertedIndex.terms.has(term)) {
        invertedIndex.terms.set(term, new Set());
      }
      invertedIndex.terms.get(term)!.add(memory.id);
    }
  }

  invertedIndex.lastBuilt = Date.now();
}

function searchWithIndex(query: string): Set<string> {
  const queryTokens = stemTokens(tokenize(query));
  if (queryTokens.length === 0) return new Set<string>();

  // Find memories containing ALL query terms (AND logic)
  let resultIds: Set<string> | null = null;

  for (const term of queryTokens) {
    const termIds = invertedIndex.terms.get(term);
    if (!termIds || termIds.size === 0) {
      return new Set<string>(); // Term not found, no results
    }

    if (resultIds === null) {
      resultIds = new Set<string>(termIds);
    } else {
      // Intersect with current results
      const intersection = new Set<string>();
      for (const id of resultIds) {
        if (termIds.has(id)) {
          intersection.add(id);
        }
      }
      resultIds = intersection;
    }
  }

  return resultIds || new Set<string>();
}

// ============================================================================
// TF-IDF SCORING
// ============================================================================

function calculateTfIdf(
  memory: MemoryItem,
  queryTokens: string[],
  totalDocs: number,
): number {
  const contentTokens = stemTokens(tokenize(memory.content));
  const contentTermFreq = new Map<string, number>();

  for (const token of contentTokens) {
    contentTermFreq.set(token, (contentTermFreq.get(token) || 0) + 1);
  }

  let score = 0;
  let matchedTerms = 0;

  for (const queryTerm of queryTokens) {
    const stemmed = stem(queryTerm);
    const tf = contentTermFreq.get(stemmed) || 0;
    if (tf === 0) continue;

    matchedTerms++;

    // IDF: log(N / df) where df is docs containing term
    const df = invertedIndex.terms.get(stemmed)?.size || 1;
    const idf = Math.log((totalDocs + 1) / df);

    // TF-IDF with log normalization
    score += (1 + Math.log(tf)) * idf;
  }

  if (matchedTerms === 0) return 0;

  // Calculate coverage - what fraction of query terms were found
  const coverage = matchedTerms / queryTokens.length;

  // Normalize TF-IDF score to roughly 0-1 range
  // Average TF-IDF per matched term, scaled
  const avgTfIdf = score / matchedTerms;
  const normalizedTfIdf = Math.min(1, avgTfIdf / 3);

  // Final score: weighted combination of coverage (60%) and TF-IDF quality (40%)
  // This ensures high coverage queries score well while still ranking by relevance
  return coverage * 0.6 + normalizedTfIdf * 0.4;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

function deduplicateResults(results: MemoryItem[]): MemoryItem[] {
  const seen = new Map<string, MemoryItem>();

  for (const result of results) {
    const hash = result.contentHash || hashContent(result.content);

    if (!seen.has(hash)) {
      seen.set(hash, result);
    } else {
      // Keep the one with higher similarity
      const existing = seen.get(hash)!;
      if ((result.similarity || 0) > (existing.similarity || 0)) {
        seen.set(hash, result);
      }
    }
  }

  return [...seen.values()];
}

// ============================================================================
// MEMORY OPERATIONS
// ============================================================================

async function getAllMemories(): Promise<MemoryItem[]> {
  return [...memoryStore.values()];
}

async function searchMemories(
  query: string,
  limit: number,
  typeFilter?: string,
): Promise<MemoryItem[]> {
  const all = await getAllMemories();

  // Rebuild inverted index if stale
  if (
    invertedIndex.lastBuilt < treeLastBuilt ||
    invertedIndex.terms.size === 0
  ) {
    buildInvertedIndex(all);
  }

  // Use inverted index for fast lookup
  const candidateIds = searchWithIndex(query);
  const queryTokens = tokenize(query);

  let results: MemoryItem[] = [];

  if (candidateIds.size > 0) {
    // Score candidates with TF-IDF
    for (const id of candidateIds) {
      const memory = memoryStore.get(id);
      if (!memory) continue;

      if (
        typeFilter &&
        typeFilter !== "all" &&
        memory.metadata?.type !== typeFilter
      ) {
        continue;
      }

      const score = calculateTfIdf(memory, queryTokens, all.length);
      results.push({ ...memory, similarity: score }); // Already normalized to 0-1
    }
  } else {
    // Fallback to substring search if no index matches
    const queryLower = query.toLowerCase();
    results = all
      .filter((m) => {
        if (
          typeFilter &&
          typeFilter !== "all" &&
          m.metadata?.type !== typeFilter
        ) {
          return false;
        }
        return (
          m.content.toLowerCase().includes(queryLower) ||
          m.metadata?.tags?.some((t) => t.toLowerCase().includes(queryLower))
        );
      })
      .map((m) => ({
        ...m,
        similarity: m.content.toLowerCase().includes(queryLower) ? 0.7 : 0.5,
      }));
  }

  // Filter by similarity threshold
  results = results.filter((r) => (r.similarity || 0) >= CONFIG.MIN_SIMILARITY);

  // Deduplicate
  results = deduplicateResults(results);

  // Sort by relevance
  results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  return results.slice(0, limit);
}

async function getMemoriesById(ids: string[]): Promise<MemoryItem[]> {
  const results: MemoryItem[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);

    const memory = memoryStore.get(id);
    if (memory) results.push(memory);
  }
  return results;
}

async function addMemory(
  content: string,
  type: string,
  tags?: string[],
): Promise<string> {
  const id = `mem-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const tokenCount = estimateTokens(content);
  const contentHash = hashContent(content);

  memoryStore.set(id, {
    id,
    content,
    contentHash,
    tokenCount,
    metadata: { type, timestamp: new Date().toISOString(), tags },
  });

  // Invalidate caches
  cachedTree = null;
  invertedIndex.lastBuilt = 0;

  return id;
}

async function getTimeline(
  anchor: string,
  before: number,
  after: number,
): Promise<{ memories: MemoryItem[]; anchorIndex: number }> {
  const memories = await getAllMemories();
  const sorted = memories
    .filter((m) => m.metadata?.timestamp)
    .sort(
      (a, b) =>
        new Date(a.metadata!.timestamp!).getTime() -
        new Date(b.metadata!.timestamp!).getTime(),
    );

  let anchorIndex = anchor.startsWith("mem-")
    ? sorted.findIndex((m) => m.id === anchor)
    : sorted.findIndex(
        (m) =>
          new Date(m.metadata!.timestamp!).getTime() >=
          new Date(anchor).getTime(),
      );

  if (anchorIndex === -1 && sorted.length > 0) anchorIndex = sorted.length - 1;

  const startIndex = Math.max(0, anchorIndex - before);
  const endIndex = Math.min(sorted.length, anchorIndex + after + 1);

  return {
    memories: sorted.slice(startIndex, endIndex),
    anchorIndex: anchorIndex - startIndex,
  };
}

// ============================================================================
// TREE BUILDING (Optimized)
// ============================================================================

async function buildTree(): Promise<MemoryTree> {
  const now = Date.now();
  if (cachedTree && now - treeLastBuilt < CONFIG.TREE_CACHE_TTL) {
    return cachedTree;
  }

  const memories = await getAllMemories();
  const sessions = new Map<string, MemoryItem[]>();
  const patterns: MemoryItem[] = [];
  const decisions: MemoryItem[] = [];
  const context: MemoryItem[] = [];
  const observations: MemoryItem[] = [];

  // Single pass categorization with cached token counts
  let totalTokens = 0;
  for (const m of memories) {
    const tokens = m.tokenCount || estimateTokens(m.content);
    if (!m.tokenCount) m.tokenCount = tokens;
    totalTokens += tokens;

    const type = m.metadata?.type || "unknown";
    const sessionId = m.metadata?.sessionId || "default";

    if (type === "pattern") patterns.push(m);
    else if (type === "decision") decisions.push(m);
    else if (type === "context" || type === "static") context.push(m);
    else if (type === "tool-observation" || type === "observation")
      observations.push(m);
    else {
      if (!sessions.has(sessionId)) sessions.set(sessionId, []);
      sessions.get(sessionId)!.push(m);
    }
  }

  // Build node index for fast lookup
  const nodeIndex = new Map<string, MemoryTreeNode>();
  let maxDepth = 0;

  const root: MemoryTreeNode = {
    id: "root",
    title: "Memory Index",
    summary: "All stored memories",
    type: "root",
    parentId: null,
    children: [],
    depth: 0,
    memoryCount: memories.length,
    tokenEstimate: totalTokens,
  };
  nodeIndex.set("root", root);

  // Helper to add category nodes
  const addCategoryNode = (
    id: string,
    title: string,
    summary: string,
    items: MemoryItem[],
  ) => {
    if (items.length === 0) return;

    const tokens = items.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
    const node: MemoryTreeNode = {
      id,
      title,
      summary: `${items.length} items (${formatTokens(tokens)})`,
      type: "category",
      parentId: "root",
      children: [],
      depth: 1,
      memoryIds: items.map((m) => m.id),
      memoryCount: items.length,
      tokenEstimate: tokens,
    };
    root.children.push(node);
    nodeIndex.set(id, node);
    if (node.depth > maxDepth) maxDepth = node.depth;
  };

  // Add session nodes with children
  if (sessions.size > 0) {
    const sessionItems = [...sessions.values()].flat();
    const sessionTokens = sessionItems.reduce(
      (sum, m) => sum + (m.tokenCount || 0),
      0,
    );

    const sessionsNode: MemoryTreeNode = {
      id: "sessions",
      title: "Sessions",
      summary: `${sessions.size} sessions (${formatTokens(sessionTokens)})`,
      type: "category",
      parentId: "root",
      children: [],
      depth: 1,
      memoryCount: sessionItems.length,
      tokenEstimate: sessionTokens,
    };
    nodeIndex.set("sessions", sessionsNode);

    for (const [sessionId, sessionMemories] of sessions) {
      const sTokens = sessionMemories.reduce(
        (sum, m) => sum + (m.tokenCount || 0),
        0,
      );
      const sessionNode: MemoryTreeNode = {
        id: `session-${sessionId.substring(0, 8)}`,
        title: truncate(
          sessionMemories[0]?.content || `Session ${sessionId}`,
          CONFIG.TITLE_TRUNCATE_LENGTH,
        ),
        summary: `${sessionMemories.length} items`,
        type: "session",
        parentId: "sessions",
        children: [],
        depth: 2,
        memoryIds: sessionMemories.map((m) => m.id),
        memoryCount: sessionMemories.length,
        tokenEstimate: sTokens,
        startTime: sessionMemories[0]?.metadata?.timestamp,
        endTime:
          sessionMemories[sessionMemories.length - 1]?.metadata?.timestamp,
      };
      sessionsNode.children.push(sessionNode);
      nodeIndex.set(sessionNode.id, sessionNode);
      if (sessionNode.depth > maxDepth) maxDepth = sessionNode.depth;
    }
    root.children.push(sessionsNode);
    if (sessionsNode.depth > maxDepth) maxDepth = sessionsNode.depth;
  }

  addCategoryNode("patterns", "Patterns", "Learned patterns", patterns);
  addCategoryNode("decisions", "Decisions", "Key decisions", decisions);
  addCategoryNode("context", "Context", "Project context", context);
  addCategoryNode(
    "observations",
    "Observations",
    "Tool observations",
    observations,
  );

  const tree: MemoryTree = {
    root,
    version: 1,
    lastUpdated: new Date().toISOString(),
    totalMemories: memories.length,
    totalTokens,
    maxDepth,
    nodeIndex,
  };

  cachedTree = tree;
  treeLastBuilt = now;

  // Build inverted index alongside tree
  buildInvertedIndex(memories);

  return tree;
}

function findNode(tree: MemoryTree, nodeId: string): MemoryTreeNode | null {
  return tree.nodeIndex.get(nodeId) || null;
}

function getPathToNode(tree: MemoryTree, nodeId: string): string[] {
  const path: string[] = [];
  let current: MemoryTreeNode | undefined = tree.nodeIndex.get(nodeId);

  while (current) {
    path.unshift(current.id);
    current = current.parentId
      ? tree.nodeIndex.get(current.parentId)
      : undefined;
  }

  return path;
}

// ============================================================================
// HANDLER IMPLEMENTATIONS (Token-Optimized)
// ============================================================================

async function handleMemorySearch(args: {
  query: string;
  limit?: number;
  type?: string;
  treeNodeHint?: string;
}): Promise<ToolResult> {
  const { query, limit = 10, type, treeNodeHint } = args;

  try {
    let results: MemoryItem[];

    if (treeNodeHint) {
      const tree = await buildTree();
      const node = findNode(tree, treeNodeHint);
      if (node && node.memoryIds) {
        const branchMemories = await getMemoriesById(node.memoryIds);
        const queryTokens = tokenize(query);

        results = branchMemories
          .map((m) => {
            const score = calculateTfIdf(m, queryTokens, branchMemories.length);
            return { ...m, similarity: score }; // Already normalized to 0-1
          })
          .filter((m) => (m.similarity || 0) >= CONFIG.MIN_SIMILARITY)
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, Math.min(limit, CONFIG.MAX_SEARCH_RESULTS));
      } else {
        results = await searchMemories(
          query,
          Math.min(limit, CONFIG.MAX_SEARCH_RESULTS),
          type,
        );
      }
    } else {
      results = await searchMemories(
        query,
        Math.min(limit, CONFIG.MAX_SEARCH_RESULTS),
        type,
      );
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No memories found for "${query}"${type ? ` (type: ${type})` : ""}. Try different keywords or use MemoryTree.`,
          },
        ],
      };
    }

    // Compact output format (token-optimized)
    const lines: string[] = [
      `## Search: "${truncate(query, 30)}" (${results.length} results)`,
    ];
    lines.push("");

    let outputTokens = 0;
    for (const r of results) {
      if (outputTokens > CONFIG.TOKEN_BUDGETS.search) {
        lines.push(
          `... ${results.length - lines.length + 2} more (use higher limit)`,
        );
        break;
      }

      const tokens = r.tokenCount || estimateTokens(r.content);
      const sim = r.similarity ? Math.round(r.similarity * 100) : 0;
      const line = `• [${r.id}] ${truncate(r.content, CONFIG.SUMMARY_TRUNCATE_LENGTH)} (${sim}%, ${formatTokens(tokens)})`;
      lines.push(line);
      outputTokens += estimateTokens(line);
    }

    lines.push("");
    lines.push(`Use \`MemoryGet ids=["${results[0]?.id}"]\` for full content.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryGet(args: {
  ids: string[];
  maxTokens?: number;
}): Promise<ToolResult> {
  const { ids, maxTokens = CONFIG.TOKEN_BUDGETS.get } = args;

  if (!ids || ids.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No IDs provided. Use MemorySearch first.",
        },
      ],
      isError: true,
    };
  }

  try {
    const memories = await getMemoriesById(ids);

    if (memories.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No memories found for: ${ids.join(", ")}`,
          },
        ],
      };
    }

    const lines: string[] = [`## Retrieved (${memories.length} items)`];
    let totalTokens = 0;
    let truncated = false;

    for (const m of memories) {
      const tokens = m.tokenCount || estimateTokens(m.content);

      if (totalTokens + tokens > maxTokens && lines.length > 1) {
        truncated = true;
        lines.push(
          `\n... truncated (${maxTokens}tk limit). Request fewer IDs.`,
        );
        break;
      }

      lines.push("");
      lines.push(`### ${m.id}`);
      if (m.metadata?.type) lines.push(`Type: ${m.metadata.type}`);
      lines.push("");
      lines.push(m.content);
      lines.push("---");

      totalTokens += tokens;
    }

    if (!truncated) {
      lines.push(`\nTotal: ${formatTokens(totalTokens)}`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryTimeline(args: {
  anchor: string;
  before?: number;
  after?: number;
}): Promise<ToolResult> {
  const { anchor, before = 5, after = 5 } = args;

  try {
    const result = await getTimeline(anchor, before, after);

    if (result.memories.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No memories around: "${anchor}"`,
          },
        ],
      };
    }

    const lines: string[] = [`## Timeline (${result.memories.length} items)`];
    lines.push("");

    for (let i = 0; i < result.memories.length; i++) {
      const m = result.memories[i];
      if (!m) continue;
      const marker = i === result.anchorIndex ? ">>>" : "   ";
      const time = m.metadata?.timestamp
        ? new Date(m.metadata.timestamp).toLocaleTimeString()
        : "??:??";
      lines.push(`${marker} [${m.id}] ${time}: ${truncate(m.content, 50)}`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryAdd(args: {
  content: string;
  type?: string;
  tags?: string[];
}): Promise<ToolResult> {
  const { content, type = "conversation", tags } = args;

  if (!content || content.trim().length < 10) {
    return {
      content: [
        {
          type: "text",
          text: "Content too short (min 10 chars).",
        },
      ],
      isError: true,
    };
  }

  try {
    const id = await addMemory(content, type, tags);
    const tokens = estimateTokens(content);

    return {
      content: [
        {
          type: "text",
          text: `Added: ${id} (${type}, ${formatTokens(tokens)})`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryStats(): Promise<ToolResult> {
  try {
    const tree = await buildTree();

    // Use cached values from tree
    const categories: Record<string, number> = {};
    for (const child of tree.root.children) {
      categories[child.id] = child.memoryCount;
    }

    const lines: string[] = [
      `## Stats`,
      `Memories: ${tree.totalMemories} (${formatTokens(tree.totalTokens)})`,
      `Depth: ${tree.maxDepth}`,
      "",
      "Categories:",
    ];

    for (const [cat, count] of Object.entries(categories)) {
      lines.push(`• ${cat}: ${count}`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryTree(args: {
  maxDepth?: number;
}): Promise<ToolResult> {
  const { maxDepth = 2 } = args;

  try {
    const tree = await buildTree();

    if (tree.totalMemories === 0) {
      return {
        content: [
          {
            type: "text",
            text: "## Memory Tree\n\nNo memories yet. Use MemoryAdd.",
          },
        ],
      };
    }

    const lines: string[] = [
      `## Tree (${tree.totalMemories} items, ${formatTokens(tree.totalTokens)})`,
      "",
    ];

    let outputTokens = 0;
    const formatNodeCompact = (node: MemoryTreeNode, depth: number) => {
      if (depth > maxDepth || outputTokens > CONFIG.TOKEN_BUDGETS.tree) return;
      if (node.type === "root") {
        for (const child of node.children) {
          formatNodeCompact(child, depth);
        }
        return;
      }

      const indent = "  ".repeat(depth);
      const line = `${indent}• [${node.id}] ${truncate(node.title, CONFIG.TITLE_TRUNCATE_LENGTH)} (${node.memoryCount}, ${formatTokens(node.tokenEstimate)})`;
      lines.push(line);
      outputTokens += estimateTokens(line);

      if (depth < maxDepth) {
        const children = node.children.slice(0, CONFIG.MAX_CHILDREN_DISPLAY);
        for (const child of children) {
          formatNodeCompact(child, depth + 1);
        }
        if (node.children.length > CONFIG.MAX_CHILDREN_DISPLAY) {
          lines.push(
            `${indent}  ... +${node.children.length - CONFIG.MAX_CHILDREN_DISPLAY} more`,
          );
        }
      } else if (node.children.length > 0) {
        lines.push(`${indent}  └ ${node.children.length} sub-nodes`);
      }
    };

    formatNodeCompact(tree.root, 0);

    lines.push("");
    lines.push('Navigate: `MemoryNavigate nodeId="sessions"`');

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryNavigate(args: {
  nodeId: string;
}): Promise<ToolResult> {
  const { nodeId } = args;

  try {
    const tree = await buildTree();
    const node = findNode(tree, nodeId);

    if (!node) {
      return {
        content: [
          {
            type: "text",
            text: `Node "${nodeId}" not found. Use MemoryTree.`,
          },
        ],
      };
    }

    const path = getPathToNode(tree, nodeId);
    const lines: string[] = [
      `## ${node.title}`,
      `Path: ${path.join(" → ")}`,
      `Items: ${node.memoryCount} (${formatTokens(node.tokenEstimate)})`,
      "",
    ];

    // Show memory IDs (limited)
    if (node.memoryIds && node.memoryIds.length > 0) {
      const showIds = node.memoryIds.slice(0, 5);
      lines.push("IDs: " + showIds.map((id) => `"${id}"`).join(", "));
      if (node.memoryIds.length > 5) {
        lines.push(`... +${node.memoryIds.length - 5} more`);
      }
      lines.push("");
    }

    // Show children (limited)
    if (node.children.length > 0) {
      lines.push("Children:");
      const showChildren = node.children.slice(0, CONFIG.MAX_CHILDREN_DISPLAY);
      for (const child of showChildren) {
        lines.push(
          `• [${child.id}] ${truncate(child.title, 30)} (${child.memoryCount})`,
        );
      }
      if (node.children.length > CONFIG.MAX_CHILDREN_DISPLAY) {
        lines.push(
          `... +${node.children.length - CONFIG.MAX_CHILDREN_DISPLAY} more`,
        );
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// ============================================================================
// ROUTER
// ============================================================================

export async function handleMemoryTool(
  name: MemoryToolName,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "MemorySearch":
      return handleMemorySearch(
        args as Parameters<typeof handleMemorySearch>[0],
      );
    case "MemoryGet":
      return handleMemoryGet(args as Parameters<typeof handleMemoryGet>[0]);
    case "MemoryTimeline":
      return handleMemoryTimeline(
        args as Parameters<typeof handleMemoryTimeline>[0],
      );
    case "MemoryAdd":
      return handleMemoryAdd(args as Parameters<typeof handleMemoryAdd>[0]);
    case "MemoryStats":
      return handleMemoryStats();
    case "MemoryTree":
      return handleMemoryTree(args as Parameters<typeof handleMemoryTree>[0]);
    case "MemoryNavigate":
      return handleMemoryNavigate(
        args as Parameters<typeof handleMemoryNavigate>[0],
      );
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// ============================================================================
// TESTING UTILITIES (exported for tests)
// ============================================================================

export const _testUtils = {
  memoryStore,
  clearAll: () => {
    memoryStore.clear();
    cachedTree = null;
    treeLastBuilt = 0;
    invertedIndex.terms.clear();
    invertedIndex.lastBuilt = 0;
  },
  addTestMemory: addMemory,
  getConfig: () => CONFIG,
  stem,
  tokenize,
  hashContent,
};
