/**
 * Memory Tool Handlers
 *
 * Implements progressive disclosure memory retrieval combining:
 * - claude-mem's 3-layer workflow (search → select → get)
 * - PageIndex's hierarchical tree navigation
 *
 * Uses in-memory storage with tree navigation.
 * TODO: Integrate with MemoryRouter when module resolution is unified.
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

// In-memory storage
const memoryStore = new Map<string, MemoryItem>();
let cachedTree: MemoryTree | null = null;
let treeLastBuilt = 0;
const TREE_CACHE_TTL = 5 * 60 * 1000;

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
 * Gets all memories.
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

  let results = all.filter((m) => {
    const contentMatch = m.content.toLowerCase().includes(queryLower);
    const tagMatch = m.metadata?.tags?.some((t: string) =>
      t.toLowerCase().includes(queryLower),
    );
    return contentMatch || tagMatch;
  });

  if (typeFilter && typeFilter !== "all") {
    results = results.filter((m) => m.metadata?.type === typeFilter);
  }

  results = results.map((m) => ({
    ...m,
    similarity: m.content.toLowerCase().includes(queryLower) ? 0.8 : 0.5,
  }));

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
    if (memory) results.push(memory);
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
  memoryStore.set(id, {
    id,
    content,
    metadata: { type, timestamp: new Date().toISOString(), tags },
  });
  cachedTree = null;
  return id;
}

/**
 * Gets timeline of memories around a specific point.
 */
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

/**
 * Builds the memory tree.
 */
async function buildTree(): Promise<MemoryTree> {
  const now = Date.now();
  if (cachedTree && now - treeLastBuilt < TREE_CACHE_TTL) return cachedTree;

  const memories = await getAllMemories();
  const sessions = new Map<string, MemoryItem[]>();
  const patterns: MemoryItem[] = [];
  const decisions: MemoryItem[] = [];
  const context: MemoryItem[] = [];

  for (const m of memories) {
    const type = m.metadata?.type || "unknown";
    const sessionId = m.metadata?.sessionId || "default";

    if (type === "pattern") patterns.push(m);
    else if (type === "decision") decisions.push(m);
    else if (type === "context" || type === "static") context.push(m);
    else {
      if (!sessions.has(sessionId)) sessions.set(sessionId, []);
      sessions.get(sessionId)!.push(m);
    }
  }

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
    // If tree node hint is provided, scope search to that branch
    let results: MemoryItem[];
    if (treeNodeHint) {
      const tree = await buildTree();
      const node = findNode(tree, treeNodeHint);
      if (node && node.memoryIds) {
        const branchMemories = await getMemoriesById(node.memoryIds);
        const queryLower = query.toLowerCase();
        results = branchMemories
          .filter(
            (m) =>
              m.content.toLowerCase().includes(queryLower) ||
              m.metadata?.tags?.some((t: string) =>
                t.toLowerCase().includes(queryLower),
              ),
          )
          .map((m) => ({
            ...m,
            similarity: m.content.toLowerCase().includes(queryLower)
              ? 0.8
              : 0.5,
          }))
          .slice(0, Math.min(limit, 50));
      } else {
        results = await searchMemories(query, Math.min(limit, 50), type);
      }
    } else {
      results = await searchMemories(query, Math.min(limit, 50), type);
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
    const result = await getTimeline(anchor, before, after);

    if (result.memories.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No memories found around anchor: "${anchor}". Use a valid memory ID or ISO timestamp.`,
          },
        ],
      };
    }

    let output = `## Memory Timeline\n\n`;
    output += `**Centered on:** ${anchor}\n`;
    output += `**Showing:** ${before} before, ${after} after\n\n`;

    for (let i = 0; i < result.memories.length; i++) {
      const m = result.memories[i];
      if (!m) continue;
      const isAnchor = i === result.anchorIndex;
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

    // Count by category
    const categories = {
      sessions: 0,
      patterns: 0,
      decisions: 0,
      context: 0,
      observations: 0,
    };

    for (const m of memories) {
      const type = m.metadata?.type || "unknown";
      if (type === "pattern") categories.patterns++;
      else if (type === "decision") categories.decisions++;
      else if (type === "context" || type === "static") categories.context++;
      else if (type === "tool-observation") categories.observations++;
      else categories.sessions++;
    }

    // Calculate tree depth
    const calcDepth = (node: MemoryTreeNode): number => {
      if (node.children.length === 0) return node.depth;
      return Math.max(...node.children.map(calcDepth));
    };
    const treeDepth = calcDepth(tree.root);

    let output = `## Memory Statistics\n\n`;
    output += `**Total memories:** ${memories.length}\n`;
    output += `**Total tokens:** ${formatTokens(tree.totalTokens)}\n`;
    output += `**Tree depth:** ${treeDepth}\n`;
    output += `**Last updated:** ${tree.lastUpdated}\n\n`;

    output += `### By Category\n`;
    output += `- Sessions: ${categories.sessions}\n`;
    output += `- Patterns: ${categories.patterns}\n`;
    output += `- Decisions: ${categories.decisions}\n`;
    output += `- Context: ${categories.context}\n`;
    output += `- Observations: ${categories.observations}\n\n`;

    output += `### Cache Status\n`;
    output += `- Cached items: ${memoryStore.size}\n`;
    output += `- Pending uploads: 0\n`;

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

/**
 * Formats a tree node for display.
 */
function formatNode(
  node: MemoryTreeNode,
  lines: string[],
  depth: number,
  maxDepth: number,
): void {
  if (depth > maxDepth) return;

  const indent = "  ".repeat(depth);
  const tokenLabel = formatTokens(node.tokenEstimate);

  if (node.type === "root") {
    for (const child of node.children) {
      formatNode(child, lines, depth, maxDepth);
    }
    return;
  }

  const countLabel =
    node.memoryCount === 1 ? "1 item" : `${node.memoryCount} items`;
  lines.push(`${indent}- **[${node.id}]** ${node.title}`);
  lines.push(`${indent}  ${node.summary} (${countLabel}, ${tokenLabel})`);

  if (node.tags && node.tags.length > 0) {
    lines.push(`${indent}  Tags: ${node.tags.slice(0, 5).join(", ")}`);
  }

  if (depth < maxDepth) {
    for (const child of node.children) {
      formatNode(child, lines, depth + 1, maxDepth);
    }
  } else if (node.children.length > 0) {
    lines.push(
      `${indent}  └── (${node.children.length} sub-sections, use MemoryNavigate to expand)`,
    );
  }
}

/**
 * Formats the tree for display.
 */
async function formatTreeOutput(maxDepth: number): Promise<string> {
  const tree = await buildTree();

  const lines: string[] = [];
  lines.push("## Memory Tree Index");
  lines.push("");
  lines.push(
    `Total: ${tree.totalMemories} memories (${formatTokens(tree.totalTokens)})`,
  );
  lines.push(`Last updated: ${tree.lastUpdated}`);
  lines.push("");

  formatNode(tree.root, lines, 0, maxDepth);

  lines.push("");
  lines.push("---");
  lines.push("**Navigation tips:**");
  lines.push('- Use `MemoryNavigate nodeId="<id>"` to explore a branch');
  lines.push('- Use `MemorySearch query="..."` to search within any branch');
  lines.push("- Use `MemoryGet ids=[...]` to retrieve specific memories");

  return lines.join("\n");
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

    const treeOutput = await formatTreeOutput(
      Math.max(1, Math.min(maxDepth, 4)),
    );
    return { content: [{ type: "text", text: treeOutput }] };
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

/**
 * Expands a node to show its details and children.
 */
async function expandNode(nodeId: string): Promise<string> {
  const tree = await buildTree();
  const node = findNode(tree, nodeId);

  if (!node) {
    return `Node "${nodeId}" not found in memory tree.`;
  }

  const path = getPathToNode(tree, nodeId);
  const lines: string[] = [];

  lines.push(`## ${node.title}`);
  lines.push(`**Path:** ${path.join(" → ")}`);
  lines.push("");
  lines.push(node.summary);
  lines.push("");

  if (node.startTime || node.endTime) {
    const start = node.startTime
      ? new Date(node.startTime).toLocaleString()
      : "unknown";
    const end = node.endTime
      ? new Date(node.endTime).toLocaleString()
      : "unknown";
    lines.push(`**Time range:** ${start} - ${end}`);
  }

  if (node.tags && node.tags.length > 0) {
    lines.push(`**Tags:** ${node.tags.join(", ")}`);
  }

  lines.push("");

  if (node.memoryIds && node.memoryIds.length > 0) {
    const tokenLabel = formatTokens(node.tokenEstimate);
    lines.push(
      `**Contains ${node.memoryIds.length} memories** (${tokenLabel})`,
    );
    lines.push("");

    if (node.memoryIds.length <= 10) {
      lines.push("Memory IDs:");
      for (const id of node.memoryIds) {
        lines.push(`- ${id}`);
      }
    } else {
      lines.push(
        `First 5 IDs: ${node.memoryIds
          .slice(0, 5)
          .map((id) => `"${id}"`)
          .join(", ")}`,
      );
      lines.push("");
      lines.push(
        `Use \`MemoryGet ids=${JSON.stringify(node.memoryIds.slice(0, 5))}\` to retrieve.`,
      );
    }
  }

  if (node.children.length > 0) {
    lines.push("");
    lines.push("**Sub-sections:**");
    lines.push("");

    for (const child of node.children) {
      const tokenLabel = formatTokens(child.tokenEstimate);
      const countLabel =
        child.memoryCount === 1 ? "1 item" : `${child.memoryCount} items`;

      lines.push(`- **[${child.id}]** ${child.title}`);
      lines.push(`  ${child.summary} (${countLabel}, ${tokenLabel})`);
    }
  }

  return lines.join("\n");
}

async function handleMemoryNavigate(args: {
  nodeId: string;
}): Promise<ToolResult> {
  const { nodeId } = args;

  try {
    const output = await expandNode(nodeId);

    if (output.includes("not found")) {
      return {
        content: [
          {
            type: "text",
            text: `Node "${nodeId}" not found.\n\nUse \`MemoryTree\` to see available nodes.`,
          },
        ],
      };
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
