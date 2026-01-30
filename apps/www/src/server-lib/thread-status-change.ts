import { maybeUpdateGitHubCheckRunForThreadChat } from "./github";

export async function onThreadChatStopped({
  userId,
  threadId,
  threadChatId,
}: {
  userId: string;
  threadId: string;
  threadChatId: string;
}) {
  await maybeUpdateGitHubCheckRunForThreadChat({
    userId,
    threadId,
    threadChatId,
    status: "completed",
    conclusion: "cancelled",
    summary: `Task stopped: ${threadId}`,
  });
}

export async function onThreadChatError({
  userId,
  threadId,
  threadChatId,
}: {
  userId: string;
  threadId: string;
  threadChatId: string;
}) {
  await maybeUpdateGitHubCheckRunForThreadChat({
    userId,
    threadId,
    threadChatId,
    status: "completed",
    conclusion: "failure",
    summary: `Task error: ${threadId}`,
  });
}
