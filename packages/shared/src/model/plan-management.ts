/**
 * Execution Plan Model Functions
 *
 * Database operations for managing execution plans in Plan/Act mode.
 */

import { eq, desc } from "drizzle-orm";
import { executionPlan, thread, threadChat } from "../db/schema";
import { DB } from "../db";
import type {
  PlanPhase,
  PlanStatus,
  PlanModification,
  StepCompleteEvent,
} from "./execution-plan";
import { applyModifications, calculateTotalSteps } from "./execution-plan";

export interface CreateExecutionPlanArgs {
  db: DB;
  threadId: string;
  chatId?: string;
  title: string;
  summary: string;
  phases: PlanPhase[];
}

export async function createExecutionPlan({
  db,
  threadId,
  chatId,
  title,
  summary,
  phases,
}: CreateExecutionPlanArgs) {
  const estimatedSteps = calculateTotalSteps(phases);

  const [plan] = await db
    .insert(executionPlan)
    .values({
      threadId,
      chatId,
      title,
      summary,
      phases,
      estimatedSteps,
      status: "pending_approval",
    })
    .returning();

  if (!plan) {
    throw new Error("Failed to create execution plan");
  }

  // Update thread/chat with plan reference
  if (chatId) {
    await db
      .update(threadChat)
      .set({
        executionPlanId: plan.id,
        agentMode: "plan",
      })
      .where(eq(threadChat.id, chatId));
  } else {
    await db
      .update(thread)
      .set({
        executionPlanId: plan.id,
        agentMode: "plan",
      })
      .where(eq(thread.id, threadId));
  }

  return plan;
}

export interface UpdateExecutionPlanStatusArgs {
  db: DB;
  planId: string;
  status: PlanStatus;
  approvedBy?: string;
}

export async function updateExecutionPlanStatus({
  db,
  planId,
  status,
  approvedBy,
}: UpdateExecutionPlanStatusArgs) {
  const updateData: Record<string, unknown> = { status };

  if (status === "approved" && approvedBy) {
    updateData.approvedBy = approvedBy;
    updateData.approvedAt = new Date();
  }

  const [updated] = await db
    .update(executionPlan)
    .set(updateData)
    .where(eq(executionPlan.id, planId))
    .returning();

  return updated;
}

export interface ModifyExecutionPlanArgs {
  db: DB;
  planId: string;
  modifications: PlanModification[];
}

export async function modifyExecutionPlan({
  db,
  planId,
  modifications,
}: ModifyExecutionPlanArgs) {
  const plan = await db.query.executionPlan.findFirst({
    where: eq(executionPlan.id, planId),
  });

  if (!plan || !plan.phases) {
    throw new Error("Plan not found");
  }

  const updatedPhases = applyModifications(
    plan.phases as PlanPhase[],
    modifications,
  );
  const estimatedSteps = calculateTotalSteps(updatedPhases);

  const [updated] = await db
    .update(executionPlan)
    .set({
      phases: updatedPhases,
      estimatedSteps,
      version: (plan.version ?? 1) + 1,
      status: "pending_approval",
    })
    .where(eq(executionPlan.id, planId))
    .returning();

  return updated;
}

export interface UpdatePlanProgressArgs {
  db: DB;
  planId: string;
  event: StepCompleteEvent;
}

export async function updatePlanProgress({
  db,
  planId,
  event,
}: UpdatePlanProgressArgs) {
  const plan = await db.query.executionPlan.findFirst({
    where: eq(executionPlan.id, planId),
  });

  if (!plan || !plan.phases) {
    throw new Error("Plan not found");
  }

  const phases = plan.phases as PlanPhase[];
  let phaseIndex = 0;
  let totalCompletedSteps = 0;

  const updatedPhases = phases.map((phase, pIdx) => {
    const updatedSteps = phase.steps.map((step) => {
      if (phase.id === event.phaseId && step.id === event.stepId) {
        phaseIndex = pIdx;
        return {
          ...step,
          status: "completed" as const,
          output: event.output,
        };
      }
      if (step.status === "completed" || step.status === "skipped") {
        totalCompletedSteps++;
      }
      return step;
    });

    // Check if all steps in phase are done
    const allStepsDone = updatedSteps.every(
      (s) => s.status === "completed" || s.status === "skipped",
    );

    return {
      ...phase,
      steps: updatedSteps,
      status: allStepsDone ? ("completed" as const) : phase.status,
    };
  });

  // Check if all phases are done
  const allPhasesDone = updatedPhases.every((p) => p.status === "completed");
  const newStatus: PlanStatus = allPhasesDone ? "completed" : "in_progress";

  const [updated] = await db
    .update(executionPlan)
    .set({
      phases: updatedPhases,
      currentPhase: phaseIndex,
      currentStep: totalCompletedSteps + 1,
      status: newStatus,
    })
    .where(eq(executionPlan.id, planId))
    .returning();

  return updated;
}

export interface GetExecutionPlanArgs {
  db: DB;
  planId: string;
}

export async function getExecutionPlan({ db, planId }: GetExecutionPlanArgs) {
  return db.query.executionPlan.findFirst({
    where: eq(executionPlan.id, planId),
  });
}

export interface GetExecutionPlanByThreadArgs {
  db: DB;
  threadId: string;
}

export async function getLatestExecutionPlanByThread({
  db,
  threadId,
}: GetExecutionPlanByThreadArgs) {
  return db.query.executionPlan.findFirst({
    where: eq(executionPlan.threadId, threadId),
    orderBy: [desc(executionPlan.createdAt)],
  });
}

export interface GetExecutionPlansByChatArgs {
  db: DB;
  chatId: string;
}

export async function getExecutionPlansByChat({
  db,
  chatId,
}: GetExecutionPlansByChatArgs) {
  return db.query.executionPlan.findMany({
    where: eq(executionPlan.chatId, chatId),
    orderBy: [desc(executionPlan.version)],
  });
}

export interface TransitionToActModeArgs {
  db: DB;
  planId: string;
}

export async function transitionToActMode({
  db,
  planId,
}: TransitionToActModeArgs) {
  const plan = await db.query.executionPlan.findFirst({
    where: eq(executionPlan.id, planId),
  });

  if (!plan) {
    throw new Error("Plan not found");
  }

  // Update plan status
  await db
    .update(executionPlan)
    .set({ status: "in_progress" })
    .where(eq(executionPlan.id, planId));

  // Update thread/chat mode
  if (plan.chatId) {
    await db
      .update(threadChat)
      .set({ agentMode: "act" })
      .where(eq(threadChat.id, plan.chatId));
  } else {
    await db
      .update(thread)
      .set({ agentMode: "act" })
      .where(eq(thread.id, plan.threadId));
  }

  return plan;
}
