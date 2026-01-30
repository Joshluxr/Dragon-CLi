# Phase 3: Plan and Act Modes

**Status**: Pending
**Priority**: 3
**Effort**: Medium

---

## Overview

Separate the agent workflow into two distinct phases:

1. **Plan Mode**: Research, analyze, and propose a step-by-step approach
2. **Act Mode**: Execute the approved plan with real file changes

Users can review, discuss, and modify the plan before any code is written.

---

## How It Works

```
1. User creates task
2. Agent enters Plan Mode (default for complex tasks)
3. Agent researches codebase, analyzes requirements
4. Agent presents structured plan with phases/steps
5. User reviews and either:
   a. Approves → Agent enters Act Mode
   b. Modifies → Agent revises plan
   c. Rejects → Task ends or restarts
6. In Act Mode, agent executes each step
7. Progress tracked against plan steps
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

```typescript
// New table for execution plans
export const executionPlanTable = pgTable("execution_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").references(() => threadTable.id),
  chatId: uuid("chat_id").references(() => threadChatTable.id),
  version: integer("version").default(1),
  status: text("status").$type<"draft" | "pending_approval" | "approved" | "rejected" | "in_progress" | "completed">(),
  title: text("title").notNull(),
  summary: text("summary"),
  phases: jsonb("phases").$type<PlanPhase[]>(),
  estimatedSteps: integer("estimated_steps"),
  currentPhase: integer("current_phase").default(0),
  currentStep: integer("current_step").default(0),
  approvedBy: uuid("approved_by").references(() => userTable.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Add to threadChatTable
mode: text("mode").$type<"plan" | "act" | "auto">().default("auto"),
planId: uuid("plan_id").references(() => executionPlanTable.id),
```

### 2. Plan Phase Types

```typescript
// packages/shared/src/model/execution-plan.ts
export interface PlanPhase {
  id: string;
  name: string;
  description: string;
  steps: PlanStep[];
  status: "pending" | "in_progress" | "completed" | "skipped";
  dependencies?: string[]; // Phase IDs this depends on
}

export interface PlanStep {
  id: string;
  action: string;
  description: string;
  files?: string[]; // Files that will be modified
  commands?: string[]; // Commands that will be run
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  output?: string;
  error?: string;
}

export interface PlanApprovalRequest {
  planId: string;
  decision: "approve" | "reject" | "modify";
  modifications?: {
    phaseId?: string;
    stepId?: string;
    change: string;
  }[];
  comment?: string;
}
```

### 3. Mode Detection in Daemon (`packages/daemon/src/daemon.ts`)

```typescript
// Modify spawnClaudeProcess to inject mode instructions

function buildModeInstructions(
  mode: "plan" | "act" | "auto",
  plan?: ExecutionPlan,
): string {
  if (mode === "plan") {
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
      "steps": [
        {
          "id": "step-1-1",
          "action": "modify_file",
          "description": "Add validation to user input handler",
          "files": ["src/handlers/user.ts"],
          "commands": []
        }
      ]
    }
  ]
}
\`\`\`

After outputting the plan, wait for user approval before proceeding.
`;
  }

  if (mode === "act" && plan) {
    return `
## MODE: EXECUTION

You are in ACT MODE. Execute the approved plan below.

### Approved Plan: ${plan.title}

${plan.phases
  .map(
    (phase, i) => `
#### Phase ${i + 1}: ${phase.name}
${phase.steps
  .map(
    (step, j) => `
${j + 1}. ${step.description}
   - Files: ${step.files?.join(", ") || "N/A"}
   - Commands: ${step.commands?.join(", ") || "N/A"}
`,
  )
  .join("")}
`,
  )
  .join("")}

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

  // Auto mode - let agent decide
  return `
## MODE: AUTO

You may plan and execute as you see fit. For complex tasks, consider:
1. Creating a brief plan first
2. Getting confirmation on approach
3. Executing step by step
`;
}
```

### 4. Plan Detection in Daemon Event Handler

````typescript
// apps/www/src/server-lib/handle-daemon-event.ts

// Add plan detection to message processing
for (const message of messages) {
  if (message.type === "assistant") {
    // Check for execution plan in response
    const planMatch = message.content.match(
      /```json\s*(\{[\s\S]*?"type":\s*"execution_plan"[\s\S]*?\})\s*```/,
    );
    if (planMatch) {
      const planData = JSON.parse(planMatch[1]);
      await createExecutionPlan(threadChat.id, planData);
      await transitionToPlanApproval(threadChat.id);
    }

    // Check for step completion
    const stepMatch = message.content.match(
      /```json\s*(\{[\s\S]*?"type":\s*"step_complete"[\s\S]*?\})\s*```/,
    );
    if (stepMatch) {
      const stepData = JSON.parse(stepMatch[1]);
      await updatePlanProgress(threadChat.planId, stepData);
    }
  }
}
````

### 5. Plan Approval Server Action

```typescript
// apps/www/src/server-actions/plan-approval.ts

export const approvePlan = userOnlyAction(async function approvePlan(
  userId: string,
  request: PlanApprovalRequest,
) {
  const plan = await db.query.executionPlanTable.findFirst({
    where: eq(executionPlanTable.id, request.planId),
  });

  if (!plan) throw new Error("Plan not found");

  // Verify user owns the thread
  const thread = await getThreadById(plan.threadId);
  if (thread.userId !== userId) throw new Error("Unauthorized");

  if (request.decision === "approve") {
    await db
      .update(executionPlanTable)
      .set({
        status: "approved",
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(eq(executionPlanTable.id, plan.id));

    // Transition chat to Act mode
    await db
      .update(threadChatTable)
      .set({ mode: "act" })
      .where(eq(threadChatTable.planId, plan.id));

    // Resume agent with Act mode instructions
    await resumeWithActMode(plan);
  } else if (request.decision === "modify") {
    // Apply modifications to plan
    const updatedPhases = applyModifications(
      plan.phases,
      request.modifications,
    );

    await db
      .update(executionPlanTable)
      .set({
        phases: updatedPhases,
        version: plan.version + 1,
        status: "pending_approval",
      })
      .where(eq(executionPlanTable.id, plan.id));
  } else if (request.decision === "reject") {
    await db
      .update(executionPlanTable)
      .set({ status: "rejected" })
      .where(eq(executionPlanTable.id, plan.id));

    // Optionally restart with different approach
    if (request.comment) {
      await sendFeedbackToAgent(plan.threadId, request.comment);
    }
  }

  return { success: true };
});
```

### 6. Plan Visualization Component

```typescript
// apps/www/src/components/chat/plan-viewer.tsx

export function PlanViewer({ plan, onApprove, onModify, onReject }: Props) {
  const [selectedStep, setSelectedStep] = useState<string | null>(null);

  return (
    <Card className="border-2 border-blue-500">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <Badge variant="outline">📋 Execution Plan v{plan.version}</Badge>
            <CardTitle className="mt-2">{plan.title}</CardTitle>
          </div>
          <PlanStatusBadge status={plan.status} />
        </div>
        <CardDescription>{plan.summary}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          {plan.phases.map((phase, phaseIndex) => (
            <div key={phase.id} className="border-l-2 border-gray-200 pl-4">
              <div className="flex items-center gap-2">
                <PhaseStatusIcon status={phase.status} />
                <h4 className="font-semibold">
                  Phase {phaseIndex + 1}: {phase.name}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {phase.description}
              </p>

              <ul className="space-y-2">
                {phase.steps.map((step, stepIndex) => (
                  <li
                    key={step.id}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-muted",
                      selectedStep === step.id && "bg-muted"
                    )}
                    onClick={() => setSelectedStep(step.id)}
                  >
                    <StepStatusIcon status={step.status} />
                    <div className="flex-1">
                      <span className="text-sm">{step.description}</span>
                      {step.files && step.files.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          📁 {step.files.join(", ")}
                        </div>
                      )}
                    </div>
                    {step.status === "completed" && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>

      {plan.status === "pending_approval" && (
        <CardFooter className="flex gap-2">
          <Button onClick={onApprove} className="flex-1">
            ✅ Approve & Execute
          </Button>
          <Button variant="outline" onClick={onModify}>
            ✏️ Modify
          </Button>
          <Button variant="destructive" onClick={onReject}>
            ❌ Reject
          </Button>
        </CardFooter>
      )}

      {plan.status === "in_progress" && (
        <CardFooter>
          <div className="w-full">
            <Progress
              value={(plan.currentStep / plan.estimatedSteps) * 100}
            />
            <p className="text-sm text-center mt-2">
              Step {plan.currentStep} of {plan.estimatedSteps}
            </p>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
```

### 7. Mode Toggle in Chat UI

```typescript
// apps/www/src/components/chat/mode-toggle.tsx

export function ModeToggle({ chat, onModeChange }: Props) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Mode:</span>
      <ToggleGroup
        type="single"
        value={chat.mode}
        onValueChange={onModeChange}
      >
        <ToggleGroupItem value="auto" title="Agent decides">
          🤖 Auto
        </ToggleGroupItem>
        <ToggleGroupItem value="plan" title="Plan before acting">
          📋 Plan First
        </ToggleGroupItem>
        <ToggleGroupItem value="act" title="Execute directly">
          ⚡ Act Now
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
```

### 8. Environment Default Mode Setting

```typescript
// Add to environmentTable
defaultMode: text("default_mode").$type<"plan" | "act" | "auto">().default("auto"),
planModeThreshold: integer("plan_mode_threshold").default(100), // Auto-plan if >100 files
```

---

## Testing Strategy

### Unit Tests

```typescript
describe("Plan and Act Modes", () => {
  it("parses execution plan from agent output", () => {
    const output = `Here's my plan:\n\`\`\`json\n{"type":"execution_plan"...}\n\`\`\``;
    const plan = extractPlan(output);
    expect(plan).toBeDefined();
    expect(plan.phases.length).toBeGreaterThan(0);
  });

  it("transitions to approval state after plan created", async () => {
    const chat = await createChatWithPlan();
    expect(chat.mode).toBe("plan");
    expect(chat.status).toBe("awaiting_approval");
  });

  it("resumes with act mode after approval", async () => {
    const plan = await createAndApprovePlan();
    expect(plan.status).toBe("approved");

    const chat = await db.query.threadChatTable.findFirst({
      where: eq(threadChatTable.planId, plan.id),
    });
    expect(chat.mode).toBe("act");
  });

  it("tracks step progress correctly", async () => {
    const plan = await createApprovedPlan();
    await updatePlanProgress(plan.id, {
      type: "step_complete",
      phaseId: "phase-1",
      stepId: "step-1-1",
    });

    const updated = await db.query.executionPlanTable.findFirst({
      where: eq(executionPlanTable.id, plan.id),
    });
    expect(updated.currentStep).toBe(1);
  });
});
```

### Integration Tests

- Full flow: task → plan → approval → execution → completion
- Plan modification and re-approval
- Rejection and restart with feedback

---

## UI/UX Considerations

1. **Visual Distinction**: Plan mode has distinct visual styling (blue borders)
2. **Progress Tracking**: Real-time step completion updates
3. **Inline Editing**: Users can edit plan steps before approval
4. **History**: All plan versions are preserved
5. **Quick Actions**: One-click approve/reject buttons
