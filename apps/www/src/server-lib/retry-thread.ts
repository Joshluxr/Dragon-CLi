import { db } from "@/lib/db";
import { getUserMessageToSend } from "@/lib/db-message-helpers";
import { ThreadChat } from "@terragon/shared";
import { updateThreadChat } from "@terragon/shared/model/threads";

export async function ensureThreadChatHasUserMessage({
  threadChat,
}: {
  threadChat: ThreadChat;
}) {
  const userMessageOrNull = getUserMessageToSend({
    messages: threadChat.messages,
    currentMessage: null,
  });
  if (!userMessageOrNull) {
    await updateThreadChat({
      db,
      userId: threadChat.userId,
      threadId: threadChat.threadId,
      threadChatId: threadChat.id,
      updates: {
        appendMessages: [
          {
            type: "system",
            message_type: "generic-retry",
            parts: [{ type: "text", text: "Please try again." }],
            model: null,
          },
        ],
      },
    });
  }
}
