import { eq, and, isNull, lte } from "drizzle-orm";
import type { DB } from "../db/index.js";
import {
  user,
  userFlags,
  onboardingCompletionEmails,
  thread,
} from "../db/schema";

interface OnboardingCompletionRecipient {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export async function getEligibleOnboardingCompletionRecipients({
  db,
}: {
  db: DB;
}): Promise<OnboardingCompletionRecipient[]> {
  // Calculate the cutoff date (24 hours ago)
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - 24);

  // Get users who have completed onboarding (hasSeenOnboarding = true)
  // but have no threads and created their account over 24 hours ago
  const eligibleUsers = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    })
    .from(user)
    .innerJoin(userFlags, eq(userFlags.userId, user.id))
    .leftJoin(
      onboardingCompletionEmails,
      eq(onboardingCompletionEmails.userId, user.id),
    )
    .leftJoin(thread, eq(thread.userId, user.id))
    .where(
      and(
        eq(userFlags.hasSeenOnboarding, true),
        isNull(onboardingCompletionEmails.id),
        isNull(thread.id),
        lte(user.createdAt, cutoffDate),
      ),
    )
    .groupBy(user.id, user.email, user.name, user.createdAt);

  return eligibleUsers;
}

export async function hasOnboardingCompletionEmailBeenSent({
  db,
  userId,
}: {
  db: DB;
  userId: string;
}): Promise<boolean> {
  const existing = await db
    .select()
    .from(onboardingCompletionEmails)
    .where(eq(onboardingCompletionEmails.userId, userId))
    .limit(1);

  return existing.length > 0;
}

export async function recordOnboardingCompletionEmail({
  db,
  userId,
  email,
  sentByUserId,
}: {
  db: DB;
  userId: string;
  email: string;
  sentByUserId: string;
}): Promise<void> {
  await db.insert(onboardingCompletionEmails).values({
    userId,
    email,
    sentByUserId,
  });
}
