"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { getPostHogServer } from "@/lib/posthog-server";
import { stopThread as stopThreadInternal } from "@/server-lib/stop-thread";

export const stopThread = userOnlyAction(
  async function stopThread(
    userId: string,
    { threadId, threadChatId }: { threadId: string; threadChatId: string },
  ) {
    console.log("stopThread", threadId);
    getPostHogServer().capture({
      distinctId: userId,
      event: "stop_thread",
      properties: {
        threadId,
      },
    });
    await stopThreadInternal({
      userId,
      threadId,
      threadChatId,
    });
  },
  { defaultErrorMessage: "Failed to stop task" },
);
