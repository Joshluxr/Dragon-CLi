import { ISandboxSession } from "../types";

export interface GitDefaultBranchArgs {
  json: boolean;
  repoRoot?: string;
}

export async function getGitDefaultBranch(
  session: ISandboxSession,
  repoRoot?: string,
): Promise<string> {
  console.log("[commands] getGitDefaultBranch", { repoRoot });
  // Method: Check which branch origin/HEAD points to
  // When it applies: Repository was cloned normally (not with --single-branch)
  // Common in: Most standard git clones from GitHub, GitLab, etc.
  try {
    const originHead = await session.runCommand(
      "git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || true",
      { cwd: repoRoot },
    );
    if (originHead) {
      const branch = originHead.trim().replace("refs/remotes/origin/", "");
      if (branch) {
        return branch;
      }
    }
  } catch {}

  // Method: Get symbolic ref directly from remote
  // When it applies: When origin/HEAD isn't set locally but remote is accessible
  // Common in: Any repo where the remote has HEAD properly configured
  try {
    const remoteSymref = await session.runCommand(
      "git ls-remote --symref origin HEAD 2>/dev/null | grep '^ref:' | awk '{print $2}' || true",
      { cwd: repoRoot },
    );
    if (remoteSymref && remoteSymref.trim().startsWith("refs/heads/")) {
      const branch = remoteSymref.trim().replace("refs/heads/", "");
      return branch;
    }
  } catch {}

  // Method: Check git config for init.defaultBranch
  // When it applies: User has set a global/local default branch preference
  // Common in: Newer git installations where users configured their preference
  try {
    const configDefault = await session.runCommand(
      "git config init.defaultBranch 2>/dev/null || true",
      { cwd: repoRoot },
    );
    if (configDefault && configDefault.trim()) {
      return configDefault.trim();
    }
  } catch {}

  // Method: Try git remote show as fallback
  // When it applies: Older git versions or when ls-remote --symref isn't available
  // Common in: Legacy systems or restricted git installations
  try {
    const remoteInfo = await session.runCommand(
      "git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d' ' -f5 || true",
      { cwd: repoRoot },
    );
    if (remoteInfo && remoteInfo.trim() && remoteInfo.trim() !== "(unknown)") {
      return remoteInfo.trim();
    }
  } catch {}

  // Final fallback
  return "main";
}
