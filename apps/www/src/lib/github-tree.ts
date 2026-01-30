import { getOctokitForUserOrThrow, parseRepoFullName } from "./github";

export interface TreeFile {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

// Server-side function to fetch from GitHub
export async function fetchRepositoryFilesFromGitHub({
  userId,
  repoFullName,
  branchName,
}: {
  userId: string;
  repoFullName: string;
  branchName: string;
}): Promise<TreeFile[]> {
  try {
    const octokit = await getOctokitForUserOrThrow({ userId });
    const [owner, repo] = parseRepoFullName(repoFullName);

    let branchData;
    try {
      // First, try to get the specified branch
      const { data: branch } = await octokit.rest.repos.getBranch({
        owner: owner!,
        repo: repo!,
        branch: branchName,
      });
      branchData = branch;
    } catch (branchError: any) {
      // If branch not found, fall back to the default branch
      if (branchError.status === 404) {
        console.log(
          `Branch '${branchName}' not found, falling back to default branch`,
        );
        const { data: repoData } = await octokit.rest.repos.get({
          owner: owner!,
          repo: repo!,
        });
        const { data: defaultBranch } = await octokit.rest.repos.getBranch({
          owner: owner!,
          repo: repo!,
          branch: repoData.default_branch,
        });
        branchData = defaultBranch;
      } else {
        throw branchError;
      }
    }

    // Then fetch the tree recursively
    const { data: tree } = await octokit.rest.git.getTree({
      owner: owner!,
      repo: repo!,
      tree_sha: branchData.commit.sha,
      recursive: "true",
    });

    // Include both files (blobs) and directories (trees)
    const files: TreeFile[] = tree.tree
      .filter(
        (item) => item.path && (item.type === "blob" || item.type === "tree"),
      )
      .map((item) => ({
        path: item.path!,
        type: item.type as "blob" | "tree",
        sha: item.sha!,
        size: item.size,
      }));

    return files;
  } catch (error) {
    console.error("GitHub tree fetch error:", error);
    return [];
  }
}
