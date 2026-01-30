"use server";

import { cache } from "react";
import { getThreadWithPermissions } from "@terragon/shared/model/threads";
import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { getOctokitForUser, parseRepoFullName } from "@/lib/github";
import { ThreadInfoFull } from "@terragon/shared/db/types";
import { UserFacingError } from "@/lib/server-actions";

export const getThreadAction = cache(
  userOnlyAction(
    async function getThreadAction(
      userId: string,
      threadId: string,
    ): Promise<ThreadInfoFull> {
      const threadInfoFull = await getThreadWithPermissions({
        db,
        threadId,
        userId,
        allowAdmin: false,
        getHasRepoPermissions: async (repoFullName) => {
          const octokit = await getOctokitForUser({ userId });
          if (!octokit) {
            return false;
          }
          try {
            const [owner, repo] = parseRepoFullName(repoFullName);
            const repoInfo = await octokit.rest.repos.get({
              owner,
              repo,
            });
            if (!repoInfo.data.permissions) {
              return false;
            }
            return true;
          } catch (error) {
            return false;
          }
        },
      });
      if (!threadInfoFull) {
        throw new UserFacingError("Unauthorized");
      }
      return threadInfoFull;
    },
    { defaultErrorMessage: "Failed to get task" },
  ),
);
