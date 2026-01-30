"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { ThreadInfo } from "@terragon/shared";
import { getThreads } from "@terragon/shared/model/threads";

export const getThreadsAction = userOnlyAction(
  async function getThreadsAction(
    userId: string,
    filters: {
      archived?: boolean;
      automationId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<ThreadInfo[]> {
    const threads = await getThreads({
      db,
      userId,
      limit: filters.limit ?? 100,
      offset: filters.offset ?? 0,
      archived: filters.archived,
      automationId: filters.automationId,
    });
    return threads;
  },
  { defaultErrorMessage: "Failed to get tasks" },
);
