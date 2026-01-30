import { db } from "@/lib/db";
import { getUserCreditBalance } from "@dragon/shared/model/credits";

export const creditsTagFor = (userId: string) => `credits:user:${userId}`;

export async function getCachedUserCreditBalance(userId: string) {
  return getUserCreditBalance({
    db,
    userId,
    skipAggCache: false,
  });
}
