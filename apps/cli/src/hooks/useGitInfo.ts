import { useQuery } from "@tanstack/react-query";
import { promisify } from "util";
import { exec as execCallback } from "child_process";
const exec = promisify(execCallback);

// Get current GitHub repository info
async function getCurrentGitHubRepo(): Promise<string | null> {
  try {
    const { stdout } = await exec("git config --get remote.origin.url", {
      encoding: "utf8",
    });
    const remoteUrl = stdout.trim();

    // Parse GitHub URL formats:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^.]+)(\.git)?$/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch (err) {
    return null;
  }
}

// Get current git branch
async function getCurrentBranch(): Promise<string | null> {
  try {
    const { stdout } = await exec("git branch --show-current", {
      encoding: "utf8",
    });
    return stdout.trim() || null;
  } catch (err) {
    return null;
  }
}

export function useCurrentGitHubRepo() {
  return useQuery({
    queryKey: ["git", "repo"],
    queryFn: getCurrentGitHubRepo,
    staleTime: Infinity, // Git repo doesn't change during session
  });
}

export function useCurrentBranch() {
  return useQuery({
    queryKey: ["git", "branch"],
    queryFn: getCurrentBranch,
    staleTime: 5000, // Refresh every 5 seconds in case branch changes
  });
}

export function useGitInfo() {
  const repoQuery = useCurrentGitHubRepo();
  const branchQuery = useCurrentBranch();

  return {
    repo: repoQuery.data,
    branch: branchQuery.data,
    isLoading: repoQuery.isLoading || branchQuery.isLoading,
    error: repoQuery.error || branchQuery.error,
  };
}
