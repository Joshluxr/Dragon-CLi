/**
 * Memory Tool Handlers
 *
 * Implements a two-tier memory system:
 * - Short-term memory: Recent sessions + important memories (fast access)
 * - Long-term memory: Compressed historical data (on-demand access)
 *
 * Combined with:
 * - claude-mem's 3-layer workflow (search → select → get)
 * - PageIndex's hierarchical tree navigation
 *
 * Optimized for:
 * - Token efficiency (budgets, compact output, tiered access)
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
    shortTermContext: 800, // Short-term memory context load
  },
  // Similarity thresholds
  MIN_SIMILARITY: 0.65, // Raised from 0.5 for higher precision
  MIN_SIMILARITY_LONG_TERM: 0.5, // Lower threshold for long-term (it's compressed)
  // Cache settings
  TREE_CACHE_TTL: 30 * 60 * 1000, // 30 minutes (was 5 min)
  SUMMARY_INDEX_TTL: 60 * 60 * 1000, // 1 hour for summary index
  // Output limits
  MAX_SEARCH_RESULTS: 20,
  MAX_CHILDREN_DISPLAY: 10,
  SUMMARY_TRUNCATE_LENGTH: 60, // Compact summaries
  TITLE_TRUNCATE_LENGTH: 40,
  // Tiered memory settings
  SHORT_TERM_SESSION_COUNT: 10, // Last N sessions in short-term
  SHORT_TERM_IMPORTANT_COUNT: 10, // Top N important memories
  COMPRESSION_MIN_MESSAGES: 5, // Min messages before compressing a session
  PROMOTION_THRESHOLD: 3, // Promote from long-term if < N short-term results
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
    importance?: number; // 0-1 score for importance ranking
    accessCount?: number; // How often this memory is accessed
    lastAccessed?: string; // Last access timestamp
    tier?: "short-term" | "long-term"; // Current tier
  };
  similarity?: number;
}

// Compressed session summary for long-term storage
interface CompressedSession {
  sessionId: string;
  title: string;
  summary: string; // 2-3 sentence summary
  keyDecisions: string[]; // Key decisions made
  patternsLearned: string[]; // Patterns identified
  keywords: string[]; // Searchable keywords
  tokenCount: number;
  originalMemoryCount: number;
  startTime: string;
  endTime: string;
  memoryIds: string[]; // Original memory IDs (for full retrieval)
}

// Summary index for long-term discoverability
interface SummaryIndex {
  keywords: Map<string, string[]>; // keyword -> session IDs
  categories: Map<string, string[]>; // category -> session IDs
  totalSessions: number;
  totalMemories: number;
  oldestSession: string;
  newestSession: string;
  lastBuilt: number;
  description: string; // Human-readable summary
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

// Primary memory store (all memories)
const memoryStore = new Map<string, MemoryItem>();

// Tiered memory stores
const shortTermMemory = new Set<string>(); // Memory IDs in short-term
const longTermCompressed = new Map<string, CompressedSession>(); // Session ID -> compressed
let summaryIndex: SummaryIndex | null = null;

// Caches
let cachedTree: MemoryTree | null = null;
let treeLastBuilt = 0;
let invertedIndex: InvertedIndex = { terms: new Map(), lastBuilt: 0 };
let shortTermIndex: InvertedIndex = { terms: new Map(), lastBuilt: 0 }; // Separate index for short-term

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
// TIERED MEMORY MANAGEMENT
// ============================================================================

/**
 * Calculate importance score for a memory.
 * Higher scores = more important = stays in short-term.
 */
function calculateImportance(memory: MemoryItem): number {
  let score = 0;

  // Type-based importance (decisions and patterns are inherently important)
  const type = memory.metadata?.type || "conversation";
  if (type === "decision") score += 0.4;
  else if (type === "pattern") score += 0.35;
  else if (type === "context" || type === "static") score += 0.3;
  else if (type === "tool-observation" || type === "observation") score += 0.1;

  // Recency boost (exponential decay over 7 days)
  if (memory.metadata?.timestamp) {
    const ageMs = Date.now() - new Date(memory.metadata.timestamp).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const recencyScore = Math.exp(-ageDays / 7) * 0.3;
    score += recencyScore;
  }

  // Access frequency boost
  const accessCount = memory.metadata?.accessCount || 0;
  if (accessCount > 0) {
    score += Math.min(0.2, accessCount * 0.02);
  }

  // Tag boost (tagged items are usually important)
  if (memory.metadata?.tags && memory.metadata.tags.length > 0) {
    score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * Compress a session into a summary for long-term storage.
 */
function compressSession(
  sessionId: string,
  memories: MemoryItem[],
): CompressedSession {
  if (memories.length === 0) {
    return {
      sessionId,
      title: `Empty session ${sessionId}`,
      summary: "No memories in this session.",
      keyDecisions: [],
      patternsLearned: [],
      keywords: [],
      tokenCount: 0,
      originalMemoryCount: 0,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      memoryIds: [],
    };
  }

  // Sort by timestamp
  const sorted = [...memories].sort((a, b) => {
    const aTime = a.metadata?.timestamp
      ? new Date(a.metadata.timestamp).getTime()
      : 0;
    const bTime = b.metadata?.timestamp
      ? new Date(b.metadata.timestamp).getTime()
      : 0;
    return aTime - bTime;
  });

  // Extract key information
  const decisions = memories
    .filter((m) => m.metadata?.type === "decision")
    .map((m) => truncate(m.content, 100));

  const patterns = memories
    .filter((m) => m.metadata?.type === "pattern")
    .map((m) => truncate(m.content, 100));

  // Generate keywords from all content
  const allContent = memories.map((m) => m.content).join(" ");
  const tokens = stemTokens(tokenize(allContent));
  const tokenFreq = new Map<string, number>();
  for (const token of tokens) {
    tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
  }
  // Get top keywords by frequency
  const keywords = [...tokenFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k]) => k);

  // Generate title from first meaningful content
  const firstMemory = sorted[0];
  const title = truncate(
    firstMemory?.content || `Session ${sessionId}`,
    CONFIG.TITLE_TRUNCATE_LENGTH,
  );

  // Generate summary
  const summaryParts: string[] = [];
  const originalTokens = memories.reduce(
    (sum, m) => sum + (m.tokenCount || estimateTokens(m.content)),
    0,
  );

  summaryParts.push(
    `Session with ${memories.length} memories (${formatTokens(originalTokens)} original).`,
  );
  if (decisions.length > 0) {
    summaryParts.push(`${decisions.length} decisions made.`);
  }
  if (patterns.length > 0) {
    summaryParts.push(`${patterns.length} patterns identified.`);
  }

  return {
    sessionId,
    title,
    summary: summaryParts.join(" "),
    keyDecisions: decisions.slice(0, 5),
    patternsLearned: patterns.slice(0, 5),
    keywords,
    tokenCount: estimateTokens(summaryParts.join(" ")),
    originalMemoryCount: memories.length,
    startTime: sorted[0]?.metadata?.timestamp || new Date().toISOString(),
    endTime:
      sorted[sorted.length - 1]?.metadata?.timestamp ||
      new Date().toISOString(),
    memoryIds: memories.map((m) => m.id),
  };
}

/**
 * Build the summary index for long-term memory discoverability.
 */
function buildSummaryIndex(): SummaryIndex {
  const keywords = new Map<string, string[]>();
  const categories = new Map<string, string[]>();
  let oldestTime = Infinity;
  let newestTime = 0;
  let oldestSession = "";
  let newestSession = "";
  let totalMemories = 0;

  for (const [sessionId, compressed] of longTermCompressed) {
    totalMemories += compressed.originalMemoryCount;

    // Index keywords
    for (const keyword of compressed.keywords) {
      if (!keywords.has(keyword)) {
        keywords.set(keyword, []);
      }
      keywords.get(keyword)!.push(sessionId);
    }

    // Index by decision/pattern presence
    if (compressed.keyDecisions.length > 0) {
      if (!categories.has("decisions")) {
        categories.set("decisions", []);
      }
      categories.get("decisions")!.push(sessionId);
    }
    if (compressed.patternsLearned.length > 0) {
      if (!categories.has("patterns")) {
        categories.set("patterns", []);
      }
      categories.get("patterns")!.push(sessionId);
    }

    // Track time range
    const startTime = new Date(compressed.startTime).getTime();
    const endTime = new Date(compressed.endTime).getTime();
    if (startTime < oldestTime) {
      oldestTime = startTime;
      oldestSession = sessionId;
    }
    if (endTime > newestTime) {
      newestTime = endTime;
      newestSession = sessionId;
    }
  }

  // Generate human-readable description
  const topKeywords = [...keywords.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([k]) => k);

  const description = `Long-term memory contains ${longTermCompressed.size} compressed sessions with ${totalMemories} total memories. Topics: ${topKeywords.join(", ")}.`;

  return {
    keywords,
    categories,
    totalSessions: longTermCompressed.size,
    totalMemories,
    oldestSession,
    newestSession,
    lastBuilt: Date.now(),
    description,
  };
}

/**
 * Organize memories into tiers based on recency and importance.
 */
async function organizeTiers(): Promise<void> {
  const all = await getAllMemories();
  if (all.length === 0) return;

  // Group by session
  const sessions = new Map<string, MemoryItem[]>();
  const importantMemories: MemoryItem[] = [];

  for (const memory of all) {
    const sessionId = memory.metadata?.sessionId || "default";
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    sessions.get(sessionId)!.push(memory);

    // Calculate and cache importance
    const importance = calculateImportance(memory);
    memory.metadata = memory.metadata || {};
    memory.metadata.importance = importance;

    // Collect important memories (decisions, patterns, high-access)
    if (
      memory.metadata.type === "decision" ||
      memory.metadata.type === "pattern" ||
      importance >= 0.5
    ) {
      importantMemories.push(memory);
    }
  }

  // Sort sessions by most recent activity
  const sessionsByRecency = [...sessions.entries()].sort((a, b) => {
    const aLatest = Math.max(
      ...a[1].map((m) =>
        m.metadata?.timestamp ? new Date(m.metadata.timestamp).getTime() : 0,
      ),
    );
    const bLatest = Math.max(
      ...b[1].map((m) =>
        m.metadata?.timestamp ? new Date(m.metadata.timestamp).getTime() : 0,
      ),
    );
    return bLatest - aLatest;
  });

  // Clear current tier assignments
  shortTermMemory.clear();

  // Add recent sessions to short-term
  const recentSessions = sessionsByRecency.slice(
    0,
    CONFIG.SHORT_TERM_SESSION_COUNT,
  );
  for (const [, memories] of recentSessions) {
    for (const memory of memories) {
      shortTermMemory.add(memory.id);
      memory.metadata = memory.metadata || {};
      memory.metadata.tier = "short-term";
    }
  }

  // Add top important memories to short-term
  const sortedImportant = importantMemories.sort(
    (a, b) => (b.metadata?.importance || 0) - (a.metadata?.importance || 0),
  );
  for (const memory of sortedImportant.slice(
    0,
    CONFIG.SHORT_TERM_IMPORTANT_COUNT,
  )) {
    shortTermMemory.add(memory.id);
    memory.metadata = memory.metadata || {};
    memory.metadata.tier = "short-term";
  }

  // Compress old sessions to long-term
  const oldSessions = sessionsByRecency.slice(CONFIG.SHORT_TERM_SESSION_COUNT);
  for (const [sessionId, memories] of oldSessions) {
    // Only compress if enough messages
    if (memories.length >= CONFIG.COMPRESSION_MIN_MESSAGES) {
      const compressed = compressSession(sessionId, memories);
      longTermCompressed.set(sessionId, compressed);
    }
    // Mark as long-term
    for (const memory of memories) {
      if (!shortTermMemory.has(memory.id)) {
        memory.metadata = memory.metadata || {};
        memory.metadata.tier = "long-term";
      }
    }
  }

  // Rebuild summary index
  summaryIndex = buildSummaryIndex();

  // Rebuild short-term index
  const shortTermMemories = all.filter((m) => shortTermMemory.has(m.id));
  buildShortTermIndex(shortTermMemories);
}

/**
 * Build inverted index for short-term memory only.
 */
function buildShortTermIndex(memories: MemoryItem[]): void {
  shortTermIndex.terms.clear();

  for (const memory of memories) {
    const tokens = tokenize(memory.content);
    const stems = stemTokens(tokens);
    const uniqueStems = new Set(stems);

    if (memory.metadata?.tags) {
      for (const tag of memory.metadata.tags) {
        uniqueStems.add(stem(tag.toLowerCase()));
      }
    }

    for (const term of uniqueStems) {
      if (!shortTermIndex.terms.has(term)) {
        shortTermIndex.terms.set(term, new Set());
      }
      shortTermIndex.terms.get(term)!.add(memory.id);
    }
  }

  shortTermIndex.lastBuilt = Date.now();
}

/**
 * Search short-term memory first, then expand to long-term if needed.
 */
async function tieredSearch(
  query: string,
  limit: number,
  typeFilter?: string,
): Promise<{ results: MemoryItem[]; searchedLongTerm: boolean }> {
  // For small memory stores, use flat search (no tiers needed)
  if (memoryStore.size < CONFIG.SHORT_TERM_SESSION_COUNT * 5) {
    const flatResults = await searchMemories(query, limit, typeFilter);
    return { results: flatResults, searchedLongTerm: false };
  }

  // Ensure tiers are organized
  if (shortTermMemory.size === 0 && memoryStore.size > 0) {
    await organizeTiers();
  }

  const queryTokens = tokenize(query);
  let results: MemoryItem[] = [];
  let searchedLongTerm = false;

  // Phase 1: Search short-term memory
  const shortTermResults = await searchShortTerm(query, limit * 2, typeFilter);
  results = shortTermResults;

  // Phase 2: Check if we need to expand to long-term
  if (results.length < CONFIG.PROMOTION_THRESHOLD && summaryIndex) {
    // Check if query terms match summary index
    const queryStems = stemTokens(queryTokens);
    let indexHits = 0;

    for (const stem of queryStems) {
      if (summaryIndex.keywords.has(stem)) {
        indexHits++;
      }
    }

    // If summary index suggests relevant long-term content, expand search
    if (indexHits > 0) {
      searchedLongTerm = true;
      const longTermResults = await searchLongTerm(
        query,
        limit,
        typeFilter,
        queryStems,
      );
      results = [...results, ...longTermResults];

      // Deduplicate
      results = deduplicateResults(results);
    }
  }

  // Sort by similarity and limit
  results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  return {
    results: results.slice(0, limit),
    searchedLongTerm,
  };
}

/**
 * Search only short-term memory.
 */
async function searchShortTerm(
  query: string,
  limit: number,
  typeFilter?: string,
): Promise<MemoryItem[]> {
  const queryTokens = tokenize(query);
  const results: MemoryItem[] = [];

  // Use short-term index for fast lookup
  let candidateIds: Set<string>;
  if (shortTermIndex.terms.size > 0) {
    candidateIds = new Set<string>();
    const queryStems = stemTokens(queryTokens);

    // OR logic for short-term (more permissive)
    for (const stem of queryStems) {
      const termIds = shortTermIndex.terms.get(stem);
      if (termIds) {
        for (const id of termIds) {
          candidateIds.add(id);
        }
      }
    }
  } else {
    candidateIds = shortTermMemory;
  }

  // Score candidates
  for (const id of candidateIds) {
    if (!shortTermMemory.has(id)) continue;

    const memory = memoryStore.get(id);
    if (!memory) continue;

    if (
      typeFilter &&
      typeFilter !== "all" &&
      memory.metadata?.type !== typeFilter
    ) {
      continue;
    }

    const score = calculateTfIdf(memory, queryTokens, shortTermMemory.size);
    if (score >= CONFIG.MIN_SIMILARITY) {
      results.push({ ...memory, similarity: score });

      // Track access for importance scoring
      memory.metadata = memory.metadata || {};
      memory.metadata.accessCount = (memory.metadata.accessCount || 0) + 1;
      memory.metadata.lastAccessed = new Date().toISOString();
    }
  }

  return results.slice(0, limit);
}

/**
 * Search long-term compressed memory.
 */
async function searchLongTerm(
  query: string,
  limit: number,
  typeFilter?: string,
  queryStems?: string[],
): Promise<MemoryItem[]> {
  const stems = queryStems || stemTokens(tokenize(query));
  const results: MemoryItem[] = [];

  // Find matching compressed sessions
  const matchingSessions: Array<{
    session: CompressedSession;
    score: number;
  }> = [];

  for (const [, compressed] of longTermCompressed) {
    let score = 0;
    let matches = 0;

    for (const stem of stems) {
      if (compressed.keywords.includes(stem)) {
        score += 0.3;
        matches++;
      }
    }

    // Boost for decision/pattern matches if type filter matches
    if (!typeFilter || typeFilter === "all" || typeFilter === "decision") {
      for (const decision of compressed.keyDecisions) {
        const decisionStems = stemTokens(tokenize(decision));
        for (const stem of stems) {
          if (decisionStems.includes(stem)) {
            score += 0.2;
            matches++;
          }
        }
      }
    }

    if (matches > 0) {
      const coverage = matches / stems.length;
      matchingSessions.push({
        session: compressed,
        score: score * coverage,
      });
    }
  }

  // Sort by score and get top sessions
  matchingSessions.sort((a, b) => b.score - a.score);
  const topSessions = matchingSessions.slice(0, 5);

  // Retrieve original memories from top sessions
  for (const { session } of topSessions) {
    for (const memoryId of session.memoryIds) {
      const memory = memoryStore.get(memoryId);
      if (!memory) continue;

      if (
        typeFilter &&
        typeFilter !== "all" &&
        memory.metadata?.type !== typeFilter
      ) {
        continue;
      }

      // Calculate actual similarity
      const queryTokens = tokenize(query);
      const actualScore = calculateTfIdf(
        memory,
        queryTokens,
        session.memoryIds.length,
      );

      if (actualScore >= CONFIG.MIN_SIMILARITY_LONG_TERM) {
        results.push({
          ...memory,
          similarity: actualScore * 0.9, // Slight penalty for being in long-term
        });
      }
    }
  }

  return results.slice(0, limit);
}

/**
 * Promote a memory from long-term to short-term.
 */
function promoteToShortTerm(memoryId: string): void {
  const memory = memoryStore.get(memoryId);
  if (!memory) return;

  shortTermMemory.add(memoryId);
  memory.metadata = memory.metadata || {};
  memory.metadata.tier = "short-term";
  memory.metadata.accessCount = (memory.metadata.accessCount || 0) + 1;
  memory.metadata.lastAccessed = new Date().toISOString();

  // Rebuild short-term index
  const shortTermMemories = [...memoryStore.values()].filter((m) =>
    shortTermMemory.has(m.id),
  );
  buildShortTermIndex(shortTermMemories);
}

/**
 * Get short-term memory context (for context loading).
 */
async function getShortTermContext(): Promise<{
  memories: MemoryItem[];
  summaryDescription: string;
  tokenCount: number;
}> {
  if (shortTermMemory.size === 0 && memoryStore.size > 0) {
    await organizeTiers();
  }

  const memories: MemoryItem[] = [];
  let tokenCount = 0;

  for (const id of shortTermMemory) {
    const memory = memoryStore.get(id);
    if (memory) {
      memories.push(memory);
      tokenCount += memory.tokenCount || estimateTokens(memory.content);
    }
  }

  const summaryDescription =
    summaryIndex?.description || "No long-term memories yet.";

  return { memories, summaryDescription, tokenCount };
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
  tier?: "short-term" | "long-term" | "all";
}): Promise<ToolResult> {
  const { query, limit = 10, type, treeNodeHint, tier = "all" } = args;

  try {
    let results: MemoryItem[];
    let searchedLongTerm = false;

    if (treeNodeHint) {
      // Tree-based search (existing behavior)
      const tree = await buildTree();
      const node = findNode(tree, treeNodeHint);
      if (node && node.memoryIds) {
        const branchMemories = await getMemoriesById(node.memoryIds);
        const queryTokens = tokenize(query);

        results = branchMemories
          .map((m) => {
            const score = calculateTfIdf(m, queryTokens, branchMemories.length);
            return { ...m, similarity: score };
          })
          .filter((m) => (m.similarity || 0) >= CONFIG.MIN_SIMILARITY)
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, Math.min(limit, CONFIG.MAX_SEARCH_RESULTS));
      } else {
        const tieredResult = await tieredSearch(
          query,
          Math.min(limit, CONFIG.MAX_SEARCH_RESULTS),
          type,
        );
        results = tieredResult.results;
        searchedLongTerm = tieredResult.searchedLongTerm;
      }
    } else if (tier === "short-term") {
      // Short-term only search
      results = await searchShortTerm(
        query,
        Math.min(limit, CONFIG.MAX_SEARCH_RESULTS),
        type,
      );
    } else if (tier === "long-term") {
      // Long-term only search
      results = await searchLongTerm(
        query,
        Math.min(limit, CONFIG.MAX_SEARCH_RESULTS),
        type,
      );
      searchedLongTerm = true;
    } else {
      // Tiered search (default): short-term first, expand to long-term if needed
      const tieredResult = await tieredSearch(
        query,
        Math.min(limit, CONFIG.MAX_SEARCH_RESULTS),
        type,
      );
      results = tieredResult.results;
      searchedLongTerm = tieredResult.searchedLongTerm;
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
    const tierInfo = searchedLongTerm ? " [+long-term]" : "";
    const lines: string[] = [
      `## Search: "${truncate(query, 30)}" (${results.length} results${tierInfo})`,
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
      const tierTag = r.metadata?.tier === "long-term" ? " [LT]" : "";
      const line = `• [${r.id}] ${truncate(r.content, CONFIG.SUMMARY_TRUNCATE_LENGTH)} (${sim}%${tierTag}, ${formatTokens(tokens)})`;
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

    // Ensure tiers are organized
    if (shortTermMemory.size === 0 && memoryStore.size > 0) {
      await organizeTiers();
    }

    // Use cached values from tree
    const categories: Record<string, number> = {};
    for (const child of tree.root.children) {
      categories[child.id] = child.memoryCount;
    }

    // Calculate tier statistics
    const shortTermCount = shortTermMemory.size;
    const longTermCount = tree.totalMemories - shortTermCount;
    const compressedSessions = longTermCompressed.size;

    const lines: string[] = [
      `## Stats`,
      `Memories: ${tree.totalMemories} (${formatTokens(tree.totalTokens)})`,
      `Depth: ${tree.maxDepth}`,
      "",
      "**Tiers:**",
      `• Short-term: ${shortTermCount} memories (fast access)`,
      `• Long-term: ${longTermCount} memories (${compressedSessions} compressed sessions)`,
      "",
      "**Categories:**",
    ];

    for (const [cat, count] of Object.entries(categories)) {
      lines.push(`• ${cat}: ${count}`);
    }

    // Add long-term summary if available
    if (summaryIndex && summaryIndex.description) {
      lines.push("");
      lines.push("**Long-term summary:**");
      lines.push(summaryIndex.description);
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

async function handleMemoryContext(args: {
  maxTokens?: number;
}): Promise<ToolResult> {
  const { maxTokens = CONFIG.TOKEN_BUDGETS.shortTermContext } = args;

  try {
    const { memories, summaryDescription, tokenCount } =
      await getShortTermContext();

    if (memories.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "## Memory Context\n\nNo memories in short-term storage yet.",
          },
        ],
      };
    }

    const lines: string[] = [
      `## Short-Term Memory (${memories.length} items, ${formatTokens(tokenCount)})`,
      "",
    ];

    // Group by type for organized display
    const byType = new Map<string, MemoryItem[]>();
    for (const m of memories) {
      const type = m.metadata?.type || "other";
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(m);
    }

    // Show important types first
    const typeOrder = [
      "decision",
      "pattern",
      "context",
      "conversation",
      "other",
    ];
    let usedTokens = 0;

    for (const type of typeOrder) {
      const items = byType.get(type);
      if (!items || items.length === 0) continue;

      lines.push(
        `### ${type.charAt(0).toUpperCase() + type.slice(1)}s (${items.length})`,
      );

      for (const m of items) {
        if (usedTokens >= maxTokens) {
          lines.push(`... truncated (${formatTokens(maxTokens)} limit)`);
          break;
        }

        const tokens = m.tokenCount || estimateTokens(m.content);
        const importance = m.metadata?.importance
          ? Math.round(m.metadata.importance * 100)
          : 0;
        const line = `• [${m.id}] ${truncate(m.content, CONFIG.SUMMARY_TRUNCATE_LENGTH)} (${importance}% imp, ${formatTokens(tokens)})`;
        lines.push(line);
        usedTokens += tokens;
      }
      lines.push("");
    }

    // Add long-term summary for discoverability
    lines.push("---");
    lines.push("**Long-term storage:**");
    lines.push(summaryDescription);
    lines.push("");
    lines.push(
      'Use `MemorySearch tier="long-term"` to search historical memories.',
    );

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

async function handleMemoryPromote(args: {
  memoryId: string;
}): Promise<ToolResult> {
  const { memoryId } = args;

  try {
    const memory = memoryStore.get(memoryId);

    if (!memory) {
      return {
        content: [
          {
            type: "text",
            text: `Memory "${memoryId}" not found.`,
          },
        ],
        isError: true,
      };
    }

    if (shortTermMemory.has(memoryId)) {
      return {
        content: [
          {
            type: "text",
            text: `Memory "${memoryId}" is already in short-term storage.`,
          },
        ],
      };
    }

    promoteToShortTerm(memoryId);

    return {
      content: [
        {
          type: "text",
          text: `Promoted "${memoryId}" to short-term storage. It will now be included in fast access searches.`,
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
    case "MemoryContext":
      return handleMemoryContext(
        args as Parameters<typeof handleMemoryContext>[0],
      );
    case "MemoryPromote":
      return handleMemoryPromote(
        args as Parameters<typeof handleMemoryPromote>[0],
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
  shortTermMemory,
  longTermCompressed,
  clearAll: () => {
    memoryStore.clear();
    shortTermMemory.clear();
    longTermCompressed.clear();
    summaryIndex = null;
    cachedTree = null;
    treeLastBuilt = 0;
    invertedIndex.terms.clear();
    invertedIndex.lastBuilt = 0;
    shortTermIndex.terms.clear();
    shortTermIndex.lastBuilt = 0;
  },
  addTestMemory: addMemory,
  getConfig: () => CONFIG,
  stem,
  tokenize,
  hashContent,
  organizeTiers,
  calculateImportance,
  compressSession,
  getShortTermContext,
  getSummaryIndex: () => summaryIndex,
};
