import { ISandboxSession } from "../types";
import { getGitDefaultBranch } from "./git-default-branch";

export async function isLocalBranchAheadOfRemote({
  session,
  branch,
  baseBranch,
  repoRoot,
}: {
  session: ISandboxSession;
  branch: string;
  baseBranch?: string;
  repoRoot?: string;
}): Promise<boolean> {
  try {
    // First check if the remote branch exists
    const remoteBranchExists = await session.runCommand(
      `git ls-remote --heads origin ${branch}`,
      { cwd: repoRoot },
    );

    if (!remoteBranchExists.trim()) {
      const baseBranchOrDefault =
        baseBranch || (await getGitDefaultBranch(session, repoRoot));
      // Are we ahead of our base branch
      const result = await session.runCommand(
        `git rev-list --count origin/${baseBranchOrDefault}..${branch}`,
        { cwd: repoRoot },
      );
      const aheadCount = parseInt(result.trim(), 10);
      return aheadCount > 0;
    }

    // Check if the local branch is ahead of its upstream
    const result = await session.runCommand(
      `git rev-list --count origin/${branch}..${branch}`,
      { cwd: repoRoot },
    );

    const aheadCount = parseInt(result.trim(), 10);
    return aheadCount > 0;
  } catch (error) {
    // If commands fail for other reasons, return false to be safe
    console.warn(`Failed to check if branch ${branch} is ahead:`, error);
    return false;
  }
}
