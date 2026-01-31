/**
 * MemoryService - Facade for MCP memory tools.
 *
 * Provides a high-level interface for memory operations combining:
 * - MemoryRouter (storage layer)
 * - MemoryTreeBuilder (hierarchical organization)
 * - TreeNavigator (navigation and formatting)
 */

import { getMemoryRouter, resetRouter } from "../cache/factory.js";
import type { MemoryRouter } from "../cache/router.js";
import type { MemoryItem } from "../utils/formatter.js";
import type { CacheStats } from "../cache/types.js";
import { MemoryTreeBuilder } from "../tree/builder.js";
import { TreeNavigator } from "../tree/navigator.js";
import type { MemoryTree } from "../tree/types.js";
import { estimateTokens } from "../utils/tokens.js";
import { filterPrivateContent, shouldStore } from "../utils/privacy.js";
import { loadSettings } from "../utils/settings.js";

/**
 * Memory search options.
 */
export interface MemorySearchOptions {
  limit?: number;
  type?: string;
  treeNodeHint?: string;
}

/**
 * Memory add options.
 */
export interface MemoryAddOptions {
  type?: string;
  tags?: string[];
  sessionId?: string;
}

/**
 * Memory stats result.
 */
export interface MemoryStats {
  totalMemories: number;
  totalTokens: number;
  cacheStats: CacheStats;
  treeDepth: number;
  categories: {
    sessions: number;
    patterns: number;
    decisions: number;
    context: number;
    observations: number;
  };
  lastUpdated: string;
}

/**
 * Singleton instance.
 */
let serviceInstance: MemoryService | null = null;

/**
 * Get or create the MemoryService singleton.
 */
export async function getMemoryService(
  workingDir?: string,
): Promise<MemoryService> {
  if (serviceInstance) {
    return serviceInstance;
  }

  const router = await getMemoryRouter(workingDir);
  serviceInstance = new MemoryService(router);

  return serviceInstance;
}

/**
 * Reset the MemoryService singleton.
 */
export function resetMemoryService(): void {
  serviceInstance = null;
  resetRouter();
}

/**
 * MemoryService provides a high-level interface for memory operations.
 */
export class MemoryService {
  private router: MemoryRouter;
  private cachedTree: MemoryTree | null = null;
  private treeLastBuilt = 0;
  private readonly TREE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(router: MemoryRouter) {
    this.router = router;
  }

  /**
   * Search memories with optional type and tree node filtering.
   */
  async search(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemoryItem[]> {
    const { limit = 10, type, treeNodeHint } = options;

    // If tree node hint provided, filter to memories in that branch
    if (treeNodeHint) {
      const tree = await this.getTree();
      const navigator = new TreeNavigator(tree);
      const memoryIds = navigator.getAllMemoryIds(treeNodeHint);

      if (memoryIds.length > 0) {
        // Get memories from the branch
        const branchMemories = await this.router.getMemoriesByIds(memoryIds);

        // Filter by query (simple keyword match for now)
        const queryLower = query.toLowerCase();
        let filtered = branchMemories.filter(
          (m) =>
            m.content.toLowerCase().includes(queryLower) ||
            m.metadata?.tags?.some((t: string) =>
              t.toLowerCase().includes(queryLower),
            ),
        );

        // Filter by type if specified
        if (type && type !== "all") {
          filtered = filtered.filter((m) => m.metadata?.type === type);
        }

        return filtered.slice(0, limit);
      }
    }

    // Standard search
    let results = await this.router.search(query, limit * 2);

    // Filter by type if specified
    if (type && type !== "all") {
      results = results.filter((m) => m.metadata?.type === type);
    }

    return results.slice(0, limit);
  }

  /**
   * Get memories by IDs (full content).
   */
  async get(ids: string[]): Promise<MemoryItem[]> {
    return this.router.getMemoriesByIds(ids);
  }

  /**
   * Add a new memory with privacy filtering.
   */
  async add(content: string, options: MemoryAddOptions = {}): Promise<string> {
    const settings = loadSettings();
    let filteredContent = content;

    // Apply privacy filtering if enabled
    if (settings.privacyFilter) {
      const filterResult = filterPrivateContent(content);
      filteredContent = filterResult.filtered;

      if (!shouldStore(filteredContent)) {
        throw new Error(
          "Content filtered out - contains private data marked for exclusion",
        );
      }
    }

    const type = options.type || "conversation";
    const metadata = {
      sessionId: options.sessionId,
      tags: options.tags,
    };

    const id = await this.router.addMemoryWithMetadata(
      filteredContent,
      type,
      metadata,
    );

    if (!id) {
      throw new Error("Failed to add memory");
    }

    // Invalidate tree cache
    this.cachedTree = null;

    return id;
  }

  /**
   * Get the memory tree structure.
   */
  async getTree(): Promise<MemoryTree> {
    // Check cache
    if (
      this.cachedTree &&
      Date.now() - this.treeLastBuilt < this.TREE_CACHE_TTL
    ) {
      return this.cachedTree;
    }

    // Build new tree
    const memories = await this.router.getAllMemories();
    const builder = new MemoryTreeBuilder(memories);
    this.cachedTree = await builder.build();
    this.treeLastBuilt = Date.now();

    return this.cachedTree;
  }

  /**
   * Format tree for Claude reasoning.
   */
  async formatTree(maxDepth: number = 2): Promise<string> {
    const tree = await this.getTree();
    const navigator = new TreeNavigator(tree);
    return navigator.formatTreeForReasoning(maxDepth);
  }

  /**
   * Navigate to a specific tree node.
   */
  async navigate(nodeId: string): Promise<string> {
    const tree = await this.getTree();
    const navigator = new TreeNavigator(tree);
    return navigator.expandNode(nodeId);
  }

  /**
   * Get timeline of memories around a specific point.
   */
  async getTimeline(
    anchor: string,
    before: number = 5,
    after: number = 5,
  ): Promise<{ memories: MemoryItem[]; anchorIndex: number }> {
    return this.router.getTimeline(anchor, before, after);
  }

  /**
   * Get memory system statistics.
   */
  async getStats(): Promise<MemoryStats> {
    const memories = await this.router.getAllMemories();
    const cacheStats = await this.router.getCacheStats();
    const tree = await this.getTree();

    // Calculate token totals
    const totalTokens = memories.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );

    // Count by category
    const categories = {
      sessions: 0,
      patterns: 0,
      decisions: 0,
      context: 0,
      observations: 0,
    };

    for (const m of memories) {
      const type = m.metadata?.type;
      if (type === "pattern") categories.patterns++;
      else if (type === "decision") categories.decisions++;
      else if (type === "context") categories.context++;
      else if (type === "observation" || type === "tool-observation")
        categories.observations++;
      else categories.sessions++;
    }

    // Calculate tree depth
    let maxDepth = 0;
    interface TreeNode {
      children?: TreeNode[];
    }
    const calcDepth = (node: TreeNode, depth: number) => {
      if (depth > maxDepth) maxDepth = depth;
      for (const child of node.children || []) {
        calcDepth(child, depth + 1);
      }
    };
    calcDepth(tree.root as TreeNode, 0);

    return {
      totalMemories: memories.length,
      totalTokens,
      cacheStats,
      treeDepth: maxDepth,
      categories,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get all memory IDs under a tree node.
   */
  async getMemoryIdsForNode(nodeId: string): Promise<string[]> {
    const tree = await this.getTree();
    const navigator = new TreeNavigator(tree);
    return navigator.getAllMemoryIds(nodeId);
  }

  /**
   * Get the router for direct access if needed.
   */
  getRouter(): MemoryRouter {
    return this.router;
  }
}
