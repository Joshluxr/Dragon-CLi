import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { createTestUser, createTestThread } from "./test-helpers";
import { eq } from "drizzle-orm";
import {
  getEligibleOnboardingCompletionRecipients,
  hasOnboardingCompletionEmailBeenSent,
  recordOnboardingCompletionEmail,
} from "./onboarding-completion-emails";

describe("onboarding-completion-emails", () => {
  const db = createDb(process.env.DATABASE_URL!);

  beforeEach(async () => {
    // Clean up in reverse order of foreign key dependencies
    await db.delete(schema.onboardingCompletionEmails);
    await db.delete(schema.thread);
    await db.delete(schema.userFlags);
    await db.delete(schema.account);
    await db.delete(schema.session);
    await db.delete(schema.user);
  });

  describe("getEligibleOnboardingCompletionRecipients", () => {
    it("should return users who completed onboarding but have no threads and created account over 24 hours ago", async () => {
      // Create user who has completed onboarding over 24 hours ago
      const { user: user1 } = await createTestUser({
        db,
        email: "completed@example.com",
      });
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago
      await db
        .update(schema.user)
        .set({ createdAt: oldDate })
        .where(eq(schema.user.id, user1.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, user1.id));

      // Create user who hasn't completed onboarding
      await createTestUser({ db, email: "incomplete@example.com" });
      // hasSeenOnboarding defaults to false

      // Create user who completed onboarding but has threads
      const { user: user3 } = await createTestUser({
        db,
        email: "has-threads@example.com",
      });
      const oldDate2 = new Date();
      oldDate2.setHours(oldDate2.getHours() - 25);
      await db
        .update(schema.user)
        .set({ createdAt: oldDate2 })
        .where(eq(schema.user.id, user3.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, user3.id));
      await createTestThread({ db, userId: user3.id });

      const results = await getEligibleOnboardingCompletionRecipients({ db });

      expect(results).toHaveLength(1);
      expect(results[0]!.email).toBe("completed@example.com");
      expect(results[0]!.id).toBe(user1.id);
    });

    it("should exclude users who created their account less than 24 hours ago", async () => {
      // Create user who completed onboarding recently (less than 24 hours ago)
      const { user: recentUser } = await createTestUser({
        db,
        email: "recent@example.com",
      });
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 23); // 23 hours ago
      await db
        .update(schema.user)
        .set({ createdAt: recentDate })
        .where(eq(schema.user.id, recentUser.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, recentUser.id));

      // Create user who completed onboarding over 24 hours ago
      const { user: oldUser } = await createTestUser({
        db,
        email: "old@example.com",
      });
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48); // 48 hours ago
      await db
        .update(schema.user)
        .set({ createdAt: oldDate })
        .where(eq(schema.user.id, oldUser.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, oldUser.id));

      const results = await getEligibleOnboardingCompletionRecipients({ db });

      expect(results).toHaveLength(1);
      expect(results[0]!.email).toBe("old@example.com");
      expect(results[0]!.id).toBe(oldUser.id);
    });

    it("should exclude users who already received onboarding completion email", async () => {
      // Create users who completed onboarding over 24 hours ago
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48); // 48 hours ago

      const { user: user1 } = await createTestUser({
        db,
        email: "user1@example.com",
      });
      await db
        .update(schema.user)
        .set({ createdAt: oldDate })
        .where(eq(schema.user.id, user1.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, user1.id));

      const { user: user2 } = await createTestUser({
        db,
        email: "user2@example.com",
      });
      await db
        .update(schema.user)
        .set({ createdAt: oldDate })
        .where(eq(schema.user.id, user2.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, user2.id));

      const { user: adminUser } = await createTestUser({
        db,
        email: "admin@example.com",
      });

      // Record that user1 already received the email
      await recordOnboardingCompletionEmail({
        db,
        userId: user1.id,
        email: user1.email,
        sentByUserId: adminUser.id,
      });

      const results = await getEligibleOnboardingCompletionRecipients({ db });

      expect(results).toHaveLength(1);
      expect(results[0]!.email).toBe("user2@example.com");
    });

    it("should return empty array when no users match criteria", async () => {
      // Create user with threads
      const { user } = await createTestUser({ db });
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, user.id));
      await createTestThread({ db, userId: user.id });

      const results = await getEligibleOnboardingCompletionRecipients({ db });
      expect(results).toHaveLength(0);
    });

    it("should handle users with multiple threads correctly", async () => {
      const { user } = await createTestUser({
        db,
        email: "multi-threads@example.com",
      });
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48); // 48 hours ago
      await db
        .update(schema.user)
        .set({ createdAt: oldDate })
        .where(eq(schema.user.id, user.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, user.id));

      // Create multiple threads
      await createTestThread({
        db,
        userId: user.id,
        overrides: { name: "Thread 1" },
      });
      await createTestThread({
        db,
        userId: user.id,
        overrides: { name: "Thread 2" },
      });

      const results = await getEligibleOnboardingCompletionRecipients({ db });

      // User should not be included since they have threads
      expect(results.find((r) => r.id === user.id)).toBeUndefined();
    });

    it("should handle archived threads correctly", async () => {
      const { user } = await createTestUser({
        db,
        email: "archived-threads@example.com",
      });
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48); // 48 hours ago
      await db
        .update(schema.user)
        .set({ createdAt: oldDate })
        .where(eq(schema.user.id, user.id));
      await db
        .update(schema.userFlags)
        .set({ hasSeenOnboarding: true })
        .where(eq(schema.userFlags.userId, user.id));

      // Create an archived thread
      await createTestThread({
        db,
        userId: user.id,
        overrides: { archived: true },
      });

      const results = await getEligibleOnboardingCompletionRecipients({ db });

      // User should not be included even if thread is archived
      expect(results.find((r) => r.id === user.id)).toBeUndefined();
    });
  });

  describe("hasOnboardingCompletionEmailBeenSent", () => {
    it("should return true when email was sent", async () => {
      const { user } = await createTestUser({ db });
      const { user: adminUser } = await createTestUser({ db });

      await recordOnboardingCompletionEmail({
        db,
        userId: user.id,
        email: user.email,
        sentByUserId: adminUser.id,
      });

      const result = await hasOnboardingCompletionEmailBeenSent({
        db,
        userId: user.id,
      });

      expect(result).toBe(true);
    });

    it("should return false when no email was sent", async () => {
      const { user } = await createTestUser({ db });

      const result = await hasOnboardingCompletionEmailBeenSent({
        db,
        userId: user.id,
      });

      expect(result).toBe(false);
    });

    it("should return false for different user", async () => {
      const { user: user1 } = await createTestUser({ db });
      const { user: user2 } = await createTestUser({ db });
      const { user: adminUser } = await createTestUser({ db });

      // Record email for user1
      await recordOnboardingCompletionEmail({
        db,
        userId: user1.id,
        email: user1.email,
        sentByUserId: adminUser.id,
      });

      // Check for user2
      const result = await hasOnboardingCompletionEmailBeenSent({
        db,
        userId: user2.id,
      });

      expect(result).toBe(false);
    });
  });

  describe("recordOnboardingCompletionEmail", () => {
    it("should record an onboarding completion email", async () => {
      const { user } = await createTestUser({ db });
      const { user: adminUser } = await createTestUser({ db });

      await recordOnboardingCompletionEmail({
        db,
        userId: user.id,
        email: user.email,
        sentByUserId: adminUser.id,
      });

      const records = await db.select().from(schema.onboardingCompletionEmails);
      expect(records).toHaveLength(1);
      expect(records[0]!.userId).toBe(user.id);
      expect(records[0]!.email).toBe(user.email);
      expect(records[0]!.sentByUserId).toBe(adminUser.id);
      expect(records[0]!.sentAt).toBeInstanceOf(Date);
    });

    it("should prevent duplicate emails to same user", async () => {
      const { user } = await createTestUser({ db });
      const { user: adminUser } = await createTestUser({ db });

      await recordOnboardingCompletionEmail({
        db,
        userId: user.id,
        email: user.email,
        sentByUserId: adminUser.id,
      });

      // Try to record again - should fail due to unique constraint
      await expect(
        recordOnboardingCompletionEmail({
          db,
          userId: user.id,
          email: user.email,
          sentByUserId: adminUser.id,
        }),
      ).rejects.toThrow();
    });
  });
});
