/**
 * Semantic Chunker
 *
 * Splits long text into semantically meaningful chunks.
 * Uses structure detection (code blocks, headers, lists) for intelligent splitting.
 */

import type { Chunk, ChunkResult, ChunkConfig } from "./types.js";
import { DEFAULT_CHUNK_CONFIG } from "./types.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Estimates tokens for text content.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const isCode = /[{}\[\]();=]/.test(text);
  return Math.ceil(text.length * (isCode ? 0.35 : 0.25));
}

/**
 * Detects the type of content.
 */
function detectContentType(text: string): Chunk["type"] {
  const codeIndicators =
    /```|^\s{4,}\S|function\s|class\s|const\s|let\s|import\s|export\s/m;
  const listIndicators = /^[\s]*[-*+•]\s|\d+\.\s/m;

  const hasCode = codeIndicators.test(text);
  const hasList = listIndicators.test(text);

  if (hasCode && !hasList) return "code";
  if (hasList && !hasCode) return "list";
  if (hasCode && hasList) return "mixed";
  return "prose";
}

/**
 * Extracts a potential title from the first line.
 */
function extractTitle(text: string): string | undefined {
  const firstLine = text.split("\n")[0]?.trim();
  if (!firstLine) return undefined;

  // Check for markdown headers
  const headerMatch = firstLine.match(/^#{1,6}\s+(.+)$/);
  if (headerMatch) return headerMatch[1];

  // Use first line if it's short enough
  if (firstLine.length <= 80) return firstLine;

  return undefined;
}

/**
 * Splits text at natural boundaries.
 */
function findSplitPoints(text: string): number[] {
  const points: number[] = [];

  // Priority 1: Markdown headers
  const headerRegex = /^#{1,6}\s+/gm;
  let match;
  while ((match = headerRegex.exec(text)) !== null) {
    points.push(match.index);
  }

  // Priority 2: Double newlines (paragraph breaks)
  const paragraphRegex = /\n\n+/g;
  while ((match = paragraphRegex.exec(text)) !== null) {
    points.push(match.index);
  }

  // Priority 3: Code block boundaries
  const codeBlockRegex = /```[\s\S]*?```/g;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    points.push(match.index);
    points.push(match.index + match[0].length);
  }

  // Deduplicate and sort
  return [...new Set(points)].sort((a, b) => a - b);
}

/**
 * Semantic chunker class.
 */
export class SemanticChunker {
  private config: ChunkConfig;

  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = { ...DEFAULT_CHUNK_CONFIG, ...config };
  }

  /**
   * Chunk text into semantically meaningful pieces.
   */
  chunk(text: string): ChunkResult {
    if (!text || text.trim().length === 0) {
      return {
        chunks: [],
        totalTokens: 0,
        originalLength: 0,
        strategy: "empty",
      };
    }

    const totalTokens = estimateTokens(text);

    // If text is small enough, return as single chunk
    if (totalTokens <= this.config.maxSize!) {
      return {
        chunks: [this.createChunk(text, 0, 0, text.length)],
        totalTokens,
        originalLength: text.length,
        strategy: "single",
      };
    }

    // Find natural split points
    const splitPoints = findSplitPoints(text);

    // If we have good split points, use them
    if (splitPoints.length > 0) {
      const chunks = this.chunkBySplitPoints(text, splitPoints);
      return {
        chunks,
        totalTokens,
        originalLength: text.length,
        strategy: "semantic",
      };
    }

    // Fallback to sentence-based chunking
    const chunks = this.chunkBySentences(text);
    return {
      chunks,
      totalTokens,
      originalLength: text.length,
      strategy: "sentence",
    };
  }

  /**
   * Chunk by detected split points.
   */
  private chunkBySplitPoints(text: string, splitPoints: number[]): Chunk[] {
    const chunks: Chunk[] = [];
    let currentStart = 0;
    let currentText = "";
    let chunkIndex = 0;

    // Add end of text as final split point
    const points = [...splitPoints, text.length];

    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const segment = text.slice(currentStart, point);

      // Check if adding this segment would exceed max size
      const combinedTokens = estimateTokens(currentText + segment);

      if (combinedTokens > this.config.maxSize! && currentText.length > 0) {
        // Save current chunk
        chunks.push(
          this.createChunk(
            currentText.trim(),
            chunkIndex++,
            currentStart - currentText.length,
            currentStart,
          ),
        );

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentText);
        currentText = overlapText + segment;
        currentStart = point;
      } else {
        currentText += segment;
        currentStart = point;
      }
    }

    // Add final chunk if there's remaining text
    if (currentText.trim().length > 0) {
      chunks.push(
        this.createChunk(
          currentText.trim(),
          chunkIndex,
          text.length - currentText.length,
          text.length,
        ),
      );
    }

    return chunks;
  }

  /**
   * Fallback sentence-based chunking.
   */
  private chunkBySentences(text: string): Chunk[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: Chunk[] = [];

    let currentText = "";
    let currentStart = 0;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const combinedTokens = estimateTokens(currentText + sentence);

      if (combinedTokens > this.config.targetSize! && currentText.length > 0) {
        // Save current chunk
        const endPos = currentStart + currentText.length;
        chunks.push(
          this.createChunk(
            currentText.trim(),
            chunkIndex++,
            currentStart,
            endPos,
          ),
        );

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentText);
        currentStart = endPos - overlapText.length;
        currentText = overlapText + sentence;
      } else {
        currentText += sentence;
      }
    }

    // Add final chunk
    if (currentText.trim().length > 0) {
      chunks.push(
        this.createChunk(
          currentText.trim(),
          chunkIndex,
          currentStart,
          currentStart + currentText.length,
        ),
      );
    }

    return chunks;
  }

  /**
   * Get overlap text for chunk continuity.
   */
  private getOverlapText(text: string): string {
    const overlapTokens = this.config.overlap || 50;
    const overlapChars = Math.floor(overlapTokens / 0.25); // Rough char to token ratio

    if (text.length <= overlapChars) return text;

    // Try to break at sentence boundary
    const end = text.slice(-overlapChars);
    const sentenceStart = end.search(/[.!?]\s+[A-Z]/);

    if (sentenceStart > 0) {
      return end.slice(sentenceStart + 1).trim() + " ";
    }

    return end;
  }

  /**
   * Create a chunk object.
   */
  private createChunk(
    content: string,
    index: number,
    startPos: number,
    endPos: number,
  ): Chunk {
    return {
      content,
      id: `chunk-${uuidv4().slice(0, 8)}`,
      index,
      startPos,
      endPos,
      tokenEstimate: estimateTokens(content),
      type: detectContentType(content),
      title: extractTitle(content),
    };
  }

  /**
   * Check if text needs chunking.
   */
  needsChunking(text: string): boolean {
    return estimateTokens(text) > this.config.maxSize!;
  }

  /**
   * Get optimal chunk count for text.
   */
  estimateChunkCount(text: string): number {
    const tokens = estimateTokens(text);
    if (tokens <= this.config.maxSize!) return 1;
    return Math.ceil(tokens / this.config.targetSize!);
  }
}

/**
 * Creates a default semantic chunker instance.
 */
export function createSemanticChunker(
  config?: Partial<ChunkConfig>,
): SemanticChunker {
  return new SemanticChunker(config);
}
