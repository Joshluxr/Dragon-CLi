"use server";

import { auth } from "@/lib/auth";
import { nanoid } from "nanoid/non-secure";
import { userOnlyAction } from "@/lib/auth-server";

export const createCliApiToken = userOnlyAction(
  async function createCliApiToken(userId: string) {
    const cliApiKey = await auth.api.createApiKey({
      body: {
        name: `cli-${nanoid()}`,
        expiresIn: 60 * 60 * 24 * 30, // 30 days,
        userId,
      },
    });
    return cliApiKey.key;
  },
  { defaultErrorMessage: "Failed to create CLI API token" },
);
