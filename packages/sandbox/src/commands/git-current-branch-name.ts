import { ISandboxSession } from "../types";

export async function getCurrentBranchName(
  session: ISandboxSession,
  repoRoot?: string,
) {
  const result = await session.runCommand("git rev-parse --abbrev-ref HEAD", {
    cwd: repoRoot,
  });
  return result.trim();
}
