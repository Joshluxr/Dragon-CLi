import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { createTestUser } from "./test-helpers";
import {
  getUnusedAccessCodesOlderThan,
  hasReengagementEmailBeenSent,
  recordReengagementEmail,
  getEligibleReengagementRecipients,
} from "./reengagement-emails";

describe("reengagement-emails", () => {
  const db = createDb(process.env.DATABASE_URL!);

  beforeEach(async () => {
    // Clean up in reverse order of foreign key dependencies
    await db.delete(schema.reengagementEmails);
    await db.delete(schema.accessCodes);
    await db.delete(schema.user);
  });

  describe("getUnusedAccessCodesOlderThan", () => {
    it("should return unused access codes older than specified days", async () => {
      const { user } = await createTestUser({ db });

      // Create access codes with different ages
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5); // 5 days old

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1); // 1 day old

      // Old unused code with email
      const oldUnusedCode = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_old_unused",
          email: "old@example.com",
          createdByUserId: user.id,
          createdAt: oldDate,
        })
        .returning();

      // Recent unused code with email
      await db.insert(schema.accessCodes).values({
        code: "ac_recent_unused",
        email: "recent@example.com",
        createdByUserId: user.id,
        createdAt: recentDate,
      });

      // Old used code with email
      await db.insert(schema.accessCodes).values({
        code: "ac_old_used",
        email: "used@example.com",
        usedByEmail: "used@example.com",
        usedAt: new Date(),
        createdByUserId: user.id,
        createdAt: oldDate,
      });

      // Old code without email
      await db.insert(schema.accessCodes).values({
        code: "ac_old_no_email",
        createdByUserId: user.id,
        createdAt: oldDate,
      });

      const results = await getUnusedAccessCodesOlderThan({ db, days: 2 });

      expect(results).toHaveLength(1);
      expect(results[0]!.code).toBe("ac_old_unused");
      expect(results[0]!.email).toBe("old@example.com");
      expect(results[0]!.id).toBe(oldUnusedCode[0]!.id);
    });

    it("should return empty array when no codes match criteria", async () => {
      const { user } = await createTestUser({ db });

      // Only create recent codes
      await db.insert(schema.accessCodes).values({
        code: "ac_recent",
        email: "recent@example.com",
        createdByUserId: user.id,
        createdAt: new Date(),
      });

      const results = await getUnusedAccessCodesOlderThan({ db, days: 2 });
      expect(results).toHaveLength(0);
    });
  });

  describe("hasReengagementEmailBeenSent", () => {
    it("should return true when re-engagement email was sent", async () => {
      const { user } = await createTestUser({ db });
      const accessCode = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_test",
          email: "test@example.com",
          createdByUserId: user.id,
        })
        .returning();

      // Record a re-engagement email
      await db.insert(schema.reengagementEmails).values({
        email: "test@example.com",
        accessCodeId: accessCode[0]!.id,
        sentByUserId: user.id,
      });

      const result = await hasReengagementEmailBeenSent({
        db,
        email: "test@example.com",
        accessCodeId: accessCode[0]!.id,
      });

      expect(result).toBe(true);
    });

    it("should return false when no re-engagement email was sent", async () => {
      const { user } = await createTestUser({ db });
      const accessCode = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_test",
          email: "test@example.com",
          createdByUserId: user.id,
        })
        .returning();

      const result = await hasReengagementEmailBeenSent({
        db,
        email: "test@example.com",
        accessCodeId: accessCode[0]!.id,
      });

      expect(result).toBe(false);
    });

    it("should return false for different email/accessCode combinations", async () => {
      const { user } = await createTestUser({ db });
      const accessCode1 = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_test1",
          email: "test1@example.com",
          createdByUserId: user.id,
        })
        .returning();

      const accessCode2 = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_test2",
          email: "test2@example.com",
          createdByUserId: user.id,
        })
        .returning();

      // Record email for first access code
      await db.insert(schema.reengagementEmails).values({
        email: "test1@example.com",
        accessCodeId: accessCode1[0]!.id,
        sentByUserId: user.id,
      });

      // Check different combinations
      const result1 = await hasReengagementEmailBeenSent({
        db,
        email: "test2@example.com",
        accessCodeId: accessCode1[0]!.id,
      });
      expect(result1).toBe(false);

      const result2 = await hasReengagementEmailBeenSent({
        db,
        email: "test1@example.com",
        accessCodeId: accessCode2[0]!.id,
      });
      expect(result2).toBe(false);
    });
  });

  describe("recordReengagementEmail", () => {
    it("should record a re-engagement email", async () => {
      const { user } = await createTestUser({ db });
      const accessCode = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_test",
          email: "test@example.com",
          createdByUserId: user.id,
        })
        .returning();

      await recordReengagementEmail({
        db,
        email: "test@example.com",
        accessCodeId: accessCode[0]!.id,
        sentByUserId: user.id,
      });

      const records = await db.select().from(schema.reengagementEmails);
      expect(records).toHaveLength(1);
      expect(records[0]!.email).toBe("test@example.com");
      expect(records[0]!.accessCodeId).toBe(accessCode[0]!.id);
      expect(records[0]!.sentByUserId).toBe(user.id);
      expect(records[0]!.sentAt).toBeInstanceOf(Date);
    });
  });

  describe("getEligibleReengagementRecipients", () => {
    it("should return eligible recipients excluding those already sent", async () => {
      const { user } = await createTestUser({ db });
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 3);

      // Create multiple old unused codes
      await db.insert(schema.accessCodes).values({
        code: "ac_eligible1",
        email: "eligible1@example.com",
        createdByUserId: user.id,
        createdAt: oldDate,
      });

      await db.insert(schema.accessCodes).values({
        code: "ac_eligible2",
        email: "eligible2@example.com",
        createdByUserId: user.id,
        createdAt: oldDate,
      });

      const code3 = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_already_sent",
          email: "already@example.com",
          createdByUserId: user.id,
          createdAt: oldDate,
        })
        .returning();

      // Record that we already sent to code3
      await db.insert(schema.reengagementEmails).values({
        email: "already@example.com",
        accessCodeId: code3[0]!.id,
        sentByUserId: user.id,
      });

      const results = await getEligibleReengagementRecipients({ db, days: 2 });

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.email).sort()).toEqual([
        "eligible1@example.com",
        "eligible2@example.com",
      ]);
    });

    it("should handle empty results gracefully", async () => {
      const results = await getEligibleReengagementRecipients({ db, days: 2 });
      expect(results).toHaveLength(0);
    });

    it("should use custom days parameter", async () => {
      const { user } = await createTestUser({ db });

      // Create codes of different ages
      const date3Days = new Date();
      date3Days.setDate(date3Days.getDate() - 3);

      const date5Days = new Date();
      date5Days.setDate(date5Days.getDate() - 5);

      await db.insert(schema.accessCodes).values({
        code: "ac_3days",
        email: "3days@example.com",
        createdByUserId: user.id,
        createdAt: date3Days,
      });

      await db.insert(schema.accessCodes).values({
        code: "ac_5days",
        email: "5days@example.com",
        createdByUserId: user.id,
        createdAt: date5Days,
      });

      const results4Days = await getEligibleReengagementRecipients({
        db,
        days: 4,
      });
      expect(results4Days).toHaveLength(1);
      expect(results4Days[0]!.email).toBe("5days@example.com");

      const results2Days = await getEligibleReengagementRecipients({
        db,
        days: 2,
      });
      expect(results2Days).toHaveLength(2);
    });

    it("should handle multiple access codes for same email correctly", async () => {
      const { user } = await createTestUser({ db });
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 3);

      // Create multiple codes for same email
      const code1 = await db
        .insert(schema.accessCodes)
        .values({
          code: "ac_multi1",
          email: "multi@example.com",
          createdByUserId: user.id,
          createdAt: oldDate,
        })
        .returning();

      await db.insert(schema.accessCodes).values({
        code: "ac_multi2",
        email: "multi@example.com",
        createdByUserId: user.id,
        createdAt: oldDate,
      });

      // Send re-engagement for only one code
      await db.insert(schema.reengagementEmails).values({
        email: "multi@example.com",
        accessCodeId: code1[0]!.id,
        sentByUserId: user.id,
      });

      const results = await getEligibleReengagementRecipients({ db, days: 2 });

      // Should still return the second code as eligible
      expect(results).toHaveLength(1);
      expect(results[0]!.code).toBe("ac_multi2");
    });
  });
});
