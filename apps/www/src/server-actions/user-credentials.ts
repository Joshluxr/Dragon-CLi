"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { getUserCredentials } from "@/server-lib/user-credentials";

export const getUserCredentialsAction = userOnlyAction(
  async function getUserCredentialsAction(userId: string) {
    console.log("getUserCredentialsAction");
    return getUserCredentials({ userId });
  },
  { defaultErrorMessage: "Failed to get user credentials" },
);
