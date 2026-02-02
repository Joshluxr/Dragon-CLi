"use server";

import { userOnlyAction } from "@/lib/auth-server";
import {
  getOctokitForApp,
  getOctokitForUserOrThrow,
  parseRepoFullName,
} from "@/lib/github";
import { Endpoints } from "@octokit/types";

export type UserRepo =
  Endpoints["GET /installation/repositories"]["response"]["data"]["repositories"][number];

export const getUserRepos = userOnlyAction(
  async function getUserRepos(userId: string) {
    const octokit = await getOctokitForUserOrThrow({ userId });
    try {
      // Try to get installations if GitHub App is configured
      console.log(`[getUserRepos] Fetching installations for user ${userId}`);
      const { data } =
        await octokit.rest.apps.listInstallationsForAuthenticatedUser();

      console.log(
        `[getUserRepos] Found ${data.installations.length} installations`,
      );

      if (data.installations.length > 0) {
        // If user has app installations, get repositories from those installations in parallel
        const repoPromises = data.installations.map(async (installation) => {
          try {
            // Get all repositories accessible to the user in this installation using pagination
            const repositories = await octokit.paginate(
              octokit.rest.apps.listInstallationReposForAuthenticatedUser,
              {
                installation_id: installation.id,
                per_page: 100,
              },
            );

            console.log(
              `[getUserRepos] Installation ${installation.id}: found ${repositories.length} repos`,
            );
            return repositories;
          } catch (installationError) {
            console.warn(
              `Failed to get repos for installation ${installation.id}:`,
              installationError,
            );
            return [];
          }
        });

        const repoArrays = await Promise.all(repoPromises);
        const allRepos = repoArrays.flat();

        console.log(
          `[getUserRepos] Total repos before filter: ${allRepos.length}`,
        );

        if (allRepos.length > 0) {
          const filteredRepos = allRepos
            .filter((repo) => repo && repo.permissions?.push === true)
            .sort((a, b) => {
              // Sort by most recently pushed (descending order)
              const aPushedAt = a.pushed_at
                ? new Date(a.pushed_at).getTime()
                : 0;
              const bPushedAt = b.pushed_at
                ? new Date(b.pushed_at).getTime()
                : 0;
              return bPushedAt - aPushedAt;
            });

          console.log(
            `[getUserRepos] Repos with push permission: ${filteredRepos.length}`,
          );

          return { repos: filteredRepos };
        } else {
          console.log(
            `[getUserRepos] No repos found from any installation for user ${userId}`,
          );
        }
      } else {
        console.log(
          `[getUserRepos] No GitHub App installations found for user ${userId}`,
        );
      }
    } catch (appError) {
      console.error(
        "[getUserRepos] Failed to get app installations or user info:",
        appError,
      );
    }
    return { repos: [] };
  },
  { defaultErrorMessage: "An unexpected error occurred" },
);

export const getUserRepoBranches = userOnlyAction(
  async function getUserRepoBranches(userId: string, repoFullName: string) {
    const [owner, repo] = parseRepoFullName(repoFullName);
    const octokit = await getOctokitForApp({ owner, repo });
    try {
      // Fetch repository details to get the default branch
      const [{ data: repoData }, branches] = await Promise.all([
        octokit.rest.repos.get({
          owner,
          repo,
        }),
        octokit.paginate(
          octokit.rest.repos.listBranches,
          {
            owner,
            repo,
            per_page: 100,
          },
          (response) => response.data,
        ),
      ]);
      const defaultBranch = repoData.default_branch;
      // Sort branches with default branch first, then alphabetically
      branches.sort((a, b) => {
        if (a.name === defaultBranch) return -1;
        if (b.name === defaultBranch) return 1;
        return a.name.localeCompare(b.name);
      });
      return branches;
    } catch (error) {
      console.warn(`Failed to get branches for ${repoFullName}:`, error);
      return [];
    }
  },
  { defaultErrorMessage: "An unexpected error occurred" },
);
