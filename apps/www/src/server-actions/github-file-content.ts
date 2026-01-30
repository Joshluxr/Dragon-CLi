"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { getOctokitForUserOrThrow, parseRepoFullName } from "@/lib/github";

export type GitHubFileContentResult = {
  content: string; // base64 encoded
  encoding: "base64";
} | null;

export const getGitHubFileContent = userOnlyAction(
  async function getGitHubFileContent(
    userId: string,
    {
      repoFullName,
      branchName,
      filePath,
    }: {
      repoFullName: string;
      branchName: string;
      filePath: string;
    },
  ): Promise<GitHubFileContentResult> {
    const [owner, repo] = parseRepoFullName(repoFullName);
    const octokit = await getOctokitForUserOrThrow({ userId });

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branchName,
      });

      if ("content" in data && typeof data.content === "string") {
        return {
          content: data.content,
          encoding: "base64",
        };
      }

      return null;
    } catch (error: any) {
      // If file doesn't exist, return null
      if (error?.status === 404) {
        return null;
      }
      throw error;
    }
  },
  { defaultErrorMessage: "Failed to fetch file content from GitHub" },
);
