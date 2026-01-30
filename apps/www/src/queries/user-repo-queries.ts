import { getUserRepoBranches, getUserRepos } from "@/server-actions/user-repos";
import { useServerActionQuery } from "./server-action-helpers";
import { serverActionSuccess } from "@/lib/server-actions";

export const USER_REPOS_QUERY_KEY = ["user-repos"] as const;

export const useUserReposQuery = (options?: { enabled?: boolean }) => {
  return useServerActionQuery({
    queryKey: USER_REPOS_QUERY_KEY,
    queryFn: () => getUserRepos(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    enabled: options?.enabled,
  });
};

export const useUserRepoBranchesQuery = (
  repoFullName: string | null,
  options?: { enabled?: boolean },
) => {
  return useServerActionQuery({
    queryKey: ["user-repo-branches", repoFullName],
    queryFn: async () => {
      if (!repoFullName) {
        return serverActionSuccess([]);
      }
      return getUserRepoBranches(repoFullName);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    enabled: options?.enabled,
  });
};
