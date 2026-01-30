import { ISandboxSession } from "../types";
import { getGitDefaultBranch } from "./git-default-branch";

export interface GitPushWithRebaseArgs {
  branch?: string;
  setUpstream?: boolean;
  repoRoot?: string;
}

export interface PushResult {
  success: boolean;
  message: string;
  didUpdate?: boolean;
  error?: "CONFLICT" | "REJECTED" | "NETWORK" | "AUTH" | "UNKNOWN";
}

export async function gitPushWithRebase(
  session: ISandboxSession,
  args?: GitPushWithRebaseArgs,
): Promise<PushResult> {
  console.log("[commands] gitPushWithRebase", args);
  const setUpstream = args?.setUpstream !== false; // Default to true
  const repoRoot = args?.repoRoot;

  try {
    // Get current branch if not specified
    const branch =
      args?.branch ||
      (
        await session.runCommand("git rev-parse --abbrev-ref HEAD", {
          cwd: repoRoot,
        })
      ).trim();

    // Validate branch name to prevent command injection
    const dangerousChars = /[\x00-\x1f\x7f$`"'\\;|&<>(){}[\]!*?~#\s]/;
    if (dangerousChars.test(branch)) {
      return {
        success: false,
        message: `Invalid branch name: ${branch} (contains dangerous characters)`,
        error: "UNKNOWN",
      };
    }

    // Get the base branch
    const baseBranch = await getGitDefaultBranch(session, repoRoot);

    // Prevent pushing to default branch (eg. main etc)
    if (branch === baseBranch) {
      return {
        success: false,
        message: `Cannot push directly to default branch ${branch}`,
        error: "REJECTED",
      };
    }

    // First, try a regular push
    const pushCmd = setUpstream
      ? `git push -u origin ${branch}`
      : `git push origin ${branch}`;

    try {
      await session.runCommand(pushCmd, { cwd: repoRoot });
      return {
        success: true,
        didUpdate: false,
        message: `Successfully pushed branch '${branch}' to origin`,
      };
    } catch (pushError: any) {
      const errorOutput = pushError.message || "";

      // Check if it's a non-fast-forward error
      if (
        errorOutput.includes("! [rejected]") &&
        (errorOutput.includes("non-fast-forward") ||
          errorOutput.includes("fetch first") ||
          errorOutput.includes("Updates were rejected"))
      ) {
        try {
          // Fetch the latest changes
          await session.runCommand("git fetch origin", { cwd: repoRoot });

          // Check if we have uncommitted changes
          const numChanges = await session.runCommand(
            "git status --porcelain | wc -l",
            { cwd: repoRoot },
          );
          const hasUncommittedChanges = numChanges.trim() !== "0";
          if (hasUncommittedChanges) {
            return {
              success: false,
              message: "Cannot push: there are uncommitted changes.",
              error: "REJECTED",
            };
          }

          try {
            // Try to rebase onto the remote branch
            await session.runCommand(`git rebase origin/${branch}`, {
              cwd: repoRoot,
            });

            // Try pushing again
            await session.runCommand(pushCmd, { cwd: repoRoot });

            return {
              success: true,
              didUpdate: true,
              message: `Successfully pushed branch '${branch}' after rebasing`,
            };
          } catch (rebaseError: any) {
            // Rebase failed, likely due to conflicts
            const rebaseOutput = rebaseError.message || "";

            // Abort the rebase
            try {
              await session.runCommand("git rebase --abort", { cwd: repoRoot });
            } catch {
              // Ignore abort errors
            }

            if (
              rebaseOutput.includes("CONFLICT") ||
              rebaseOutput.includes("could not apply")
            ) {
              return {
                success: false,
                message: `Cannot push: merge conflicts detected when rebasing onto origin/${branch}. Manual intervention required.`,
                error: "CONFLICT",
              };
            }

            return {
              success: false,
              message: `Failed to rebase: ${rebaseOutput}`,
              error: "UNKNOWN",
            };
          }
        } catch (pullError: any) {
          const pullOutput = pullError.message || "";
          return {
            success: false,
            message: `Failed to pull changes: ${pullOutput}`,
            error: "UNKNOWN",
          };
        }
      }

      // Check for authentication errors
      if (
        errorOutput.includes("Authentication failed") ||
        errorOutput.includes("Permission denied") ||
        errorOutput.includes("could not read Username")
      ) {
        return {
          success: false,
          message: "Authentication failed. Please check your git credentials.",
          error: "AUTH",
        };
      }

      // Check for network errors
      if (
        errorOutput.includes("Could not resolve host") ||
        errorOutput.includes("Connection refused") ||
        errorOutput.includes("Operation timed out")
      ) {
        return {
          success: false,
          message: "Network error: Could not connect to remote repository.",
          error: "NETWORK",
        };
      }

      // Generic push rejection
      if (errorOutput.includes("! [rejected]")) {
        return {
          success: false,
          message: `Push rejected: ${errorOutput}`,
          error: "REJECTED",
        };
      }

      // Unknown error
      return {
        success: false,
        message: `Push failed: ${errorOutput}`,
        error: "UNKNOWN",
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Unexpected error: ${error.message}`,
      error: "UNKNOWN",
    };
  }
}
