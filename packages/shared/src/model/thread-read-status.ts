import { DB } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { publishBroadcastUserMessage } from "../broadcast-server";
import { LEGACY_THREAD_CHAT_ID } from "../utils/thread-utils";

async function updateThreadReadStatus({
  db,
  userId,
  threadId,
  threadChatIdOrNull,
  isRead,
}: {
  db: DB;
  userId: string;
  threadId: string;
  threadChatIdOrNull: string | null;
  isRead: boolean;
}): Promise<void> {
  const now = new Date();
  if (threadChatIdOrNull && threadChatIdOrNull !== LEGACY_THREAD_CHAT_ID) {
    await db
      .insert(schema.threadChatReadStatus)
      .values({
        userId,
        threadId,
        threadChatId: threadChatIdOrNull,
        isRead,
        lastReadAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.threadChatReadStatus.userId,
          schema.threadChatReadStatus.threadId,
          schema.threadChatReadStatus.threadChatId,
        ],
        set: {
          isRead,
          lastReadAt: now,
          updatedAt: now,
        },
      });
  } else {
    await db
      .insert(schema.threadReadStatus)
      .values({
        userId,
        threadId,
        isRead,
        lastReadAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.threadReadStatus.userId,
          schema.threadReadStatus.threadId,
        ],
        set: {
          isRead,
          lastReadAt: now,
          updatedAt: now,
        },
      });
  }
}

export async function markThreadAsRead({
  db,
  userId,
  threadId,
  shouldPublishRealtimeEvent,
}: {
  db: DB;
  userId: string;
  threadId: string;
  shouldPublishRealtimeEvent?: boolean;
}): Promise<void> {
  await updateThreadReadStatus({
    db,
    userId,
    threadId,
    threadChatIdOrNull: null,
    isRead: true,
  });
  if (shouldPublishRealtimeEvent) {
    await publishBroadcastUserMessage({
      type: "user",
      id: userId,
      data: {
        threadId,
        isThreadUnread: false,
      },
    });
  }
}

export async function markThreadChatAsRead({
  db,
  userId,
  threadId,
  threadChatId,
  shouldPublishRealtimeEvent,
}: {
  db: DB;
  userId: string;
  threadId: string;
  threadChatId: string;
  shouldPublishRealtimeEvent?: boolean;
}): Promise<void> {
  await updateThreadReadStatus({
    db,
    userId,
    threadId,
    threadChatIdOrNull: threadChatId,
    isRead: true,
  });
  if (shouldPublishRealtimeEvent) {
    await publishBroadcastUserMessage({
      type: "user",
      id: userId,
      data: {
        threadId,
        threadChatId,
        isThreadUnread: false,
      },
    });
  }
}

export async function markThreadChatAsUnread({
  db,
  userId,
  threadId,
  threadChatIdOrNull,
  shouldPublishRealtimeEvent,
}: {
  db: DB;
  userId: string;
  threadId: string;
  threadChatIdOrNull: string | null;
  shouldPublishRealtimeEvent?: boolean;
}): Promise<void> {
  await updateThreadReadStatus({
    db,
    userId,
    threadId,
    threadChatIdOrNull: threadChatIdOrNull,
    isRead: false,
  });
  if (shouldPublishRealtimeEvent) {
    // Fetch the thread name to include in the notification
    const thread = await db.query.thread.findFirst({
      where: eq(schema.thread.id, threadId),
      columns: {
        name: true,
      },
    });
    await publishBroadcastUserMessage({
      type: "user",
      id: userId,
      data: {
        threadId,
        threadChatId: threadChatIdOrNull ?? undefined,
        isThreadUnread: true,
        threadName: thread?.name ?? undefined,
      },
    });
  }
}
