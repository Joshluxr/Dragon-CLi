import { ISandboxSession } from "../types";

/**
 * Regex pattern to detect dangerous characters that could be used for command injection.
 * Blocks shell metacharacters and control characters.
 */
export const DANGEROUS_CHARS_REGEX = /[\x00-\x1f\x7f$`"'\\;|&<>(){}[\]!*?~#\s]/;

/**
 * Validates a git branch name to ensure it doesn't contain dangerous characters
 * that could be used for command injection.
 *
 * @param branchName - The branch name to validate
 * @param label - Optional label for the error message (e.g., "branch name", "upstream branch")
 * @throws Error if the branch name contains dangerous characters
 */
export function validateBranchName({
  branchName,
  label = "branch name",
}: {
  branchName: string;
  label?: string;
}): void {
  if (DANGEROUS_CHARS_REGEX.test(branchName)) {
    throw new Error(
      `Invalid ${label}: ${branchName} (contains dangerous characters)`,
    );
  }
}

/**
 * Determines the effective base branch to use for git operations, considering upstream tracking
 * and remote branches. This includes fetching the latest changes from the remote.
 *
 * @param session - The sandbox session
 * @param baseBranch - The base branch name (validated)
 * @param repoRoot - Optional repository root directory
 * @returns The effective base branch to use (e.g., "origin/main" instead of "main")
 */
export async function getEffectiveBaseBranch({
  session,
  baseBranch,
  repoRoot,
}: {
  session: ISandboxSession;
  baseBranch: string;
  repoRoot?: string;
}): Promise<string> {
  let effectiveBaseBranch = baseBranch;

  try {
    // Check if current branch has an upstream tracking branch
    const upstream = await session.runCommand(
      "git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true",
      { cwd: repoRoot },
    );
    const upstreamTrimmed = upstream.trim();

    if (upstreamTrimmed) {
      // Validate upstream branch name
      validateBranchName({
        branchName: upstreamTrimmed,
        label: "upstream branch name",
      });

      // Extract the remote name from the upstream (e.g., 'origin' from 'origin/feature-branch')
      const remoteName = upstreamTrimmed.split("/")[0];
      if (!remoteName) {
        throw new Error(
          `Invalid upstream branch name: ${upstreamTrimmed} (no remote name)`,
        );
      }

      // Validate remote name
      validateBranchName({ branchName: remoteName, label: "remote name" });

      // Check if baseBranch already includes remote prefix
      const hasRemotePrefix = baseBranch.startsWith(`${remoteName}/`);
      if (hasRemotePrefix) {
        // If baseBranch already has remote prefix (e.g., 'origin/main'), use it directly
        effectiveBaseBranch = baseBranch;

        // Extract branch name without remote for fetching
        const branchWithoutRemote = baseBranch.split("/").slice(1).join("/");
        console.log(
          `Fetching latest changes for ${branchWithoutRemote} from ${remoteName}...`,
        );
        try {
          await session.runCommand(
            `git fetch ${remoteName} ${branchWithoutRemote}`,
            {
              cwd: repoRoot,
            },
          );
        } catch (fetchError) {
          console.warn(
            `Warning: Failed to fetch ${remoteName}/${branchWithoutRemote}, using local version`,
          );
        }
      } else {
        // Fetch the latest changes from the remote to ensure we're diffing against current state
        console.log(`Fetching latest changes from ${remoteName}...`);
        try {
          await session.runCommand(`git fetch ${remoteName} ${baseBranch}`, {
            cwd: repoRoot,
          });
        } catch (fetchError) {
          console.warn(
            `Warning: Failed to fetch ${remoteName}/${baseBranch}, using local version`,
          );
        }
        // Use the remote's version of the base branch (e.g., 'origin/main' instead of 'main')
        effectiveBaseBranch = `${remoteName}/${baseBranch}`;
      }

      console.log(`Using base branch: ${effectiveBaseBranch}`);
    }
  } catch {
    // No upstream branch found, use the provided base branch
    console.log(`No upstream branch found, using: ${effectiveBaseBranch}`);
  }

  // Final validation of effective base branch
  validateBranchName({
    branchName: effectiveBaseBranch,
    label: "effective base branch name",
  });

  return effectiveBaseBranch;
}
