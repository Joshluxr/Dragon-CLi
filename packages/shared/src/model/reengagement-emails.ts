import { eq, and, lte, isNull, isNotNull, inArray } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { accessCodes, reengagementEmails } from "../db/schema";

interface AccessCodeRecord {
  id: string;
  code: string;
  email: string | null;
  createdAt: Date;
}

export async function getUnusedAccessCodesOlderThan({
  db,
  days,
}: {
  db: DB;
  days: number;
}): Promise<AccessCodeRecord[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const codes = await db
    .select({
      id: accessCodes.id,
      code: accessCodes.code,
      email: accessCodes.email,
      createdAt: accessCodes.createdAt,
    })
    .from(accessCodes)
    .where(
      and(
        isNull(accessCodes.usedAt),
        lte(accessCodes.createdAt, cutoffDate),
        // Only get codes with email addresses
        isNotNull(accessCodes.email),
      ),
    );

  return codes;
}

export async function hasReengagementEmailBeenSent({
  db,
  email,
  accessCodeId,
}: {
  db: DB;
  email: string;
  accessCodeId: string;
}) {
  const existing = await db
    .select()
    .from(reengagementEmails)
    .where(
      and(
        eq(reengagementEmails.email, email),
        eq(reengagementEmails.accessCodeId, accessCodeId),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

export async function recordReengagementEmail({
  db,
  email,
  accessCodeId,
  sentByUserId,
}: {
  db: DB;
  email: string;
  accessCodeId: string;
  sentByUserId: string;
}) {
  await db.insert(reengagementEmails).values({
    email,
    accessCodeId,
    sentByUserId,
  });
}

export async function getEligibleReengagementRecipients({
  db,
  days = 2,
}: {
  db: DB;
  days?: number;
}): Promise<AccessCodeRecord[]> {
  const unusedCodes = await getUnusedAccessCodesOlderThan({ db, days });

  if (unusedCodes.length === 0) {
    return [];
  }

  // Get all re-engagement emails that have been sent for these access codes
  const accessCodeIds = unusedCodes.map((c) => c.id);
  const sentEmails = await db
    .select({
      email: reengagementEmails.email,
      accessCodeId: reengagementEmails.accessCodeId,
    })
    .from(reengagementEmails)
    .where(inArray(reengagementEmails.accessCodeId, accessCodeIds));

  // Create a Set for O(1) lookup of sent emails
  const sentEmailsSet = new Set(
    sentEmails.map((se) => `${se.email}:${se.accessCodeId}`),
  );

  // Filter out codes that have already received re-engagement emails
  const eligibleRecipients = unusedCodes.filter((code) => {
    if (!code.email) return false;
    return !sentEmailsSet.has(`${code.email}:${code.id}`);
  });

  return eligibleRecipients;
}
