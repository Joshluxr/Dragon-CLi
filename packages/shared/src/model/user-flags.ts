import { eq } from "drizzle-orm";
import { DB } from "../db";
import * as schema from "../db/schema";
import type { UserFlags } from "../db/types";
import { publishBroadcastUserMessage } from "../broadcast-server";

export async function getUserFlags({
  db,
  userId,
}: {
  db: DB;
  userId: string;
}): Promise<UserFlags> {
  let userFlags = await db.query.userFlags.findFirst({
    where: eq(schema.userFlags.userId, userId),
  });
  if (!userFlags) {
    // Create default flags if none exist
    const [newUserFlags] = await db
      .insert(schema.userFlags)
      .values({
        userId,
      })
      .returning();
    if (!newUserFlags) {
      throw new Error("Failed to create user flags");
    }
    userFlags = newUserFlags;
  }

  return userFlags;
}

export async function updateUserFlags({
  db,
  userId,
  updates,
}: {
  db: DB;
  userId: string;
  updates: Partial<
    Omit<
      typeof schema.userFlags.$inferSelect,
      "id" | "userId" | "createdAt" | "updatedAt"
    >
  >;
}): Promise<UserFlags> {
  // Ensure we're not trying to update protected fields
  if (
    "id" in updates ||
    "userId" in updates ||
    "createdAt" in updates ||
    "updatedAt" in updates
  ) {
    throw new Error("id, userId, createdAt, and updatedAt cannot be updated");
  }
  const [updatedFlags] = await db
    .update(schema.userFlags)
    .set(updates)
    .where(eq(schema.userFlags.userId, userId))
    .returning();
  if (!updatedFlags) {
    throw new Error("Failed to update user flags");
  }
  await publishBroadcastUserMessage({
    type: "user",
    id: userId,
    data: { userFlags: true },
  });
  return updatedFlags;
}
