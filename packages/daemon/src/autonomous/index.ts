/**
 * Autonomous Exit Detection Module
 *
 * Provides intelligent completion detection for background task execution.
 */

export { AutonomousController } from "./controller";
export type { ContinueResult } from "./controller";
export { EXPLICIT_EXIT_SIGNAL, defaultAutonomousConfig } from "./types";
export type {
  AutonomousConfig,
  AutonomousExecution,
  AutonomousExecutionStatus,
  CompletionSignal,
  CompletionSignalType,
} from "./types";
