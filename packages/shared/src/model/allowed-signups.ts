import { desc, eq, inArray } from "drizzle-orm";
import { DB } from "../db";
import * as schema from "../db/schema";
import { AllowedSignupWithUserId } from "../db/types";

export async function listAllowedSignups({
  db,
}: {
  db: DB;
}): Promise<AllowedSignupWithUserId[]> {
  const allowedSignups = await db.query.allowedSignups.findMany({
    orderBy: (allowedSignups) => [desc(allowedSignups.createdAt)],
  });

  const userIdsByEmail: Record<string, string> = {};
  const users = await db.query.user.findMany({
    where: inArray(
      schema.user.email,
      allowedSignups.map((allowedSignup) => allowedSignup.email),
    ),
    columns: { id: true, email: true },
  });
  for (const user of users) {
    userIdsByEmail[user.email] = user.id;
  }

  return allowedSignups.map((allowedSignup) => {
    const userIdOrNull = userIdsByEmail[allowedSignup.email] ?? null;
    return {
      id: allowedSignup.id,
      email: allowedSignup.email,
      createdAt: allowedSignup.createdAt,
      userIdOrNull,
    };
  });
}

export async function addAllowedSignup({
  db,
  email,
}: {
  db: DB;
  email: string;
}) {
  // Check if already exists
  const existing = await db.query.allowedSignups.findFirst({
    where: eq(schema.allowedSignups.email, email),
  });
  if (existing) {
    throw new Error("Email is already in the allowed list");
  }
  await db.insert(schema.allowedSignups).values({
    email: email.toLowerCase().trim(),
  });
}

export async function removeAllowedSignup({ db, id }: { db: DB; id: string }) {
  await db
    .delete(schema.allowedSignups)
    .where(eq(schema.allowedSignups.id, id));
}

export async function isSignupAllowed({
  db,
  email,
}: {
  db: DB;
  email: string;
}) {
  const allowedSignup = await db.query.allowedSignups.findFirst({
    where: eq(schema.allowedSignups.email, email),
  });
  return !!allowedSignup;
}
