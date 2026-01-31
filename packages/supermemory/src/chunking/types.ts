/**
 * Semantic Chunking Types
 *
 * Defines interfaces for text chunking strategies.
 */

/**
 * A single chunk of text with metadata.
 */
export interface Chunk {
  /** Original text content */
  content: string;
  /** Unique chunk identifier */
  id: string;
  /** Index within the original document */
  index: number;
  /** Start character position in original text */
  startPos: number;
  /** End character position in original text */
  endPos: number;
  /** Estimated token count */
  tokenEstimate: number;
  /** Chunk type based on content analysis */
  type?: "code" | "prose" | "list" | "mixed";
  /** Optional title extracted from content */
  title?: string;
}

/**
 * Result of chunking operation.
 */
export interface ChunkResult {
  /** List of chunks */
  chunks: Chunk[];
  /** Total token estimate */
  totalTokens: number;
  /** Original text length */
  originalLength: number;
  /** Chunking strategy used */
  strategy: string;
}

/**
 * Chunking configuration options.
 */
export interface ChunkConfig {
  /** Target chunk size in tokens (default: 512) */
  targetSize?: number;
  /** Maximum chunk size in tokens (default: 1024) */
  maxSize?: number;
  /** Minimum chunk size in tokens (default: 50) */
  minSize?: number;
  /** Overlap between chunks in tokens (default: 50) */
  overlap?: number;
  /** Preserve code blocks as single chunks (default: true) */
  preserveCodeBlocks?: boolean;
  /** Preserve list structures (default: true) */
  preserveLists?: boolean;
}

/**
 * Default chunking configuration.
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  targetSize: 512,
  maxSize: 1024,
  minSize: 50,
  overlap: 50,
  preserveCodeBlocks: true,
  preserveLists: true,
};
