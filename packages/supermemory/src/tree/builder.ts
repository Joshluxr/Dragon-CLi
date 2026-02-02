/**
 * Memory Tree Builder
 *
 * Builds a hierarchical tree from flat memories.
 * PageIndex-inspired structure for reasoning-based navigation.
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

import type { MemoryItem } from "../utils/formatter.js";
import { estimateTokens } from "../utils/tokens.js";
import {
  type MemoryTree,
  type MemoryTreeNode,
  type TreeBuilderConfig,
  DEFAULT_TREE_CONFIG,
} from "./types.js";
import {
  categorizeMemory,
  extractSessionTitle,
  generateMemorySummary,
} from "./categorizer.js";

/**
 * Extended memory item with additional metadata for tree building.
 */
interface EnrichedMemory extends MemoryItem {
  tokenCount: number;
  category: string;
  sessionId: string;
  timestamp: number;
}

/**
 * Builds a hierarchical memory tree from flat memories.
 */
export class MemoryTreeBuilder {
  private memories: EnrichedMemory[] = [];
  private config: TreeBuilderConfig;

  constructor(
    rawMemories: MemoryItem[],
    config: Partial<TreeBuilderConfig> = {},
  ) {
    this.config = { ...DEFAULT_TREE_CONFIG, ...config };
    this.memories = this.enrichMemories(rawMemories);
  }

  /**
   * Enriches raw memories with computed fields.
   */
  private enrichMemories(rawMemories: MemoryItem[]): EnrichedMemory[] {
    return rawMemories.map((m) => {
      const categorization = categorizeMemory(
        m.content,
        m.metadata?.type,
        m.metadata?.sessionId,
      );

      return {
        ...m,
        tokenCount: estimateTokens(m.content),
        category: categorization.category,
        sessionId: m.metadata?.sessionId || "unknown",
        timestamp: m.metadata?.timestamp
          ? new Date(m.metadata.timestamp).getTime()
          : Date.now(),
        metadata: {
          ...m.metadata,
          tags: categorization.tags,
          relevanceHints: categorization.relevanceHints,
        },
      };
    });
  }

  /**
   * Builds the complete memory tree.
   */
  async build(): Promise<MemoryTree> {
    const root = this.createRootNode();

    // Group memories by category
    const sessions = this.groupBySession();
    const patterns = this.memories.filter((m) => m.category === "pattern");
    const decisions = this.memories.filter((m) => m.category === "decision");
    const context = this.memories.filter((m) => m.category === "context");

    // Build sessions category
    if (sessions.size > 0) {
      const sessionsNode = this.createCategoryNode(
        "sessions",
        "Sessions",
        `Chronological session history (${sessions.size} sessions)`,
      );

      // Sort sessions by most recent first
      const sortedSessions = [...sessions.entries()].sort((a, b) => {
        const aTime = Math.max(...a[1].map((m) => m.timestamp));
        const bTime = Math.max(...b[1].map((m) => m.timestamp));
        return bTime - aTime;
      });

      for (const [sessionId, sessionMemories] of sortedSessions) {
        const sessionNode = this.buildSessionNode(sessionId, sessionMemories);
        sessionsNode.children.push(sessionNode);
      }

      this.updateNodeStats(sessionsNode);
      root.children.push(sessionsNode);
    }

    // Build patterns category
    if (patterns.length > 0) {
      const patternsNode = this.createCategoryNode(
        "patterns",
        "Learned Patterns",
        "Coding preferences, conventions, and behaviors observed",
      );
      patternsNode.memoryIds = patterns.map((p) => p.id);
      patternsNode.memoryCount = patterns.length;
      patternsNode.tokenEstimate = patterns.reduce(
        (sum, p) => sum + p.tokenCount,
        0,
      );
      patternsNode.tags = this.aggregateTags(patterns);
      root.children.push(patternsNode);
    }

    // Build decisions category
    if (decisions.length > 0) {
      const decisionsNode = this.createCategoryNode(
        "decisions",
        "Key Decisions",
        "Important architectural and design choices made",
      );
      decisionsNode.memoryIds = decisions.map((d) => d.id);
      decisionsNode.memoryCount = decisions.length;
      decisionsNode.tokenEstimate = decisions.reduce(
        (sum, d) => sum + d.tokenCount,
        0,
      );
      decisionsNode.tags = this.aggregateTags(decisions);
      root.children.push(decisionsNode);
    }

    // Build context category
    if (context.length > 0) {
      const contextNode = this.createCategoryNode(
        "context",
        "Project Context",
        "Static project information and configuration",
      );
      contextNode.memoryIds = context.map((c) => c.id);
      contextNode.memoryCount = context.length;
      contextNode.tokenEstimate = context.reduce(
        (sum, c) => sum + c.tokenCount,
        0,
      );
      contextNode.tags = this.aggregateTags(context);
      root.children.push(contextNode);
    }

    // Calculate root totals
    this.updateNodeStats(root);

    return {
      root,
      version: 1,
      lastUpdated: new Date().toISOString(),
      totalMemories: this.memories.length,
      totalTokens: root.tokenEstimate,
    };
  }

  /**
   * Creates the root node.
   */
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

  /**
   * Creates a category node.
   */
  private createCategoryNode(
    id: string,
    title: string,
    summary: string,
  ): MemoryTreeNode {
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

  /**
   * Groups memories by session ID.
   */
  private groupBySession(): Map<string, EnrichedMemory[]> {
    const sessions = new Map<string, EnrichedMemory[]>();

    // Only include memories that belong in sessions (not standalone patterns/decisions/context)
    const sessionMemories = this.memories.filter(
      (m) =>
        m.category === "session" ||
        m.category === "observation" ||
        (m.sessionId !== "unknown" &&
          m.category !== "pattern" &&
          m.category !== "context"),
    );

    for (const memory of sessionMemories) {
      const sessionId = memory.sessionId;
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, []);
      }
      sessions.get(sessionId)!.push(memory);
    }

    return sessions;
  }

  /**
   * Builds a session node with potential sub-topics.
   */
  private buildSessionNode(
    sessionId: string,
    memories: EnrichedMemory[],
  ): MemoryTreeNode {
    // Sort by timestamp
    memories.sort((a, b) => a.timestamp - b.timestamp);

    const title = extractSessionTitle(memories);
    const decisions = memories.filter((m) => m.category === "decision");
    const observations = memories.filter(
      (m) => m.category === "observation" || m.metadata?.type === "observation",
    );

    const node: MemoryTreeNode = {
      id: `session-${sessionId.substring(0, 12)}`,
      title,
      summary: this.generateSessionSummary(memories),
      type: "session",
      parentId: "sessions",
      children: [],
      depth: 2,
      memoryCount: memories.length,
      tokenEstimate: memories.reduce((sum, m) => sum + m.tokenCount, 0),
      memoryIds: memories.map((m) => m.id),
      startTime: new Date(
        Math.min(...memories.map((m) => m.timestamp)),
      ).toISOString(),
      endTime: new Date(
        Math.max(...memories.map((m) => m.timestamp)),
      ).toISOString(),
      tags: this.aggregateTags(memories),
    };

    // Add sub-nodes for substantial groups
    if (decisions.length >= this.config.minMemoriesForTopic) {
      node.children.push({
        id: `${node.id}-decisions`,
        title: "Session Decisions",
        summary: `${decisions.length} decisions made during this session`,
        type: "topic",
        parentId: node.id,
        children: [],
        depth: 3,
        memoryCount: decisions.length,
        tokenEstimate: decisions.reduce((sum, d) => sum + d.tokenCount, 0),
        memoryIds: decisions.map((d) => d.id),
        tags: this.aggregateTags(decisions),
      });
    }

    if (observations.length >= this.config.minMemoriesForTopic * 2) {
      node.children.push({
        id: `${node.id}-observations`,
        title: "Tool Observations",
        summary: `${observations.length} tool results captured`,
        type: "topic",
        parentId: node.id,
        children: [],
        depth: 3,
        memoryCount: observations.length,
        tokenEstimate: observations.reduce((sum, o) => sum + o.tokenCount, 0),
        memoryIds: observations.map((o) => o.id),
        tags: this.aggregateTags(observations),
      });
    }

    return node;
  }

  /**
   * Generates a session summary from memories.
   */
  private generateSessionSummary(memories: EnrichedMemory[]): string {
    const userPrompt = memories.find((m) => m.metadata?.type === "user-prompt");
    const summary = memories.find(
      (m) => m.metadata?.type === "session-summary",
    );

    if (summary) {
      return generateMemorySummary(summary.content, 100);
    }

    if (userPrompt) {
      return `Request: ${generateMemorySummary(userPrompt.content, 80)}`;
    }

    const types = new Set(
      memories.map((m) => m.metadata?.type).filter(Boolean),
    );
    return `Session with ${memories.length} memories (${[...types].join(", ")})`;
  }

  /**
   * Aggregates tags from a set of memories.
   */
  private aggregateTags(memories: EnrichedMemory[]): string[] {
    const tagCounts = new Map<string, number>();

    for (const memory of memories) {
      const tags = memory.metadata?.tags as string[] | undefined;
      if (tags) {
        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }

    // Sort by frequency and take top tags
    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }

  /**
   * Updates memory count and token estimate for a node from its children.
   */
  private updateNodeStats(node: MemoryTreeNode): void {
    if (node.children.length === 0) return;

    let memoryCount = node.memoryIds?.length || 0;
    let tokenEstimate = 0;

    for (const child of node.children) {
      this.updateNodeStats(child);
      memoryCount += child.memoryCount;
      tokenEstimate += child.tokenEstimate;
    }

    node.memoryCount = memoryCount;
    if (tokenEstimate > 0) {
      node.tokenEstimate = tokenEstimate;
    }
  }
}
