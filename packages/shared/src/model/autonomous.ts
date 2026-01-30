/**
 * Autonomous Exit Detection Configuration and Types
 *
 * Enables truly autonomous background task execution with intelligent completion detection.
 */

/**
 * Configuration for autonomous execution mode
 */
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

/**
 * Default autonomous configuration with sensible limits
 */
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

/**
 * Types of completion signals that can trigger exit
 */
export type CompletionSignalType =
  | "explicit"
  | "pr_created"
  | "tests_passed"
  | "build_success"
  | "user_stop"
  | "timeout"
  | "limit_reached"
  | "error";

/**
 * Represents a completion signal detected during autonomous execution
 */
export interface CompletionSignal {
  type: CompletionSignalType;
  timestamp: number;
  details?: string;
}

/**
 * Status of autonomous execution
 */
export type AutonomousExecutionStatus =
  | "running"
  | "completed"
  | "failed"
  | "timeout"
  | "stopped";

/**
 * Autonomous execution tracking record
 */
export interface AutonomousExecution {
  id: string;
  threadId: string;
  chatId?: string;
  status: AutonomousExecutionStatus;
  config: AutonomousConfig;
  startedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;
  loopCount: number;
  toolCallCount: number;
  tokensUsed: number;
  estimatedCost: number;
  completionSignals: CompletionSignal[];
  exitReason?: string;
}

/**
 * The explicit signal string that agents should output to signal completion
 */
export const EXPLICIT_EXIT_SIGNAL = "EXIT_AUTONOMOUS_MODE";

/**
 * Autonomous mode event types for notifications
 */
export type AutonomousEventType =
  | "progress"
  | "completion"
  | "error"
  | "warning";

/**
 * Details for autonomous event notifications
 */
export interface AutonomousEventDetails {
  threadId: string;
  chatId?: string;
  message: string;
  metrics?: Partial<AutonomousExecution>;
}

/**
 * Instructions appended to agent prompts when in autonomous mode
 */
export function getAutonomousModeInstructions(
  config: AutonomousConfig,
): string {
  return `
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
${config.exitOnPRCreated ? "- PR successfully created\n" : ""}${config.exitOnTestsPass ? "- All tests pass\n" : ""}${config.exitOnBuildSuccess ? "- Build succeeds\n" : ""}- You output the exit signal

### Safety Limits:
- Maximum duration: ${config.maxDurationMinutes} minutes
- Maximum loops: ${config.maxLoops}
- Maximum tool calls: ${config.maxToolCalls}
- Maximum cost: $${config.maxCostDollars}

If you get stuck, try a different approach. If you cannot proceed, output the exit signal with an explanation.
`;
}

/**
 * Validate autonomous configuration
 */
export function validateAutonomousConfig(
  config: Partial<AutonomousConfig>,
): AutonomousConfig {
  const defaults = defaultAutonomousConfig;

  return {
    maxDurationMinutes: Math.max(
      1,
      Math.min(config.maxDurationMinutes ?? defaults.maxDurationMinutes, 480),
    ),
    maxLoops: Math.max(1, Math.min(config.maxLoops ?? defaults.maxLoops, 100)),
    maxToolCalls: Math.max(
      10,
      Math.min(config.maxToolCalls ?? defaults.maxToolCalls, 1000),
    ),
    maxTokens: Math.max(
      10000,
      Math.min(config.maxTokens ?? defaults.maxTokens, 2000000),
    ),
    maxCostDollars: Math.max(
      0.1,
      Math.min(config.maxCostDollars ?? defaults.maxCostDollars, 100),
    ),
    inactivityTimeoutMinutes: Math.max(
      1,
      Math.min(
        config.inactivityTimeoutMinutes ?? defaults.inactivityTimeoutMinutes,
        60,
      ),
    ),
    singleLoopTimeoutMinutes: Math.max(
      1,
      Math.min(
        config.singleLoopTimeoutMinutes ?? defaults.singleLoopTimeoutMinutes,
        60,
      ),
    ),
    requireExplicitSignal:
      config.requireExplicitSignal ?? defaults.requireExplicitSignal,
    exitOnPRCreated: config.exitOnPRCreated ?? defaults.exitOnPRCreated,
    exitOnTestsPass: config.exitOnTestsPass ?? defaults.exitOnTestsPass,
    exitOnBuildSuccess:
      config.exitOnBuildSuccess ?? defaults.exitOnBuildSuccess,
    maxConsecutiveErrors: Math.max(
      1,
      Math.min(
        config.maxConsecutiveErrors ?? defaults.maxConsecutiveErrors,
        10,
      ),
    ),
    retryOnError: config.retryOnError ?? defaults.retryOnError,
    notifyOnProgress: config.notifyOnProgress ?? defaults.notifyOnProgress,
    notifyOnCompletion:
      config.notifyOnCompletion ?? defaults.notifyOnCompletion,
    notifyOnError: config.notifyOnError ?? defaults.notifyOnError,
  };
}
