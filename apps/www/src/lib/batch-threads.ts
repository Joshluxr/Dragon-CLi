import { redis } from "./redis";

/**
 * Batches thread creation requests using Redis to prevent duplicate threads from being created
 * when multiple concurrent requests arrive with the same batch key.
 *
 * Uses a distributed lock pattern:
 * - First request sets a placeholder value and creates the thread
 * - Subsequent requests wait for the thread ID to be set by the first request
 * - If waiting times out or the key is deleted, creates a new thread as fallback
 *
 * @returns The thread ID (either newly created or from another concurrent request)
 */
export async function maybeBatchThreads({
  userId,
  batchKey,
  expiresSecs,
  maxWaitTimeMs,
  createNewThread,
}: {
  userId: string;
  batchKey: string;
  expiresSecs: number;
  maxWaitTimeMs: number;
  createNewThread: () => Promise<{ threadId: string; threadChatId: string }>;
}): Promise<{
  threadId: string;
  threadChatId: string;
  didCreateNewThread: boolean;
}> {
  const key = `thread-batch:${userId}:${batchKey}`;
  const placeholder = "pending";
  const pollInterval = 100; // 100ms
  const wasSet = await redis.set(key, placeholder, {
    nx: true,
    ex: expiresSecs,
  });

  const createAndSetThreadId = async () => {
    let threadId: string;
    let threadChatId: string;
    try {
      const newThreadResult = await createNewThread();
      threadId = newThreadResult.threadId;
      threadChatId = newThreadResult.threadChatId;
    } catch (error) {
      console.error("Error creating thread", error);
      if (wasSet === "OK") {
        try {
          await redis.del(key);
        } catch (error) {
          console.error("Error deleting key", error);
        }
      }
      throw error;
    }
    await redis.set(key, `${threadId}/${threadChatId}`, {
      ex: expiresSecs,
      xx: true,
    });
    return { threadId, threadChatId };
  };
  if (wasSet === "OK") {
    const { threadId, threadChatId } = await createAndSetThreadId();
    return {
      threadId,
      threadChatId,
      didCreateNewThread: true,
    };
  }
  // Another request is creating the thread - wait for it
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitTimeMs) {
    const value = await redis.get<string>(key);
    if (!value) {
      console.log("Key not found while waiting for threadId");
      break;
    }
    if (value !== placeholder) {
      console.log("Found non-placeholder value while waiting for threadId", {
        value,
      });
      const parts = value.split("/");
      if (parts.length !== 2) {
        console.error("Invalid value while waiting for threadId", { value });
        break;
      }
      const threadId = parts[0];
      const threadChatId = parts[1];
      if (!threadId || !threadChatId) {
        console.error("Invalid value while waiting for threadId", { value });
        break;
      }
      return {
        threadId,
        threadChatId,
        didCreateNewThread: false,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  // Timeout waiting for threadId - create a new thread
  const { threadId, threadChatId } = await createAndSetThreadId();
  return {
    threadId,
    threadChatId,
    didCreateNewThread: true,
  };
}
