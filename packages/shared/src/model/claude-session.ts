import { DB } from "../db";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";
import { getThreadMinimal } from "./threads";

export async function getClaudeSessionCheckpoint({
  db,
  userId,
  threadId,
  sessionId,
}: {
  db: DB;
  userId: string;
  threadId: string;
  sessionId: string;
}) {
  const checkpoint = await db
    .select({
      checkpoint: schema.claudeSessionCheckpoints,
    })
    .from(schema.claudeSessionCheckpoints)
    .innerJoin(
      schema.thread,
      eq(schema.claudeSessionCheckpoints.threadId, schema.thread.id),
    )
    .where(
      and(
        eq(schema.claudeSessionCheckpoints.threadId, threadId),
        eq(schema.claudeSessionCheckpoints.sessionId, sessionId),
        eq(schema.thread.userId, userId),
      ),
    );
  if (checkpoint.length === 0) {
    return null;
  }
  return checkpoint[0]!.checkpoint;
}

export async function upsertClaudeSessionCheckpoint({
  db,
  userId,
  threadId,
  sessionId,
  r2Key,
}: {
  db: DB;
  userId: string;
  threadId: string;
  sessionId: string;
  r2Key: string;
}) {
  // Make sure the thread & user exist
  const thread = await getThreadMinimal({ db, threadId, userId });
  if (!thread) {
    throw new Error("Thread not found");
  }
  await db
    .insert(schema.claudeSessionCheckpoints)
    .values({
      threadId,
      sessionId,
      r2Key,
    })
    .onConflictDoUpdate({
      target: [
        schema.claudeSessionCheckpoints.threadId,
        schema.claudeSessionCheckpoints.sessionId,
      ],
      set: {
        r2Key,
      },
    });
}
