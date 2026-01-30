import { ISandboxSession } from "../types";
import { getGitDefaultBranch } from "./git-default-branch";
import { validateBranchName, getEffectiveBaseBranch } from "./utils";

export interface GitDiffStatsArgs {
  repoRoot?: string;
  baseBranch?: string;
}

export interface GitDiffStats {
  files: number;
  additions: number;
  deletions: number;
}

/**
 * Parses the output of `git diff --shortstat` to extract file change statistics.
 *
 * @param shortstatOutput - The output from `git diff --shortstat`
 * @returns An object containing files changed, additions, and deletions
 *
 * @example
 * parseGitShortstat(" 2 files changed, 10 insertions(+), 3 deletions(-)")
 * // Returns: { files: 2, additions: 10, deletions: 3 }
 *
 * parseGitShortstat(" 1 file changed, 5 insertions(+)")
 * // Returns: { files: 1, additions: 5, deletions: 0 }
 *
 * parseGitShortstat("")
 * // Returns: { files: 0, additions: 0, deletions: 0 }
 */
export function parseGitShortstat(shortstatOutput: string): GitDiffStats {
  // Handle empty output (no changes)
  if (!shortstatOutput.trim()) {
    return {
      files: 0,
      additions: 0,
      deletions: 0,
    };
  }

  // Parse the shortstat output
  // Examples:
  // " 2 files changed, 10 insertions(+), 3 deletions(-)"
  // " 1 file changed, 5 insertions(+)"
  // " 3 files changed, 2 deletions(-)"
  const statsMatch = shortstatOutput.match(
    /(\d+) files? changed(?:,\s*(\d+) insertions?\(\+\))?(?:,\s*(\d+) deletions?\(-\))?/,
  );

  if (!statsMatch) {
    console.error(
      "Failed to parse git diff --shortstat output:",
      shortstatOutput,
    );
    return {
      files: 0,
      additions: 0,
      deletions: 0,
    };
  }

  const files = parseInt(statsMatch[1] || "0", 10) || 0;
  const additions = parseInt(statsMatch[2] || "0", 10) || 0;
  const deletions = parseInt(statsMatch[3] || "0", 10) || 0;

  return {
    files,
    additions,
    deletions,
  };
}

export async function gitDiffStats(
  session: ISandboxSession,
  args?: GitDiffStatsArgs,
): Promise<GitDiffStats> {
  console.log("[commands] gitDiffStats", args);
  const repoRoot = args?.repoRoot;

  try {
    // Get the base branch - use provided baseBranch or get default
    const baseBranch =
      args?.baseBranch || (await getGitDefaultBranch(session, repoRoot));

    // Validate branch name to prevent command injection
    validateBranchName({ branchName: baseBranch });

    // Add all untracked files to git index (but not commit)
    await session.runCommand("git add -N .", { cwd: repoRoot });

    // Determine the effective base branch to use
    const effectiveBaseBranch = await getEffectiveBaseBranch({
      session,
      baseBranch,
      repoRoot,
    });

    // Run git diff --shortstat to get statistics
    const diffStats = await session.runCommand(
      `git diff --shortstat $(git merge-base HEAD ${effectiveBaseBranch})`,
      { cwd: repoRoot },
    );

    // Parse the output
    const stats = parseGitShortstat(diffStats);
    console.log(
      `Git diff stats: ${stats.files} files, +${stats.additions}, -${stats.deletions}`,
    );
    return stats;
  } catch (error: any) {
    console.error("Error generating git diff stats:", error.message);
    throw error;
  }
}
