"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { getAccessInfoForUser } from "@/lib/subscription";

export const getAccessStatus = userOnlyAction(
  async function getAccessStatus(userId: string) {
    const { tier } = await getAccessInfoForUser(userId);
    return { tier } as const;
  },
  { defaultErrorMessage: "Failed to get access status" },
);
