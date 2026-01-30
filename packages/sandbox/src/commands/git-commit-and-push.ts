import { ISandboxSession } from "../types";
import { gitPushWithRebase } from "./git-push-with-rebase";
import { getCurrentBranchName } from "./git-current-branch-name";
import { isLocalBranchAheadOfRemote } from "./git-is-ahead";
import { bashQuote, diffCutoff } from "../utils";
import { verifyGitIntegrity } from "./git-integrity";

async function commitChangesIfNeeded({
  session,
  args,
  enableIntegrityChecks,
}: {
  session: ISandboxSession;
  args: {
    githubAppName: string;
    generateCommitMessage: (gitDiff: string) => Promise<string>;
    repoRoot?: string;
  };
  enableIntegrityChecks: boolean;
}): Promise<boolean> {
  const { githubAppName, generateCommitMessage, repoRoot } = args;
  const numChanges = await session.runCommand(
    "git status --porcelain | wc -l",
    { cwd: repoRoot },
  );
  if (numChanges.trim() === "0") {
    return false;
  }
  let commitMessage = "Update code";
  try {
    const tempPatchFile = `/tmp/patch_${Date.now()}.patch`;
    await session.runCommand("git add -N .", { cwd: repoRoot });

    // Verify repository integrity after adding files (which may trigger blob fetching)
    await verifyGitIntegrity({
      session,
      repoRoot,
      operation: "git add -N",
      enableIntegrityChecks,
    });

    // Use the --patch-with-stat flag to get the file stats in the prefix in case
    // we need to cut off the diff.
    // Use HEAD to include both staged and unstaged changes
    await session.runCommand(
      `git diff HEAD --no-color --patch-with-stat | head -c ${diffCutoff} > ${tempPatchFile}`,
      { cwd: repoRoot },
    );
    const gitDiffWithCutoff = await session.readTextFile(tempPatchFile);
    await session.runCommand(`rm ${tempPatchFile}`, { cwd: repoRoot });
    commitMessage = await generateCommitMessage(gitDiffWithCutoff);
  } catch (error) {
    console.error("Failed to generate commit message, using fallback:", error);
  }

  // Add co-author trailer for GitHub app
  const coAuthorTrailer = githubAppName
    ? `\n\nCo-authored-by: ${githubAppName}[bot] <${githubAppName}[bot]@users.noreply.github.com>`
    : "";

  // Write commit message to temporary file
  const tempCommitFile = `/tmp/commit_${Date.now()}.txt`;
  await session.writeTextFile(tempCommitFile, commitMessage + coAuthorTrailer);

  try {
    // First, stage all changes
    await session.runCommand("git add -A", { cwd: repoRoot });

    // Verify repository integrity after staging (which may trigger blob fetching in blobless clones)
    await verifyGitIntegrity({
      session,
      repoRoot,
      operation: "git add -A",
      enableIntegrityChecks,
    });

    // Now commit with the verified changes
    await session.runCommand(
      // Make sure to fail if the commit fails.
      `bash -c ${bashQuote(
        `set -o pipefail; git commit -F ${tempCommitFile} | head -n 50`,
      )}`,
      { cwd: repoRoot },
    );
  } finally {
    // Clean up the temp commit message file
    await session.runCommand(`rm ${tempCommitFile}`, { cwd: repoRoot });
  }
  return true;
}

async function pushCurrentBranch(
  session: ISandboxSession,
  repoRoot: string | undefined,
  enableIntegrityChecks: boolean,
): Promise<
  | { branchName: string; errorMessage?: undefined }
  | { branchName?: undefined; errorMessage: string }
> {
  const currentBranch = await getCurrentBranchName(session, repoRoot);

  // Final integrity check before pushing
  if (enableIntegrityChecks) {
    try {
      await session.runCommand("git fsck --no-dangling --no-progress", {
        cwd: repoRoot,
      });
    } catch (fsckError) {
      console.error("Git integrity check failed before push:", fsckError);
      return {
        errorMessage: `Repository integrity check failed: ${fsckError}`,
      };
    }
  }

  const pushResult = await gitPushWithRebase(session, {
    branch: currentBranch,
    repoRoot,
  });
  if (pushResult.success) {
    return { branchName: currentBranch };
  }
  return { errorMessage: pushResult.message };
}

export async function gitCommitAndPushBranch({
  session,
  args,
  enableIntegrityChecks,
}: {
  session: ISandboxSession;
  args: {
    githubAppName: string;
    baseBranch?: string;
    generateCommitMessage: (gitDiff: string) => Promise<string>;
    repoRoot?: string;
  };
  enableIntegrityChecks: boolean;
}) {
  const currentBranch = await getCurrentBranchName(session, args.repoRoot);
  const hasCommittedOrIsAhead = await (async () => {
    const hasCommitted = await commitChangesIfNeeded({
      session,
      args,
      enableIntegrityChecks,
    });
    if (hasCommitted) {
      return true;
    }
    const isAhead = await isLocalBranchAheadOfRemote({
      session,
      branch: currentBranch,
      baseBranch: args.baseBranch,
      repoRoot: args.repoRoot,
    });
    return isAhead;
  })();
  if (hasCommittedOrIsAhead) {
    return await pushCurrentBranch(
      session,
      args.repoRoot,
      enableIntegrityChecks,
    );
  }
  // No push needed - branch is up to date
  return { branchName: currentBranch };
}
