import parse from "parse-diff";
import { DBMessage } from "../db/db-message";
import { GitDiffStats } from "../db/types";

export interface CreateGitDiffMessageOptions {
  diff: string;
  diffStats: GitDiffStats | null;
  description?: string;
  timestamp?: string;
}

/**
 * Creates a git-diff message for checkpointing diffs in conversation history
 */
function createGitDiffMessage({
  diff,
  diffStats,
  description,
  timestamp,
}: CreateGitDiffMessageOptions): DBMessage {
  return {
    type: "git-diff",
    diff,
    diffStats,
    description,
    timestamp: timestamp || new Date().toISOString(),
  };
}

/**
 * Helper function to create a git-diff checkpoint with current git status
 */
export function createGitDiffCheckpoint({
  diff,
  diffStats,
  description,
}: {
  diff: string;
  diffStats: GitDiffStats | null;
  description?: string;
}): DBMessage {
  return createGitDiffMessage({
    diff,
    diffStats,
    description: description || "Git diff checkpoint",
    timestamp: new Date().toISOString(),
  });
}

export function parseGitDiffStats(gitDiff: string | null): GitDiffStats | null {
  if (!gitDiff) {
    return null;
  }
  try {
    const files = parse(gitDiff);
    const numFiles = files.length;
    let additions = 0;
    let deletions = 0;
    for (const file of files) {
      additions += file.additions;
      deletions += file.deletions;
    }
    const stats = {
      files: numFiles,
      additions,
      deletions,
    };
    return stats;
  } catch (error) {
    console.error("Failed to parse git diff:", error);
    return null;
  }
}
