"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { getCachedUserCreditBalance } from "@/server-lib/credit-balance";

export const getUserCreditBalanceAction = userOnlyAction(
  async function getUserCreditBalanceAction(userId: string) {
    return getCachedUserCreditBalance(userId);
  },
  { defaultErrorMessage: "Failed to get credit balance" },
);
