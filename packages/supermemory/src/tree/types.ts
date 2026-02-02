/**
 * Memory Tree Types
 *
 * PageIndex-inspired hierarchical memory structure.
 * Enables LLM reasoning-based navigation instead of pure similarity search.
 */

import type { MemoryItem } from "../utils/formatter.js";

/**
 * Node types in the memory tree hierarchy.
 */
export type MemoryTreeNodeType =
  | "root"
  | "category"
  | "session"
  | "topic"
  | "memory";

/**
 * A node in the memory tree hierarchy.
 */
export interface MemoryTreeNode {
  /** Unique identifier for this node */
  id: string;

  /** Human-readable title */
  title: string;

  /** Brief summary of contents (~50 tokens) */
  summary: string;

  /** Node type for rendering/behavior */
  type: MemoryTreeNodeType;

  // Hierarchy
  /** Parent node ID (null for root) */
  parentId: string | null;

  /** Child nodes */
  children: MemoryTreeNode[];

  /** Depth in tree (0 for root) */
  depth: number;

  // Content bounds (for leaf/container nodes)
  /** IDs of memories contained in this node */
  memoryIds?: string[];

  /** Total memories in this subtree */
  memoryCount: number;

  /** Estimated tokens if all content fully expanded */
  tokenEstimate: number;

  // Temporal info
  /** Start time of content (ISO timestamp) */
  startTime?: string;

  /** End time of content (ISO timestamp) */
  endTime?: string;

  // Metadata
  /** Tags for filtering */
  tags?: string[];

  /** Keywords that indicate relevance to queries */
  relevanceHints?: string[];
}

/**
 * The complete memory tree structure.
 */
export interface MemoryTree {
  /** Root node of the tree */
  root: MemoryTreeNode;

  /** Schema version for compatibility */
  version: number;

  /** Last update timestamp */
  lastUpdated: string;

  /** Total memory count across tree */
  totalMemories: number;

  /** Total estimated tokens */
  totalTokens: number;
}

/**
 * Result of navigating to a tree node.
 */
export interface TreeNavigationResult {
  /** Path from root to target (node IDs) */
  path: string[];

  /** LLM's reasoning for this navigation */
  reasoning: string;

  /** The target node */
  node: MemoryTreeNode;

  /** Populated if this is a leaf node with actual memories */
  memories?: MemoryItem[];
}

/**
 * Configuration for tree building.
 */
export interface TreeBuilderConfig {
  /** Maximum memories per session node before subdivision */
  maxMemoriesPerSession: number;

  /** Minimum memories to create a topic subdivision */
  minMemoriesForTopic: number;

  /** Whether to generate summaries using LLM */
  generateSummaries: boolean;

  /** Maximum depth of tree */
  maxDepth: number;
}

/**
 * Default tree builder configuration.
 */
export const DEFAULT_TREE_CONFIG: TreeBuilderConfig = {
  maxMemoriesPerSession: 50,
  minMemoriesForTopic: 3,
  generateSummaries: false, // Start with heuristic summaries
  maxDepth: 4,
};
