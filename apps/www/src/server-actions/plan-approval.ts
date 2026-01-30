"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  getExecutionPlan,
  updateExecutionPlanStatus,
  modifyExecutionPlan,
  transitionToActMode,
} from "@terragon/shared/model/plan-management";
import { getPostHogServer } from "@/lib/posthog-server";
import type { PlanApprovalRequest } from "@terragon/shared";
import { thread, threadChat } from "@terragon/shared/db/schema";
import { eq } from "drizzle-orm";

export const approvePlanAction = userOnlyAction(
  async function approvePlanAction(
    userId: string,
    request: PlanApprovalRequest,
  ): Promise<{ success: boolean; message: string }> {
    const plan = await getExecutionPlan({ db, planId: request.planId });

    if (!plan) {
      return { success: false, message: "Plan not found" };
    }

    // Verify user owns the thread
    const threadRecord = await db.query.thread.findFirst({
      where: eq(thread.id, plan.threadId),
    });

    if (!threadRecord || threadRecord.userId !== userId) {
      return { success: false, message: "Unauthorized" };
    }

    getPostHogServer().capture({
      distinctId: userId,
      event: "plan_approval_decision",
      properties: {
        planId: request.planId,
        decision: request.decision,
        hasModifications: request.modifications?.length ?? 0 > 0,
        hasComment: !!request.comment,
      },
    });

    if (request.decision === "approve") {
      await updateExecutionPlanStatus({
        db,
        planId: plan.id,
        status: "approved",
        approvedBy: userId,
      });

      // Transition to Act mode
      await transitionToActMode({ db, planId: plan.id });

      return { success: true, message: "Plan approved and execution started" };
    }

    if (request.decision === "modify" && request.modifications) {
      await modifyExecutionPlan({
        db,
        planId: plan.id,
        modifications: request.modifications,
      });

      return {
        success: true,
        message: "Plan modified and awaiting approval",
      };
    }

    if (request.decision === "reject") {
      await updateExecutionPlanStatus({
        db,
        planId: plan.id,
        status: "rejected",
      });

      return { success: true, message: "Plan rejected" };
    }

    return { success: false, message: "Invalid decision" };
  },
  { defaultErrorMessage: "Failed to process plan approval" },
);

export const updateAgentModeAction = userOnlyAction(
  async function updateAgentModeAction(
    userId: string,
    {
      threadId,
      chatId,
      mode,
    }: {
      threadId: string;
      chatId?: string;
      mode: "plan" | "act" | "auto";
    },
  ): Promise<void> {
    // Verify user owns the thread
    const threadRecord = await db.query.thread.findFirst({
      where: eq(thread.id, threadId),
    });

    if (!threadRecord || threadRecord.userId !== userId) {
      throw new Error("Unauthorized");
    }

    getPostHogServer().capture({
      distinctId: userId,
      event: "update_agent_mode",
      properties: {
        threadId,
        chatId,
        mode,
      },
    });

    if (chatId) {
      await db
        .update(threadChat)
        .set({ agentMode: mode })
        .where(eq(threadChat.id, chatId));
    } else {
      await db
        .update(thread)
        .set({ agentMode: mode })
        .where(eq(thread.id, threadId));
    }
  },
  { defaultErrorMessage: "Failed to update agent mode" },
);
