import { ISandboxSession } from "../types";
import { diffCutoff } from "../utils";
import { getGitDefaultBranch } from "./git-default-branch";
import { validateBranchName, getEffectiveBaseBranch } from "./utils";

export interface GitDiffArgs {
  outputFile?: string;
  repoRoot?: string;
  baseBranch?: string;
  characterCutoff?: number;
}

export async function gitDiff(
  session: ISandboxSession,
  args?: GitDiffArgs,
): Promise<string> {
  console.log("[commands] gitDiff", args);
  const outputFile = args?.outputFile || "git-diff.patch";
  const repoRoot = args?.repoRoot;
  const characterCutoff = args?.characterCutoff || diffCutoff;
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
    const fullOutputPath =
      repoRoot && !outputFile.startsWith("/")
        ? `${repoRoot}/${outputFile}`
        : outputFile;
    await session.runCommand(
      `git diff --patch-with-stat --no-color $(git merge-base HEAD ${effectiveBaseBranch}) | head -c ${characterCutoff} > ${fullOutputPath}`,
      { cwd: repoRoot },
    );
    console.log(`Git diff written to: ${outputFile}`);
    return `Git diff written to: ${outputFile}`;
  } catch (error: any) {
    console.error("Error generating git diff:", error.message);
    throw error;
  }
}
