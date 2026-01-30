import { ThreadVisibility } from "../db/types";
import { DB } from "../db";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";

export async function updateThreadVisibility({
  db,
  userId,
  threadId,
  visibility,
}: {
  db: DB;
  userId: string;
  threadId: string;
  visibility: ThreadVisibility;
}) {
  // Make sure the user is the owner of the thread
  const thread = await db.query.thread.findFirst({
    where: and(
      eq(schema.thread.id, threadId),
      eq(schema.thread.userId, userId),
    ),
    columns: {
      userId: true,
    },
  });
  if (!thread) {
    throw new Error("Thread not found");
  }
  await db
    .insert(schema.threadVisibility)
    .values({
      threadId,
      visibility,
    })
    .onConflictDoUpdate({
      target: [schema.threadVisibility.threadId],
      set: {
        visibility,
        updatedAt: new Date(),
      },
    });
}
