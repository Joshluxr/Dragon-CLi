import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, createTestThread } from "./test-helpers";
import { env } from "@terragon/env/pkg-shared";
import { createDb, DB } from "../db";
import { User } from "../db/types";
import {
  markThreadChatAsUnread,
  markThreadChatAsRead,
  markThreadAsRead,
} from "./thread-read-status";
import { getThread, getThreadChat } from "./threads";

const db = createDb(env.DATABASE_URL!);

async function isThreadChatRead({
  db,
  userId,
  threadId,
  threadChatId,
}: {
  db: DB;
  userId: string;
  threadId: string;
  threadChatId: string;
}): Promise<boolean> {
  const threadChat = await getThreadChat({
    db,
    userId,
    threadId,
    threadChatId,
  });
  if (!threadChat) {
    throw new Error("Thread chat not found");
  }
  return !threadChat.isUnread;
}

async function isThreadRead({
  db,
  userId,
  threadId,
}: {
  db: DB;
  userId: string;
  threadId: string;
}): Promise<boolean> {
  const thread = await getThread({ db, userId, threadId });
  if (!thread) {
    throw new Error("Thread not found");
  }
  return !thread.isUnread;
}

describe("thread-read-status", () => {
  let user: User;

  beforeEach(async () => {
    const testUserAndAccount = await createTestUser({ db });
    user = testUserAndAccount.user;
  });

  it("should mark a thread chat as read and unread", async () => {
    const { threadId, threadChatId } = await createTestThread({
      db,
      userId: user.id,
    });

    // Initially, no read status exists
    expect(
      await isThreadChatRead({ db, userId: user.id, threadId, threadChatId }),
    ).toBe(true);

    // Mark as read
    await markThreadChatAsRead({
      db,
      userId: user.id,
      threadId,
      threadChatId,
    });

    expect(
      await isThreadChatRead({ db, userId: user.id, threadId, threadChatId }),
    ).toBe(true);

    // Mark as unread
    await markThreadChatAsUnread({
      db,
      userId: user.id,
      threadId,
      threadChatIdOrNull: threadChatId,
    });
    expect(
      await isThreadChatRead({ db, userId: user.id, threadId, threadChatId }),
    ).toBe(false);
  });

  it("should mark thread as read when threadChatId is null", async () => {
    const { threadId } = await createTestThread({
      db,
      userId: user.id,
    });
    // Threads start as read
    expect(await isThreadRead({ db, userId: user.id, threadId })).toBe(true);
    // Mark thread as unread with null threadChatId
    await markThreadChatAsUnread({
      db,
      userId: user.id,
      threadId,
      threadChatIdOrNull: null,
    });
    expect(await isThreadRead({ db, userId: user.id, threadId })).toBe(false);
    // Mark thread as read
    await markThreadAsRead({
      db,
      userId: user.id,
      threadId,
    });
    expect(await isThreadRead({ db, userId: user.id, threadId })).toBe(true);
  });

  it("should mark entire thread as read when marking a specific chat as read", async () => {
    const { threadId, threadChatId } = await createTestThread({
      db,
      userId: user.id,
    });
    // Initially starts as read
    expect(await isThreadRead({ db, userId: user.id, threadId })).toBe(true);
    expect(
      await isThreadChatRead({ db, userId: user.id, threadId, threadChatId }),
    ).toBe(true);
    // Mark specific chat as read (should also mark thread as read)
    await markThreadChatAsRead({
      db,
      userId: user.id,
      threadId,
      threadChatId,
    });
    // Both thread and chat should be read
    expect(await isThreadRead({ db, userId: user.id, threadId })).toBe(true);
    expect(
      await isThreadChatRead({ db, userId: user.id, threadId, threadChatId }),
    ).toBe(true);
  });
});
