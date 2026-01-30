/**
 * Autonomous Exit Detection Configuration and Types
 *
 * Enables truly autonomous background task execution with intelligent completion detection.
 * NOTE: These types are duplicated in @terragon/shared/model/autonomous.ts for use by
 * other packages. Changes here should be synchronized.
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
