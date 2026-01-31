/**
 * Memory Tool Handlers
 *
 * Implements progressive disclosure memory retrieval combining:
 * - claude-mem's 3-layer workflow (search → select → get)
 * - PageIndex's hierarchical tree navigation
 */

import type { ToolResult } from "../types/index.js";
import type { MemoryToolName } from "../tools/memory.js";

// Types for memory operations
interface MemoryItem {
  id: string;
  content: string;
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

// In-memory storage for demo/testing (replace with actual MemoryRouter integration)
const memoryStore = new Map<string, MemoryItem>();
let cachedTree: MemoryTree | null = null;
let treeLastBuilt = 0;
const TREE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Estimates tokens for text content.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const isCode = /[{}\[\]();=]/.test(text);
  return Math.ceil(text.length * (isCode ? 0.35 : 0.25));
}

/**
 * Formats token count for display.
 */
function formatTokens(tokens: number): string {
  if (tokens < 100) return `~${tokens} tokens`;
  if (tokens < 1000) return `~${Math.round(tokens / 10) * 10} tokens`;
  return `~${(tokens / 1000).toFixed(1)}k tokens`;
}

/**
 * Truncates text to a maximum length.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Gets all memories (in production, this connects to MemoryRouter).
 */
async function getAllMemories(): Promise<MemoryItem[]> {
  return [...memoryStore.values()];
}

/**
 * Searches memories by query.
 */
async function searchMemories(
  query: string,
  limit: number,
  typeFilter?: string,
): Promise<MemoryItem[]> {
  const all = await getAllMemories();
  const queryLower = query.toLowerCase();

  // Simple keyword matching (in production, use vector similarity)
  let results = all.filter((m) => {
    const contentMatch = m.content.toLowerCase().includes(queryLower);
    const tagMatch = m.metadata?.tags?.some((t) =>
      t.toLowerCase().includes(queryLower),
    );
    return contentMatch || tagMatch;
  });

  // Filter by type
  if (typeFilter && typeFilter !== "all") {
    results = results.filter((m) => m.metadata?.type === typeFilter);
  }

  // Calculate basic similarity score
  results = results.map((m) => ({
    ...m,
    similarity: m.content.toLowerCase().includes(queryLower) ? 0.8 : 0.5,
  }));

  // Sort by similarity
  results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  return results.slice(0, limit);
}

/**
 * Gets memories by ID.
 */
async function getMemoriesById(ids: string[]): Promise<MemoryItem[]> {
  const results: MemoryItem[] = [];
  for (const id of ids) {
    const memory = memoryStore.get(id);
    if (memory) {
      results.push(memory);
    }
  }
  return results;
}

/**
 * Adds a new memory.
 */
async function addMemory(
  content: string,
  type: string,
  tags?: string[],
): Promise<string> {
  const id = `mem-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const memory: MemoryItem = {
    id,
    content,
    metadata: {
      type,
      timestamp: new Date().toISOString(),
      tags,
    },
  };
  memoryStore.set(id, memory);

  // Invalidate tree cache
  cachedTree = null;

  return id;
}

/**
 * Builds the memory tree.
 */
async function buildTree(): Promise<MemoryTree> {
  const now = Date.now();

  // Return cached tree if fresh
  if (cachedTree && now - treeLastBuilt < TREE_CACHE_TTL) {
    return cachedTree;
  }

  const memories = await getAllMemories();

  // Group by session
  const sessions = new Map<string, MemoryItem[]>();
  const patterns: MemoryItem[] = [];
  const decisions: MemoryItem[] = [];
  const context: MemoryItem[] = [];

  for (const m of memories) {
    const type = m.metadata?.type || "unknown";
    const sessionId = m.metadata?.sessionId || "default";

    if (type === "pattern") {
      patterns.push(m);
    } else if (type === "decision") {
      decisions.push(m);
    } else if (type === "context" || type === "static") {
      context.push(m);
    } else {
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, []);
      }
      sessions.get(sessionId)!.push(m);
    }
  }

  // Build tree structure
  const root: MemoryTreeNode = {
    id: "root",
    title: "Memory Index",
    summary: "Hierarchical index of all stored memories",
    type: "root",
    parentId: null,
    children: [],
    depth: 0,
    memoryCount: memories.length,
    tokenEstimate: memories.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    ),
  };

  // Sessions category
  if (sessions.size > 0) {
    const sessionsNode: MemoryTreeNode = {
      id: "sessions",
      title: "Sessions",
      summary: `Chronological session history (${sessions.size} sessions)`,
      type: "category",
      parentId: "root",
      children: [],
      depth: 1,
      memoryCount: 0,
      tokenEstimate: 0,
    };

    for (const [sessionId, sessionMemories] of sessions) {
      const sessionNode: MemoryTreeNode = {
        id: `session-${sessionId.substring(0, 12)}`,
        title: truncate(
          sessionMemories[0]?.content || `Session ${sessionId}`,
          50,
        ),
        summary: `${sessionMemories.length} memories from this session`,
        type: "session",
        parentId: "sessions",
        children: [],
        depth: 2,
        memoryIds: sessionMemories.map((m) => m.id),
        memoryCount: sessionMemories.length,
        tokenEstimate: sessionMemories.reduce(
          (sum, m) => sum + estimateTokens(m.content),
          0,
        ),
        startTime: sessionMemories[0]?.metadata?.timestamp,
        endTime:
          sessionMemories[sessionMemories.length - 1]?.metadata?.timestamp,
      };
      sessionsNode.children.push(sessionNode);
      sessionsNode.memoryCount += sessionNode.memoryCount;
      sessionsNode.tokenEstimate += sessionNode.tokenEstimate;
    }

    root.children.push(sessionsNode);
  }

  // Patterns category
  if (patterns.length > 0) {
    root.children.push({
      id: "patterns",
      title: "Learned Patterns",
      summary: "Coding preferences, conventions, and behaviors",
      type: "category",
      parentId: "root",
      children: [],
      depth: 1,
      memoryIds: patterns.map((p) => p.id),
      memoryCount: patterns.length,
      tokenEstimate: patterns.reduce(
        (sum, p) => sum + estimateTokens(p.content),
        0,
      ),
    });
  }

  // Decisions category
  if (decisions.length > 0) {
    root.children.push({
      id: "decisions",
      title: "Key Decisions",
      summary: "Important architectural and design choices",
      type: "category",
      parentId: "root",
      children: [],
      depth: 1,
      memoryIds: decisions.map((d) => d.id),
      memoryCount: decisions.length,
      tokenEstimate: decisions.reduce(
        (sum, d) => sum + estimateTokens(d.content),
        0,
      ),
    });
  }

  // Context category
  if (context.length > 0) {
    root.children.push({
      id: "context",
      title: "Project Context",
      summary: "Static project information and configuration",
      type: "category",
      parentId: "root",
      children: [],
      depth: 1,
      memoryIds: context.map((c) => c.id),
      memoryCount: context.length,
      tokenEstimate: context.reduce(
        (sum, c) => sum + estimateTokens(c.content),
        0,
      ),
    });
  }

  const tree: MemoryTree = {
    root,
    version: 1,
    lastUpdated: new Date().toISOString(),
    totalMemories: memories.length,
    totalTokens: root.tokenEstimate,
  };

  cachedTree = tree;
  treeLastBuilt = now;

  return tree;
}

/**
 * Finds a node in the tree by ID.
 */
function findNode(tree: MemoryTree, nodeId: string): MemoryTreeNode | null {
  const search = (node: MemoryTreeNode): MemoryTreeNode | null => {
    if (node.id === nodeId) return node;
    for (const child of node.children) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  };
  return search(tree.root);
}

/**
 * Gets path from root to a node.
 */
function getPathToNode(tree: MemoryTree, nodeId: string): string[] {
  const path: string[] = [];

  const search = (node: MemoryTreeNode, currentPath: string[]): boolean => {
    currentPath.push(node.id);
    if (node.id === nodeId) {
      path.push(...currentPath);
      return true;
    }
    for (const child of node.children) {
      if (search(child, currentPath)) return true;
    }
    currentPath.pop();
    return false;
  };

  search(tree.root, []);
  return path;
}

// Handler implementations

async function handleMemorySearch(args: {
  query: string;
  limit?: number;
  type?: string;
  treeNodeHint?: string;
}): Promise<ToolResult> {
  const { query, limit = 10, type, treeNodeHint } = args;

  try {
    let results = await searchMemories(query, Math.min(limit, 50), type);

    // Filter by tree node if specified
    if (treeNodeHint) {
      const tree = await buildTree();
      const node = findNode(tree, treeNodeHint);
      if (node?.memoryIds) {
        const nodeIds = new Set(node.memoryIds);
        results = results.filter((r) => nodeIds.has(r.id));
      }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No memories found for query: "${query}"${type ? ` (type: ${type})` : ""}${treeNodeHint ? ` (in branch: ${treeNodeHint})` : ""}\n\nTry:\n- Different keywords\n- MemoryTree to browse available memories\n- Remove type filter`,
          },
        ],
      };
    }

    // Format as compact index
    const indexItems = results.map((r) => {
      const tokens = estimateTokens(r.content);
      return {
        id: r.id,
        summary: truncate(r.content, 100),
        type: r.metadata?.type || "unknown",
        similarity: r.similarity ? `${Math.round(r.similarity * 100)}%` : "N/A",
        tokens: formatTokens(tokens),
        fullTokens: tokens,
      };
    });

    const summaryTokens = indexItems.length * 75;
    const fullTokens = indexItems.reduce((sum, i) => sum + i.fullTokens, 0);

    let output = `## Memory Search Results (${results.length} items)\n\n`;
    output += `**Summary tokens:** ~${summaryTokens} | **Full retrieval:** ${formatTokens(fullTokens)}\n\n`;

    for (const item of indexItems) {
      output += `- **[${item.id}]** (${item.type}, ${item.tokens})\n`;
      output += `  ${item.summary}\n`;
      output += `  Match: ${item.similarity}\n\n`;
    }

    output += `---\n`;
    output += `Use \`MemoryGet ids=[${indexItems
      .slice(0, 3)
      .map((i) => `"${i.id}"`)
      .join(", ")}]\` to retrieve full content.`;

    return { content: [{ type: "text", text: output }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error searching memories: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryGet(args: { ids: string[] }): Promise<ToolResult> {
  const { ids } = args;

  if (!ids || ids.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No memory IDs provided. Use MemorySearch or MemoryNavigate to find memory IDs first.",
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
            text: `No memories found for IDs: ${ids.join(", ")}`,
          },
        ],
      };
    }

    const totalTokens = memories.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );

    let output = `## Retrieved Memories (${memories.length} items, ${formatTokens(totalTokens)})\n\n`;

    for (const memory of memories) {
      output += `### ${memory.id}\n`;
      output += `**Type:** ${memory.metadata?.type || "unknown"}`;
      if (memory.metadata?.timestamp) {
        output += ` | **Time:** ${new Date(memory.metadata.timestamp).toLocaleString()}`;
      }
      if (memory.metadata?.tags?.length) {
        output += ` | **Tags:** ${memory.metadata.tags.join(", ")}`;
      }
      output += `\n\n`;
      output += memory.content;
      output += `\n\n---\n\n`;
    }

    return { content: [{ type: "text", text: output }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving memories: ${error instanceof Error ? error.message : String(error)}`,
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
    const memories = await getAllMemories();

    // Sort by timestamp
    const sorted = memories
      .filter((m) => m.metadata?.timestamp)
      .sort(
        (a, b) =>
          new Date(a.metadata!.timestamp!).getTime() -
          new Date(b.metadata!.timestamp!).getTime(),
      );

    // Find anchor
    let anchorIndex: number;
    if (anchor.startsWith("mem-")) {
      anchorIndex = sorted.findIndex((m) => m.id === anchor);
    } else {
      // Treat as timestamp
      const anchorTime = new Date(anchor).getTime();
      anchorIndex = sorted.findIndex(
        (m) => new Date(m.metadata!.timestamp!).getTime() >= anchorTime,
      );
    }

    if (anchorIndex === -1) {
      return {
        content: [
          {
            type: "text",
            text: `Anchor "${anchor}" not found in timeline. Use a valid memory ID or ISO timestamp.`,
          },
        ],
      };
    }

    const startIndex = Math.max(0, anchorIndex - before);
    const endIndex = Math.min(sorted.length, anchorIndex + after + 1);
    const timeline = sorted.slice(startIndex, endIndex);

    let output = `## Memory Timeline\n\n`;
    output += `**Centered on:** ${anchor}\n`;
    output += `**Showing:** ${before} before, ${after} after\n\n`;

    for (let i = 0; i < timeline.length; i++) {
      const m = timeline[i];
      if (!m) continue;
      const isAnchor = i === anchorIndex - startIndex;
      const marker = isAnchor ? ">>> " : "    ";

      const timestamp = m.metadata?.timestamp
        ? new Date(m.metadata.timestamp).toLocaleString()
        : "unknown time";
      output += `${marker}**[${m.id}]** ${timestamp}\n`;
      output += `${marker}${m.metadata?.type || "unknown"}: ${truncate(m.content, 80)}\n\n`;
    }

    return { content: [{ type: "text", text: output }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting timeline: ${error instanceof Error ? error.message : String(error)}`,
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
          text: "Content too short. Provide meaningful content to remember (at least 10 characters).",
        },
      ],
      isError: true,
    };
  }

  try {
    const id = await addMemory(content, type, tags);

    return {
      content: [
        {
          type: "text",
          text: `Memory added successfully.\n\n**ID:** ${id}\n**Type:** ${type}${tags?.length ? `\n**Tags:** ${tags.join(", ")}` : ""}\n\nThis will be available in future sessions via MemorySearch or MemoryTree.`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error adding memory: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMemoryStats(): Promise<ToolResult> {
  try {
    const memories = await getAllMemories();
    const tree = await buildTree();

    const byType = new Map<string, number>();
    let totalTokens = 0;

    for (const m of memories) {
      const type = m.metadata?.type || "unknown";
      byType.set(type, (byType.get(type) || 0) + 1);
      totalTokens += estimateTokens(m.content);
    }

    let output = `## Memory Statistics\n\n`;
    output += `**Total memories:** ${memories.length}\n`;
    output += `**Total tokens:** ${formatTokens(totalTokens)}\n`;
    output += `**Tree version:** ${tree.version}\n`;
    output += `**Last updated:** ${tree.lastUpdated}\n\n`;

    output += `### By Type\n`;
    for (const [type, count] of byType) {
      output += `- ${type}: ${count}\n`;
    }

    output += `\n### Tree Structure\n`;
    for (const child of tree.root.children) {
      output += `- ${child.title}: ${child.memoryCount} memories (${formatTokens(child.tokenEstimate)})\n`;
    }

    return { content: [{ type: "text", text: output }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting stats: ${error instanceof Error ? error.message : String(error)}`,
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
            text: `## Memory Tree Index\n\nNo memories stored yet. Use MemoryAdd to store important context for future sessions.`,
          },
        ],
      };
    }

    let output = `## Memory Tree Index\n\n`;
    output += `**Total:** ${tree.totalMemories} memories (${formatTokens(tree.totalTokens)})\n`;
    output += `**Last updated:** ${tree.lastUpdated}\n\n`;

    const formatNode = (node: MemoryTreeNode, depth: number) => {
      if (depth > maxDepth || node.type === "root") {
        if (node.type === "root") {
          for (const child of node.children) {
            formatNode(child, depth);
          }
        }
        return;
      }

      const indent = "  ".repeat(depth);
      const tokens = formatTokens(node.tokenEstimate);
      const count =
        node.memoryCount === 1 ? "1 item" : `${node.memoryCount} items`;

      output += `${indent}- **[${node.id}]** ${node.title}\n`;
      output += `${indent}  ${node.summary} (${count}, ${tokens})\n`;

      if (depth < maxDepth) {
        for (const child of node.children) {
          formatNode(child, depth + 1);
        }
      } else if (node.children.length > 0) {
        output += `${indent}  └── (${node.children.length} sub-sections)\n`;
      }
    };

    formatNode(tree.root, 0);

    output += `\n---\n`;
    output += `**Navigation:**\n`;
    output += `- \`MemoryNavigate nodeId="sessions"\` - Explore session history\n`;
    output += `- \`MemoryNavigate nodeId="decisions"\` - View key decisions\n`;
    output += `- \`MemorySearch query="..."\` - Search within any branch`;

    return { content: [{ type: "text", text: output }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error building tree: ${error instanceof Error ? error.message : String(error)}`,
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
            text: `Node "${nodeId}" not found.\n\nUse \`MemoryTree\` to see available nodes.`,
          },
        ],
      };
    }

    const path = getPathToNode(tree, nodeId);

    let output = `## ${node.title}\n\n`;
    output += `**Path:** ${path.join(" → ")}\n`;
    output += `**Type:** ${node.type}\n`;
    output += `${node.summary}\n\n`;

    if (node.startTime || node.endTime) {
      output += `**Time range:** ${node.startTime || "?"} - ${node.endTime || "?"}\n\n`;
    }

    if (node.memoryIds && node.memoryIds.length > 0) {
      output += `### Contains ${node.memoryIds.length} memories (${formatTokens(node.tokenEstimate)})\n\n`;

      if (node.memoryIds.length <= 10) {
        output += `Memory IDs:\n`;
        for (const id of node.memoryIds) {
          output += `- ${id}\n`;
        }
      } else {
        output += `First 5 IDs:\n`;
        for (const id of node.memoryIds.slice(0, 5)) {
          output += `- ${id}\n`;
        }
        output += `...(${node.memoryIds.length - 5} more)\n`;
      }

      output += `\nUse \`MemoryGet ids=${JSON.stringify(node.memoryIds.slice(0, 5))}\` to retrieve content.\n`;
    }

    if (node.children.length > 0) {
      output += `\n### Sub-sections (${node.children.length})\n\n`;
      for (const child of node.children) {
        output += `- **[${child.id}]** ${child.title}\n`;
        output += `  ${child.summary} (${child.memoryCount} items, ${formatTokens(child.tokenEstimate)})\n`;
      }
    }

    return { content: [{ type: "text", text: output }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error navigating: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Routes memory tool calls to appropriate handlers.
 */
export async function handleMemoryTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const toolName = name as MemoryToolName;

  switch (toolName) {
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
        content: [
          {
            type: "text",
            text: `Unknown memory tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
}
