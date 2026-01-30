"use server";

import { db } from "@/lib/db";
import { FeedbackType } from "@terragon/shared";
import { getUserOrNull, userOnlyAction } from "@/lib/auth-server";
import { getPostHogServer } from "@/lib/posthog-server";
import { sendFeedbackToSlack } from "@/utils/slack";
import { createFeedback } from "@terragon/shared/model/feedback";
import { UserFacingError } from "@/lib/server-actions";

export const submitFeedback = userOnlyAction(
  async function submitFeedback(
    userId: string,
    {
      type,
      message,
      currentPage,
    }: {
      type: FeedbackType;
      message: string;
      currentPage: string;
    },
  ) {
    const user = await getUserOrNull();
    if (!user) {
      throw new UserFacingError("Unauthorized");
    }
    getPostHogServer().capture({
      distinctId: userId,
      event: "submit_feedback",
      properties: {
        type,
        message,
        currentPage,
      },
    });
    const newFeedback = await createFeedback({
      db,
      userId: user.id,
      type,
      message,
      currentPage,
    });
    // Send notification to Slack
    await sendFeedbackToSlack({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      type,
      message,
      currentPage,
      feedbackId: newFeedback.id,
    });
    return { success: true };
  },
  { defaultErrorMessage: "Failed to submit feedback" },
);
