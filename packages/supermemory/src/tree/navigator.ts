/**
 * Tree Navigator
 *
 * PageIndex-inspired tree navigation using LLM reasoning.
 * Presents tree structure for Claude to reason about which branches are relevant.
 */

import type {
  MemoryTree,
  MemoryTreeNode,
  TreeNavigationResult,
} from "./types.js";
import { formatTokenEstimate } from "../utils/tokens.js";

/**
 * Navigates the memory tree structure.
 */
export class TreeNavigator {
  private tree: MemoryTree;
  private nodeIndex: Map<string, MemoryTreeNode>;

  constructor(tree: MemoryTree) {
    this.tree = tree;
    this.nodeIndex = this.buildNodeIndex(tree.root);
  }

  /**
   * Builds a flat index of nodes by ID for fast lookup.
   */
  private buildNodeIndex(node: MemoryTreeNode): Map<string, MemoryTreeNode> {
    const index = new Map<string, MemoryTreeNode>();

    const traverse = (n: MemoryTreeNode) => {
      index.set(n.id, n);
      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return index;
  }

  /**
   * Format tree for Claude to reason about.
   * Shows structure with summaries and token estimates.
   */
  formatTreeForReasoning(maxDepth: number = 2): string {
    const lines: string[] = [];

    lines.push("## Memory Tree Index");
    lines.push("");
    lines.push(
      `Total: ${this.tree.totalMemories} memories (${formatTokenEstimate(this.tree.totalTokens)})`,
    );
    lines.push(`Last updated: ${this.tree.lastUpdated}`);
    lines.push("");

    this.formatNode(this.tree.root, lines, 0, maxDepth);

    lines.push("");
    lines.push("---");
    lines.push("**Navigation tips:**");
    lines.push('- Use `MemoryNavigate nodeId="<id>"` to explore a branch');
    lines.push('- Use `MemorySearch query="..."` to search within any branch');
    lines.push("- Use `MemoryGet ids=[...]` to retrieve specific memories");

    return lines.join("\n");
  }

  /**
   * Formats a single node and its children.
   */
  private formatNode(
    node: MemoryTreeNode,
    lines: string[],
    depth: number,
    maxDepth: number,
  ): void {
    if (depth > maxDepth) return;

    const indent = "  ".repeat(depth);
    const tokenLabel = formatTokenEstimate(node.tokenEstimate);

    if (node.type === "root") {
      // Just show children for root
      for (const child of node.children) {
        this.formatNode(child, lines, depth, maxDepth);
      }
      return;
    }

    // Format node with ID for navigation
    const countLabel =
      node.memoryCount === 1 ? "1 item" : `${node.memoryCount} items`;
    lines.push(`${indent}- **[${node.id}]** ${node.title}`);
    lines.push(`${indent}  ${node.summary} (${countLabel}, ${tokenLabel})`);

    // Show tags if present
    if (node.tags && node.tags.length > 0) {
      lines.push(`${indent}  Tags: ${node.tags.slice(0, 5).join(", ")}`);
    }

    // Show children
    if (depth < maxDepth) {
      for (const child of node.children) {
        this.formatNode(child, lines, depth + 1, maxDepth);
      }
    } else if (node.children.length > 0) {
      lines.push(
        `${indent}  └── (${node.children.length} sub-sections, use MemoryNavigate to expand)`,
      );
    }
  }

  /**
   * Navigate to a specific node by ID.
   */
  navigate(nodeId: string): TreeNavigationResult | null {
    const node = this.nodeIndex.get(nodeId);
    if (!node) {
      return null;
    }

    const path = this.getPathToNode(nodeId);

    return {
      path,
      reasoning: `Navigated to ${node.title}`,
      node,
    };
  }

  /**
   * Gets the path from root to a node.
   */
  private getPathToNode(nodeId: string): string[] {
    const path: string[] = [];
    let current = this.nodeIndex.get(nodeId);

    while (current) {
      path.unshift(current.id);
      if (current.parentId) {
        current = this.nodeIndex.get(current.parentId);
      } else {
        break;
      }
    }

    return path;
  }

  /**
   * Expand a node to show its details and children.
   */
  expandNode(nodeId: string): string {
    const result = this.navigate(nodeId);
    if (!result) {
      return `Node "${nodeId}" not found in memory tree.`;
    }

    const { node, path } = result;
    const lines: string[] = [];

    lines.push(`## ${node.title}`);
    lines.push(`**Path:** ${path.join(" → ")}`);
    lines.push("");
    lines.push(node.summary);
    lines.push("");

    // Show time range if available
    if (node.startTime || node.endTime) {
      const start = node.startTime
        ? new Date(node.startTime).toLocaleString()
        : "unknown";
      const end = node.endTime
        ? new Date(node.endTime).toLocaleString()
        : "unknown";
      lines.push(`**Time range:** ${start} - ${end}`);
    }

    // Show tags
    if (node.tags && node.tags.length > 0) {
      lines.push(`**Tags:** ${node.tags.join(", ")}`);
    }

    lines.push("");

    // Show memory IDs for retrieval
    if (node.memoryIds && node.memoryIds.length > 0) {
      const tokenLabel = formatTokenEstimate(node.tokenEstimate);
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

    // Show children
    if (node.children.length > 0) {
      lines.push("");
      lines.push("**Sub-sections:**");
      lines.push("");

      for (const child of node.children) {
        const tokenLabel = formatTokenEstimate(child.tokenEstimate);
        const countLabel =
          child.memoryCount === 1 ? "1 item" : `${child.memoryCount} items`;

        lines.push(`- **[${child.id}]** ${child.title}`);
        lines.push(`  ${child.summary} (${countLabel}, ${tokenLabel})`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get all memory IDs under a node (including children recursively).
   */
  getAllMemoryIds(nodeId: string): string[] {
    const node = this.nodeIndex.get(nodeId);
    if (!node) return [];

    const ids: string[] = [];

    const collect = (n: MemoryTreeNode) => {
      if (n.memoryIds) {
        ids.push(...n.memoryIds);
      }
      for (const child of n.children) {
        collect(child);
      }
    };

    collect(node);

    // Deduplicate
    return [...new Set(ids)];
  }

  /**
   * Search for nodes matching a query in titles/summaries.
   */
  searchNodes(query: string): MemoryTreeNode[] {
    const lowerQuery = query.toLowerCase();
    const results: MemoryTreeNode[] = [];

    for (const node of this.nodeIndex.values()) {
      if (node.type === "root") continue;

      const titleMatch = node.title.toLowerCase().includes(lowerQuery);
      const summaryMatch = node.summary.toLowerCase().includes(lowerQuery);
      const tagMatch = node.tags?.some((t) =>
        t.toLowerCase().includes(lowerQuery),
      );

      if (titleMatch || summaryMatch || tagMatch) {
        results.push(node);
      }
    }

    return results;
  }

  /**
   * Get the tree structure for serialization.
   */
  getTree(): MemoryTree {
    return this.tree;
  }

  /**
   * Get a node by ID.
   */
  getNode(nodeId: string): MemoryTreeNode | undefined {
    return this.nodeIndex.get(nodeId);
  }
}
