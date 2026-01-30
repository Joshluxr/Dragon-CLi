import type { ThreadInfoFull, ThreadChatInfoFull } from "../db/types";

export function getPrimaryThreadChat(
  thread: ThreadInfoFull,
): ThreadChatInfoFull {
  const threadChat = thread.threadChats[0];
  if (!threadChat) {
    throw new Error(`Thread ${thread.id} does not have any thread chats`);
  }
  return threadChat;
}

export const LEGACY_THREAD_CHAT_ID = "legacy-thread-chat-id";
