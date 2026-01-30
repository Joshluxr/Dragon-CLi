"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { ThreadError } from "@/agent/error";
import { openPullRequestForThread } from "@/agent/pull-request";
import { withThreadSandboxSession } from "@/agent/thread-resource";

export const openPullRequest = userOnlyAction(
  async function openPullRequest(
    userId: string,
    {
      threadId,
      prType = "draft",
    }: {
      threadId: string;
      prType?: "draft" | "ready";
    },
  ) {
    console.log("openPullRequest", threadId);
    await withThreadSandboxSession({
      label: "openPullRequest",
      threadId,
      userId,
      threadChatId: null,
      execOrThrow: async ({ session }) => {
        if (!session) {
          throw new ThreadError("sandbox-not-found", "", null);
        }
        return await openPullRequestForThread({
          threadId,
          userId,
          prType,
          skipCommitAndPush: false,
          session,
        });
      },
    });
  },
  { defaultErrorMessage: "Failed to open pull request" },
);
