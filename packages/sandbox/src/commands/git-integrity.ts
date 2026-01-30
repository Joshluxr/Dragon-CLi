import { ISandboxSession } from "../types";

/**
 * Shared utility for performing git integrity checks.
 * This helps detect corrupted files that may occur during blob fetching in blobless clones.
 */
export async function verifyGitIntegrity({
  session,
  repoRoot,
  operation,
  enableIntegrityChecks,
  resetOnFailure = true,
}: {
  session: ISandboxSession;
  repoRoot?: string;
  operation: string;
  enableIntegrityChecks: boolean;
  resetOnFailure?: boolean;
}): Promise<void> {
  if (!enableIntegrityChecks) {
    return;
  }

  try {
    await session.runCommand("git fsck --no-dangling --no-progress", {
      cwd: repoRoot,
    });
  } catch (fsckError) {
    console.error(`Git integrity check failed after ${operation}:`, fsckError);

    if (resetOnFailure) {
      // Reset the index to avoid committing potentially corrupted files
      try {
        await session.runCommand("git reset", { cwd: repoRoot });
      } catch (resetError) {
        console.error(
          `Failed to reset git index after integrity check failure:`,
          resetError,
        );
      }
    }

    throw new Error(
      `Repository integrity check failed after ${operation}. Possible file corruption detected.`,
    );
  }
}
