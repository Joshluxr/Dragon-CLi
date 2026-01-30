import { db } from "@/lib/db";
import { updateThreadChatWithTransition } from "@/agent/update-status";
import { getSlashCommandOrNull } from "@/agent/slash-command-handler";
import { startAgentMessage } from "@/agent/msg/startAgentMessage";
import { getLastUserMessageModel } from "@/lib/db-message-helpers";
import { getDefaultModelForAgent } from "@terragon/agent/utils";
import { getThreadChat } from "@terragon/shared/model/threads";

export async function maybeProcessFollowUpQueue({
  userId,
  threadId,
  threadChatId,
}: {
  userId: string;
  threadId: string;
  threadChatId: string;
}) {
  console.log("Checking if we have queued follow up messages", {
    threadId,
    threadChatId,
  });
  const threadChat = await getThreadChat({
    db,
    threadId,
    threadChatId,
    userId,
  });
  if (!threadChat) {
    throw new Error("Thread chat not found");
  }
  // Don't process follow up messages if the thread is rate limited by the agent.
  if (threadChat.status === "queued-agent-rate-limit") {
    console.log(
      `Skipping follow-up queue processing for thread - agent rate limited`,
      {
        threadId,
        threadChatId: threadChat.id,
      },
    );
    return;
  }
  if (!threadChat.queuedMessages || threadChat.queuedMessages.length === 0) {
    return;
  }
  console.log("Processing queued follow up messages on thread", {
    threadId,
    threadChatId: threadChat.id,
  });

  // Find the first slash command in the queue (can be at any position)
  const slashCommandIndex = threadChat.queuedMessages.findIndex((msg) =>
    getSlashCommandOrNull(msg),
  );

  // If there's a slash command in the queue, we need to handle it specially
  if (slashCommandIndex !== -1) {
    const slashCommandMessage = threadChat.queuedMessages[slashCommandIndex]!;
    const messagesBeforeSlash = threadChat.queuedMessages.slice(
      0,
      slashCommandIndex,
    );
    const messagesAfterSlash = threadChat.queuedMessages.slice(
      slashCommandIndex + 1,
    );

    // If there are messages before the slash command, process them first
    if (messagesBeforeSlash.length > 0) {
      // Queue only the slash command and messages after it for later
      const { didUpdateStatus } = await updateThreadChatWithTransition({
        userId,
        threadId,
        threadChatId: threadChatId,
        eventType: "user.message",
        chatUpdates: {
          replaceQueuedMessages: [slashCommandMessage, ...messagesAfterSlash],
          appendMessages: messagesBeforeSlash,
        },
      });
      if (!didUpdateStatus) {
        throw new Error("Failed to process follow up message");
      }
      // Process the messages before the slash command
      await startAgentMessage({
        db,
        userId,
        threadId,
        threadChatId,
        isNewThread: false,
      });
      return;
    }

    // Slash command is first - process it and keep the rest queued
    const { didUpdateStatus } = await updateThreadChatWithTransition({
      userId,
      threadId,
      threadChatId: threadChatId,
      eventType: "user.message",
      chatUpdates: {
        replaceQueuedMessages: messagesAfterSlash,
      },
    });
    if (!didUpdateStatus) {
      throw new Error("Failed to process follow up message");
    }
    const messageWithModel = {
      ...slashCommandMessage,
      model:
        slashCommandMessage.model ??
        getLastUserMessageModel(threadChat.messages ?? []) ??
        getDefaultModelForAgent({
          agent: threadChat.agent,
          agentVersion: threadChat.agentVersion,
        }),
    };
    await startAgentMessage({
      db,
      userId,
      message: messageWithModel,
      threadId,
      threadChatId,
      isNewThread: false,
    });
    return;
  }

  const { didUpdateStatus } = await updateThreadChatWithTransition({
    userId,
    threadId,
    threadChatId,
    eventType: "user.message",
    chatUpdates: {
      appendAndResetQueuedMessages: true,
    },
  });
  if (!didUpdateStatus) {
    throw new Error("Failed to process follow up message");
  }
  await startAgentMessage({
    db,
    userId,
    threadId,
    threadChatId,
    isNewThread: false,
  });
}
