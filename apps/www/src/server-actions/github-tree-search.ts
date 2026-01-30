"use server";

import {
  fetchRepositoryFilesFromGitHub,
  type TreeFile,
} from "@/lib/github-tree";
import { userOnlyAction } from "@/lib/auth-server";

export const fetchRepositoryFiles = userOnlyAction(
  async function fetchRepositoryFiles(
    userId: string,
    {
      repoFullName,
      branchName,
    }: {
      repoFullName: string;
      branchName: string;
    },
  ): Promise<TreeFile[]> {
    console.log("fetchRepositoryFiles", repoFullName, branchName);
    return fetchRepositoryFilesFromGitHub({
      userId,
      repoFullName,
      branchName,
    });
  },
  { defaultErrorMessage: "Failed to fetch repository files" },
);
