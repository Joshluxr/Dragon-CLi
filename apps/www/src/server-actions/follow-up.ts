"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { DBUserMessage } from "@terragon/shared";
import {
  followUpInternal,
  queueFollowUpInternal,
} from "@/server-lib/follow-up";
import { getAccessInfoForUser } from "@/lib/subscription";
import { SUBSCRIPTION_MESSAGES } from "@/lib/subscription-msgs";
import { UserFacingError } from "@/lib/server-actions";

export type FollowUpArgs = {
  threadId: string;
  threadChatId: string;
  message: DBUserMessage;
};

export const followUp = userOnlyAction(
  async function followUp(
    userId: string,
    {
      threadId,
      threadChatId,
      message,
    }: {
      threadId: string;
      threadChatId: string;
      message: DBUserMessage;
    },
  ) {
    console.log("followUp", { threadId, threadChatId });
    const { tier } = await getAccessInfoForUser(userId);
    if (tier === "none") {
      throw new UserFacingError(SUBSCRIPTION_MESSAGES.FOLLOW_UP);
    }
    await followUpInternal({
      userId,
      threadId,
      threadChatId,
      message,
      source: "www",
    });
  },
  { defaultErrorMessage: "Failed to submit follow up" },
);

export type QueueFollowUpArgs = {
  threadId: string;
  threadChatId: string;
  messages: DBUserMessage[];
};

export const queueFollowUp = userOnlyAction(
  async function queueFollowUp(
    userId: string,
    {
      threadId,
      threadChatId,
      messages,
    }: {
      threadId: string;
      threadChatId: string;
      messages: DBUserMessage[];
    },
  ) {
    console.log("queueFollowUp", { threadId, threadChatId });
    const { tier } = await getAccessInfoForUser(userId);
    if (tier === "none") {
      throw new UserFacingError(SUBSCRIPTION_MESSAGES.QUEUE_FOLLOW_UP);
    }
    await queueFollowUpInternal({
      userId,
      threadId,
      threadChatId,
      messages,
      source: "www",
      appendOrReplace: "replace",
    });
  },
  { defaultErrorMessage: "Failed to queue follow-up" },
);
