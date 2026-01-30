# Phase 6: Autonomous Exit Detection

**Status**: Pending
**Priority**: 6
**Effort**: Medium

---

## Overview

Enable truly autonomous background task execution with intelligent completion detection:

1. Dual-condition exit detection (completion indicators + explicit signal)
2. Safety guardrails to prevent runaway execution
3. Automatic recovery from stuck states
4. Progress reporting for long-running tasks
5. Configurable autonomy levels

---

## How It Works

```
1. User creates task with "autonomous mode" enabled
2. Agent executes without requiring user confirmation
3. System monitors for completion signals:
   a. Explicit "TASK_COMPLETE" signal from agent
   b. Natural completion indicators (PR created, tests pass, etc.)
   c. No activity timeout
4. Safety guardrails:
   a. Maximum duration limits
   b. Maximum tool calls limit
   c. Cost/token limits
   d. Error threshold
5. Agent can loop and self-correct
6. Task ends when dual conditions met
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

```typescript
// Add autonomous execution tracking
export const autonomousExecutionTable = pgTable("autonomous_execution", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").references(() => threadTable.id),
  chatId: uuid("chat_id").references(() => threadChatTable.id),
  status: text("status").$type<"running" | "completed" | "failed" | "timeout" | "stopped">(),

  // Configuration
  config: jsonb("config").$type<AutonomousConfig>(),

  // Tracking
  startedAt: timestamp("started_at").defaultNow(),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  completedAt: timestamp("completed_at"),

  // Metrics
  loopCount: integer("loop_count").default(0),
  toolCallCount: integer("tool_call_count").default(0),
  tokensUsed: integer("tokens_used").default(0),
  estimatedCost: real("estimated_cost").default(0),

  // Completion signals
  completionSignals: jsonb("completion_signals").$type<CompletionSignal[]>(),
  exitReason: text("exit_reason"),
});

// Add to threadChatTable
autonomousMode: boolean("autonomous_mode").default(false),
autonomousExecutionId: uuid("autonomous_execution_id").references(() => autonomousExecutionTable.id),
```

### 2. Autonomous Configuration Types

```typescript
// packages/shared/src/model/autonomous.ts

export interface AutonomousConfig {
  // Limits
  maxDurationMinutes: number;
  maxLoops: number;
  maxToolCalls: number;
  maxTokens: number;
  maxCostDollars: number;

  // Timeouts
  inactivityTimeoutMinutes: number;
  singleLoopTimeoutMinutes: number;

  // Exit conditions
  requireExplicitSignal: boolean;
  exitOnPRCreated: boolean;
  exitOnTestsPass: boolean;
  exitOnBuildSuccess: boolean;

  // Recovery
  maxConsecutiveErrors: number;
  retryOnError: boolean;

  // Notifications
  notifyOnProgress: boolean;
  notifyOnCompletion: boolean;
  notifyOnError: boolean;
}

export const defaultAutonomousConfig: AutonomousConfig = {
  maxDurationMinutes: 60,
  maxLoops: 10,
  maxToolCalls: 200,
  maxTokens: 500000,
  maxCostDollars: 10,
  inactivityTimeoutMinutes: 5,
  singleLoopTimeoutMinutes: 15,
  requireExplicitSignal: true,
  exitOnPRCreated: true,
  exitOnTestsPass: true,
  exitOnBuildSuccess: false,
  maxConsecutiveErrors: 3,
  retryOnError: true,
  notifyOnProgress: true,
  notifyOnCompletion: true,
  notifyOnError: true,
};

export interface CompletionSignal {
  type:
    | "explicit"
    | "pr_created"
    | "tests_passed"
    | "build_success"
    | "user_stop"
    | "timeout"
    | "limit_reached";
  timestamp: number;
  details?: string;
}

export const EXPLICIT_EXIT_SIGNAL = "EXIT_AUTONOMOUS_MODE";
```

### 3. Autonomous Loop Controller (`packages/daemon/src/autonomous/controller.ts`)

```typescript
// packages/daemon/src/autonomous/controller.ts

export class AutonomousController {
  private config: AutonomousConfig;
  private execution: AutonomousExecution;
  private startTime: number;
  private consecutiveErrors: number = 0;
  private completionSignals: CompletionSignal[] = [];

  constructor(config: AutonomousConfig, execution: AutonomousExecution) {
    this.config = config;
    this.execution = execution;
    this.startTime = Date.now();
  }

  async shouldContinue(): Promise<{ continue: boolean; reason?: string }> {
    // Check duration limit
    const durationMinutes = (Date.now() - this.startTime) / 60000;
    if (durationMinutes > this.config.maxDurationMinutes) {
      return { continue: false, reason: "Max duration reached" };
    }

    // Check loop limit
    if (this.execution.loopCount >= this.config.maxLoops) {
      return { continue: false, reason: "Max loops reached" };
    }

    // Check tool call limit
    if (this.execution.toolCallCount >= this.config.maxToolCalls) {
      return { continue: false, reason: "Max tool calls reached" };
    }

    // Check token limit
    if (this.execution.tokensUsed >= this.config.maxTokens) {
      return { continue: false, reason: "Max tokens reached" };
    }

    // Check cost limit
    if (this.execution.estimatedCost >= this.config.maxCostDollars) {
      return { continue: false, reason: "Max cost reached" };
    }

    // Check consecutive errors
    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      return { continue: false, reason: "Too many consecutive errors" };
    }

    // Check for completion signals
    if (this.hasMetExitConditions()) {
      return { continue: false, reason: "Exit conditions met" };
    }

    return { continue: true };
  }

  hasMetExitConditions(): boolean {
    const hasExplicitSignal = this.completionSignals.some(
      (s) => s.type === "explicit",
    );

    if (this.config.requireExplicitSignal && !hasExplicitSignal) {
      return false;
    }

    // Check for natural completion indicators
    const hasPR = this.completionSignals.some((s) => s.type === "pr_created");
    const hasTests = this.completionSignals.some(
      (s) => s.type === "tests_passed",
    );
    const hasBuild = this.completionSignals.some(
      (s) => s.type === "build_success",
    );

    if (this.config.exitOnPRCreated && hasPR) return true;
    if (this.config.exitOnTestsPass && hasTests) return true;
    if (this.config.exitOnBuildSuccess && hasBuild) return true;

    // Explicit signal alone is enough
    return hasExplicitSignal;
  }

  addCompletionSignal(signal: CompletionSignal): void {
    this.completionSignals.push(signal);
  }

  recordError(): void {
    this.consecutiveErrors++;
  }

  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  async checkForExplicitSignal(output: string): Promise<boolean> {
    if (output.includes(EXPLICIT_EXIT_SIGNAL)) {
      this.addCompletionSignal({
        type: "explicit",
        timestamp: Date.now(),
        details: "Agent signaled completion",
      });
      return true;
    }
    return false;
  }

  async checkForPRCreated(output: string): Promise<boolean> {
    // Check for GitHub PR creation patterns
    const prPatterns = [
      /Created pull request #(\d+)/i,
      /Pull request.*created/i,
      /gh pr create.*succeeded/i,
    ];

    for (const pattern of prPatterns) {
      if (pattern.test(output)) {
        this.addCompletionSignal({
          type: "pr_created",
          timestamp: Date.now(),
          details: output.match(pattern)?.[0],
        });
        return true;
      }
    }
    return false;
  }

  async checkForTestsPass(output: string): Promise<boolean> {
    // Check for test success patterns
    const testPatterns = [
      /All \d+ tests? passed/i,
      /Tests?:\s+\d+ passed/i,
      /✓.*\d+ tests? passed/i,
      /Test Suites:.*\d+ passed.*0 failed/i,
    ];

    for (const pattern of testPatterns) {
      if (pattern.test(output)) {
        this.addCompletionSignal({
          type: "tests_passed",
          timestamp: Date.now(),
          details: output.match(pattern)?.[0],
        });
        return true;
      }
    }
    return false;
  }
}
```

### 4. Daemon Integration

```typescript
// packages/daemon/src/daemon.ts - Modify main loop

async function runAutonomousLoop(
  threadId: string,
  chatId: string,
  config: AutonomousConfig,
): Promise<void> {
  const execution = await createAutonomousExecution(threadId, chatId, config);
  const controller = new AutonomousController(config, execution);

  while (true) {
    const { continue: shouldContinue, reason } =
      await controller.shouldContinue();

    if (!shouldContinue) {
      await completeAutonomousExecution(execution.id, reason);
      break;
    }

    try {
      // Run one iteration of agent
      const output = await runAgentIteration(threadId);

      // Check for completion signals
      await controller.checkForExplicitSignal(output);
      await controller.checkForPRCreated(output);
      await controller.checkForTestsPass(output);

      // Update metrics
      await updateExecutionMetrics(execution.id, {
        loopCount: execution.loopCount + 1,
        lastActivityAt: new Date(),
      });

      controller.recordSuccess();

      // Check if complete
      if (controller.hasMetExitConditions()) {
        await completeAutonomousExecution(execution.id, "Exit conditions met");
        break;
      }

      // Brief pause between loops
      await sleep(1000);
    } catch (error) {
      controller.recordError();

      if (config.retryOnError) {
        // Send error to agent for self-correction
        await sendErrorToAgent(threadId, error);
        continue;
      } else {
        await failAutonomousExecution(execution.id, error.message);
        break;
      }
    }
  }
}
```

### 5. Agent Instructions for Autonomous Mode

```typescript
const autonomousInstructions = `
## AUTONOMOUS MODE ACTIVE

You are running in autonomous mode. You can loop and self-correct without user intervention.

### Important Rules:

1. **Work Continuously**: Complete the task step by step
2. **Self-Correct**: If you encounter an error, try to fix it
3. **Signal Completion**: When the task is fully complete, output:
   \`\`\`
   ${EXPLICIT_EXIT_SIGNAL}
   Task completed successfully: [brief summary]
   \`\`\`

4. **Report Progress**: Regularly output progress updates
5. **Don't Ask Questions**: Make reasonable decisions autonomously

### Automatic Exit Triggers:
- PR successfully created
- All tests pass
- You output the exit signal

### Safety Limits:
- Maximum duration: ${config.maxDurationMinutes} minutes
- Maximum loops: ${config.maxLoops}
- Maximum tool calls: ${config.maxToolCalls}

If you get stuck, try a different approach. If you cannot proceed, output the exit signal with an explanation.
`;
```

### 6. Autonomous Mode UI Controls

```typescript
// apps/www/src/components/chat/autonomous-controls.tsx

export function AutonomousControls({ thread, chat }: Props) {
  const [config, setConfig] = useState<AutonomousConfig>(defaultAutonomousConfig);
  const execution = useAutonomousExecution(chat.autonomousExecutionId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Autonomous Mode
          </CardTitle>
          <Switch
            checked={chat.autonomousMode}
            onCheckedChange={handleToggleAutonomous}
          />
        </div>
      </CardHeader>

      {chat.autonomousMode && execution && (
        <CardContent>
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span>Status</span>
              <Badge variant={
                execution.status === "running" ? "default" :
                execution.status === "completed" ? "success" :
                "destructive"
              }>
                {execution.status}
              </Badge>
            </div>

            {/* Progress */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Loops: {execution.loopCount}/{config.maxLoops}</div>
              <div>Tools: {execution.toolCallCount}/{config.maxToolCalls}</div>
              <div>Tokens: {execution.tokensUsed.toLocaleString()}</div>
              <div>Cost: ${execution.estimatedCost.toFixed(2)}</div>
            </div>

            {/* Duration */}
            <Progress
              value={(Date.now() - new Date(execution.startedAt).getTime()) / (config.maxDurationMinutes * 60000) * 100}
              label={`Running for ${formatDuration(execution.startedAt)}`}
            />

            {/* Completion Signals */}
            {execution.completionSignals.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">Completion Signals</h4>
                <ul className="text-xs space-y-1">
                  {execution.completionSignals.map((signal, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      {signal.type}: {signal.details}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stop Button */}
            {execution.status === "running" && (
              <Button variant="destructive" onClick={handleStopAutonomous}>
                <StopCircle className="h-4 w-4 mr-2" />
                Stop Autonomous Execution
              </Button>
            )}
          </div>
        </CardContent>
      )}

      {/* Configuration Panel */}
      {!execution && (
        <CardContent>
          <AutonomousConfigPanel config={config} onChange={setConfig} />
        </CardContent>
      )}
    </Card>
  );
}
```

### 7. Notifications for Autonomous Events

```typescript
// packages/shared/src/model/notifications.ts

export async function notifyAutonomousEvent(
  userId: string,
  event: "progress" | "completion" | "error" | "warning",
  details: {
    threadId: string;
    message: string;
    metrics?: Partial<AutonomousExecution>;
  },
): Promise<void> {
  // Send to connected PartySocket clients
  await broadcastToUser(userId, {
    type: "autonomous_event",
    event,
    ...details,
  });

  // Send push notification if enabled
  if (event === "completion" || event === "error") {
    await sendPushNotification(userId, {
      title: `Task ${event === "completion" ? "Completed" : "Failed"}`,
      body: details.message,
      url: `/thread/${details.threadId}`,
    });
  }
}
```

---

## Testing Strategy

```typescript
describe("Autonomous Exit Detection", () => {
  it("detects explicit exit signal", async () => {
    const controller = new AutonomousController(defaultConfig, mockExecution);
    await controller.checkForExplicitSignal(
      `Done!\n${EXPLICIT_EXIT_SIGNAL}\nTask complete.`,
    );
    expect(controller.hasMetExitConditions()).toBe(true);
  });

  it("detects PR creation", async () => {
    const controller = new AutonomousController(
      { ...defaultConfig, exitOnPRCreated: true },
      mockExecution,
    );
    await controller.checkForPRCreated("Created pull request #42");
    expect(controller.hasMetExitConditions()).toBe(true);
  });

  it("respects dual-condition requirement", async () => {
    const controller = new AutonomousController(
      { ...defaultConfig, requireExplicitSignal: true },
      mockExecution,
    );
    await controller.checkForPRCreated("Created PR");
    expect(controller.hasMetExitConditions()).toBe(false);

    await controller.checkForExplicitSignal(EXPLICIT_EXIT_SIGNAL);
    expect(controller.hasMetExitConditions()).toBe(true);
  });

  it("stops on max loops", async () => {
    const execution = { ...mockExecution, loopCount: 10 };
    const controller = new AutonomousController(
      { ...defaultConfig, maxLoops: 10 },
      execution,
    );
    const { continue: shouldContinue } = await controller.shouldContinue();
    expect(shouldContinue).toBe(false);
  });

  it("handles consecutive errors", async () => {
    const controller = new AutonomousController(
      { ...defaultConfig, maxConsecutiveErrors: 3 },
      mockExecution,
    );
    controller.recordError();
    controller.recordError();
    controller.recordError();
    const { continue: shouldContinue } = await controller.shouldContinue();
    expect(shouldContinue).toBe(false);
  });
});
```

---

## Security Considerations

- Hard limits on duration, cost, and tool calls
- Kill switch in UI for immediate stop
- Admin override for runaway tasks
- Rate limiting on autonomous task creation
- Audit logging of all autonomous executions
