/**
 * Memory Tools
 *
 * MCP tool definitions for the progressive disclosure memory system.
 * Combines claude-mem's 3-layer approach with PageIndex-style tree navigation.
 */

import type { ToolDefinition } from "../types/index.js";

/**
 * Memory tool names for routing
 */
export const memoryToolNames = [
  "MemorySearch",
  "MemoryGet",
  "MemoryTimeline",
  "MemoryAdd",
  "MemoryStats",
  "MemoryTree",
  "MemoryNavigate",
  "MemoryContext",
  "MemoryPromote",
] as const;

export type MemoryToolName = (typeof memoryToolNames)[number];

/**
 * Memory tool definitions
 */
export const memoryTools: ToolDefinition[] = [
  {
    name: "MemorySearch",
    description:
      "Search stored memories using two-tier system. Searches short-term memory first (recent + important), then expands to long-term if needed. Returns compact index with IDs and summaries (~50-100 tokens per result). Use MemoryGet to fetch full details.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (natural language or keywords)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10, max: 50)",
        },
        type: {
          type: "string",
          enum: [
            "all",
            "conversation",
            "observation",
            "session-summary",
            "user-prompt",
            "decision",
            "pattern",
          ],
          description: "Filter by memory type (default: all)",
        },
        treeNodeHint: {
          type: "string",
          description:
            "Optional: Limit search to a specific tree branch (node ID from MemoryTree)",
        },
        tier: {
          type: "string",
          enum: ["short-term", "long-term", "all"],
          description:
            "Which memory tier to search. 'all' (default) searches short-term first, then expands to long-term if few results found",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "MemoryGet",
    description:
      "Fetch full content for specific memory IDs (~500-1000 tokens per item). Use after MemorySearch or MemoryNavigate to retrieve details for relevant items only. This is the final step in progressive disclosure.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Memory IDs from MemorySearch or MemoryNavigate results",
        },
      },
      required: ["ids"],
    },
  },
  {
    name: "MemoryTimeline",
    description:
      "Get chronological view of memories around a specific time or event (~200 tokens). Useful for understanding the sequence of past work in a session.",
    inputSchema: {
      type: "object",
      properties: {
        anchor: {
          type: "string",
          description:
            "Memory ID or ISO timestamp (e.g., '2024-01-15T10:30:00Z') to center timeline around",
        },
        before: {
          type: "number",
          description: "Number of items to show before anchor (default: 5)",
        },
        after: {
          type: "number",
          description: "Number of items to show after anchor (default: 5)",
        },
      },
      required: ["anchor"],
    },
  },
  {
    name: "MemoryAdd",
    description:
      "Manually store important context for future sessions. Use sparingly for key decisions, patterns, or learnings that should persist. Automatically captured content is usually sufficient.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Content to remember (will be filtered for privacy)",
        },
        type: {
          type: "string",
          enum: [
            "conversation",
            "observation",
            "decision",
            "pattern",
            "context",
          ],
          description: "Memory type for categorization (default: conversation)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional tags for categorization (e.g., ['auth', 'typescript'])",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "MemoryStats",
    description:
      "Get memory system statistics including total memories, token usage, sync status, and storage health. Useful for understanding memory capacity and system state.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "MemoryTree",
    description:
      "View the hierarchical memory index (PageIndex-style). Use this to understand what memories exist and reason about which branches to explore. More effective than keyword search for complex queries requiring context. Returns ~200-400 tokens.",
    inputSchema: {
      type: "object",
      properties: {
        maxDepth: {
          type: "number",
          description: "Maximum tree depth to display (1-4, default: 2)",
        },
      },
    },
  },
  {
    name: "MemoryNavigate",
    description:
      "Navigate to a specific node in the memory tree and see its contents/children. Use after MemoryTree to drill into relevant sections. Returns memory IDs for use with MemoryGet.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description:
            "The node ID from MemoryTree output (e.g., 'sessions', 'session-abc123', 'decisions')",
        },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "MemoryContext",
    description:
      "Get the short-term memory context for loading into conversation. Returns recent sessions and important memories (decisions, patterns) that should be readily available. Also includes a summary of what's in long-term storage for discoverability. Use this at the start of a session to quickly load relevant context.",
    inputSchema: {
      type: "object",
      properties: {
        maxTokens: {
          type: "number",
          description:
            "Maximum tokens to include in context (default: 800). Prioritizes most important/recent.",
        },
      },
    },
  },
  {
    name: "MemoryPromote",
    description:
      "Promote a memory from long-term to short-term storage. Use this when you need frequent access to a memory that was compressed into long-term storage. The memory will be added to the fast-access tier.",
    inputSchema: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "The memory ID to promote to short-term storage",
        },
      },
      required: ["memoryId"],
    },
  },
];
