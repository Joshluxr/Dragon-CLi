import { DB } from "../db";
import { accessCodes } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function generateAccessCode({
  db,
  createdByUserId,
  options,
}: {
  db: DB;
  createdByUserId: string;
  options?: {
    email?: string;
  };
}) {
  const code = `ac_${nanoid(20)}`;

  const [accessCode] = await db
    .insert(accessCodes)
    .values({
      code,
      email: options?.email,
      createdByUserId,
      expiresAt: null,
    })
    .returning();

  return accessCode;
}

export async function validateAccessCode({
  db,
  code,
}: {
  db: DB;
  code: string;
}) {
  const [accessCode] = await db
    .select()
    .from(accessCodes)
    .where(and(eq(accessCodes.code, code), isNull(accessCodes.usedAt)))
    .limit(1);

  return accessCode;
}

export async function markAccessCodeAsUsed({
  db,
  code,
  email,
}: {
  db: DB;
  code: string;
  email: string;
}) {
  const [updated] = await db
    .update(accessCodes)
    .set({
      usedByEmail: email,
      usedAt: new Date(),
    })
    .where(eq(accessCodes.code, code))
    .returning();

  return updated;
}

export async function getAccessCodesByCreator({
  db,
  createdByUserId,
}: {
  db: DB;
  createdByUserId: string;
}) {
  return db
    .select()
    .from(accessCodes)
    .where(eq(accessCodes.createdByUserId, createdByUserId))
    .orderBy(accessCodes.createdAt);
}

export async function deleteAccessCode({ db, id }: { db: DB; id: string }) {
  await db.delete(accessCodes).where(eq(accessCodes.id, id));
}
