import { DB } from "../db";
import * as schema from "../db/schema";
import { getTableColumns, eq, desc } from "drizzle-orm";
import { FeedbackType } from "../db/types";

export async function getFeedbackListForAdmin({ db }: { db: DB }) {
  const feedback = getTableColumns(schema.feedback);
  return await db
    .select({
      ...feedback,
      userName: schema.user.name,
    })
    .from(schema.feedback)
    .leftJoin(schema.user, eq(schema.feedback.userId, schema.user.id))
    .orderBy(desc(schema.feedback.createdAt));
}

export async function updateFeedbackStatusForAdmin({
  db,
  feedbackId,
  resolved,
}: {
  db: DB;
  feedbackId: string;
  resolved: boolean;
}) {
  await db
    .update(schema.feedback)
    .set({ resolved })
    .where(eq(schema.feedback.id, feedbackId));
}

export async function createFeedback({
  db,
  userId,
  type,
  message,
  currentPage,
}: {
  db: DB;
  userId: string;
  type: FeedbackType;
  message: string;
  currentPage: string;
}) {
  const [newFeedback] = await db
    .insert(schema.feedback)
    .values({
      userId,
      type,
      message,
      currentPage,
    })
    .returning();
  if (!newFeedback) {
    throw new Error("Failed to create feedback");
  }
  return newFeedback;
}
