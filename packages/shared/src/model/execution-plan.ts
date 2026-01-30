/**
 * Execution Plan Types
 *
 * Defines types for the Plan and Act mode workflow.
 */

export type PlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "in_progress"
  | "completed"
  | "failed";

export type StepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped";

export type PhaseStatus = "pending" | "in_progress" | "completed" | "skipped";

export type AgentMode = "plan" | "act" | "auto";

export interface PlanStep {
  id: string;
  action: string;
  description: string;
  files?: string[];
  commands?: string[];
  status: StepStatus;
  output?: string;
  error?: string;
}

export interface PlanPhase {
  id: string;
  name: string;
  description: string;
  steps: PlanStep[];
  status: PhaseStatus;
  dependencies?: string[];
}

export interface ExecutionPlanData {
  title: string;
  summary: string;
  phases: PlanPhase[];
}

export interface PlanModification {
  phaseId?: string;
  stepId?: string;
  change: string;
}

export interface PlanApprovalRequest {
  planId: string;
  decision: "approve" | "reject" | "modify";
  modifications?: PlanModification[];
  comment?: string;
}

export interface StepCompleteEvent {
  type: "step_complete";
  phaseId: string;
  stepId: string;
  output?: string;
}

/**
 * Parse execution plan from agent output
 */
export function extractExecutionPlan(
  content: string,
): ExecutionPlanData | null {
  const planMatch = content.match(
    /```json\s*(\{[\s\S]*?"type":\s*"execution_plan"[\s\S]*?\})\s*```/,
  );

  if (!planMatch) {
    return null;
  }

  try {
    const matchedJson = planMatch[1];
    if (!matchedJson) {
      return null;
    }
    const parsed = JSON.parse(matchedJson) as {
      type: string;
      title?: string;
      summary?: string;
      phases?: unknown[];
    };
    if (parsed.type !== "execution_plan") {
      return null;
    }

    return {
      title: parsed.title || "Untitled Plan",
      summary: parsed.summary || "",
      phases: (parsed.phases || []) as PlanPhase[],
    };
  } catch {
    return null;
  }
}

/**
 * Parse step completion from agent output
 */
export function extractStepComplete(content: string): StepCompleteEvent | null {
  const stepMatch = content.match(
    /```json\s*(\{[\s\S]*?"type":\s*"step_complete"[\s\S]*?\})\s*```/,
  );

  if (!stepMatch) {
    return null;
  }

  try {
    const matchedJson = stepMatch[1];
    if (!matchedJson) {
      return null;
    }
    const parsed = JSON.parse(matchedJson) as {
      type: string;
      phaseId?: string;
      stepId?: string;
      output?: string;
    };
    if (parsed.type !== "step_complete" || !parsed.phaseId || !parsed.stepId) {
      return null;
    }

    return {
      type: "step_complete",
      phaseId: parsed.phaseId,
      stepId: parsed.stepId,
      output: parsed.output,
    };
  } catch {
    return null;
  }
}

/**
 * Calculate total steps in a plan
 */
export function calculateTotalSteps(phases: PlanPhase[]): number {
  return phases.reduce((total, phase) => total + phase.steps.length, 0);
}

/**
 * Calculate completed steps in a plan
 */
export function calculateCompletedSteps(phases: PlanPhase[]): number {
  return phases.reduce((total, phase) => {
    return (
      total +
      phase.steps.filter(
        (step) => step.status === "completed" || step.status === "skipped",
      ).length
    );
  }, 0);
}

/**
 * Apply modifications to plan phases
 */
export function applyModifications(
  phases: PlanPhase[],
  modifications: PlanModification[] | undefined,
): PlanPhase[] {
  if (!modifications || modifications.length === 0) {
    return phases;
  }

  return phases.map((phase) => {
    const phaseModifications = modifications.filter(
      (m) => m.phaseId === phase.id,
    );
    if (phaseModifications.length === 0) {
      return phase;
    }

    return {
      ...phase,
      steps: phase.steps.map((step) => {
        const stepMod = phaseModifications.find((m) => m.stepId === step.id);
        if (!stepMod) {
          return step;
        }
        return {
          ...step,
          description: stepMod.change,
        };
      }),
    };
  });
}

/**
 * Build plan mode instructions for agent
 */
export function buildPlanModeInstructions(): string {
  return `
## MODE: PLANNING

You are in PLAN MODE. Your task is to analyze and create a detailed execution plan.

### Instructions:
1. DO NOT make any file changes yet
2. DO NOT run any destructive commands
3. Research the codebase thoroughly
4. Identify all files that need modification
5. Create a step-by-step plan

### Output Format:
When ready, output your plan using this exact format:

\`\`\`json
{
  "type": "execution_plan",
  "title": "Brief plan title",
  "summary": "2-3 sentence summary",
  "phases": [
    {
      "id": "phase-1",
      "name": "Phase Name",
      "description": "What this phase accomplishes",
      "status": "pending",
      "steps": [
        {
          "id": "step-1-1",
          "action": "modify_file",
          "description": "Add validation to user input handler",
          "files": ["src/handlers/user.ts"],
          "commands": [],
          "status": "pending"
        }
      ]
    }
  ]
}
\`\`\`

After outputting the plan, wait for user approval before proceeding.
`;
}

/**
 * Build act mode instructions for agent
 */
export function buildActModeInstructions(plan: ExecutionPlanData): string {
  const phasesText = plan.phases
    .map((phase, i) => {
      const stepsText = phase.steps
        .map((step, j) => {
          const files = step.files?.join(", ") || "N/A";
          const commands = step.commands?.join(", ") || "N/A";
          return `${j + 1}. ${step.description}\n   - Files: ${files}\n   - Commands: ${commands}`;
        })
        .join("\n");
      return `#### Phase ${i + 1}: ${phase.name}\n${stepsText}`;
    })
    .join("\n\n");

  return `
## MODE: EXECUTION

You are in ACT MODE. Execute the approved plan below.

### Approved Plan: ${plan.title}

${phasesText}

### Instructions:
1. Execute each step in order
2. Report progress after each step
3. If a step fails, stop and report the error
4. Mark steps complete using the progress format below

### Progress Format:
After completing each step, output:
\`\`\`json
{"type": "step_complete", "phaseId": "phase-1", "stepId": "step-1-1", "output": "Brief result"}
\`\`\`
`;
}

/**
 * Build auto mode instructions for agent
 */
export function buildAutoModeInstructions(): string {
  return `
## MODE: AUTO

You may plan and execute as you see fit. For complex tasks, consider:
1. Creating a brief plan first
2. Getting confirmation on approach
3. Executing step by step
`;
}
