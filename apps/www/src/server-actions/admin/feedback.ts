"use server";

import { adminOnly } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { User } from "@terragon/shared";
import {
  getFeedbackListForAdmin,
  updateFeedbackStatusForAdmin,
} from "@terragon/shared/model/feedback";

export const getFeedbackList = adminOnly(async function getFeedbackList() {
  return await getFeedbackListForAdmin({ db });
});

export const updateFeedbackStatus = adminOnly(
  async function updateFeedbackStatus(
    adminUser: User,
    feedbackId: string,
    resolved: boolean,
  ) {
    await updateFeedbackStatusForAdmin({ db, feedbackId, resolved });
    return { success: true };
  },
);
