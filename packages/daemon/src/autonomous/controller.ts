/**
 * Autonomous Controller
 *
 * Manages autonomous execution with intelligent completion detection,
 * safety guardrails, and progress tracking.
 */

import type {
  AutonomousConfig,
  AutonomousExecution,
  CompletionSignal,
  CompletionSignalType,
} from "./types";
import { EXPLICIT_EXIT_SIGNAL } from "./types";

/**
 * Result of checking whether execution should continue
 */
export interface ContinueResult {
  continue: boolean;
  reason?: string;
}

/**
 * Controller for managing autonomous execution loops
 */
export class AutonomousController {
  private config: AutonomousConfig;
  private startTime: number;
  private consecutiveErrors: number = 0;
  private completionSignals: CompletionSignal[] = [];
  private loopCount: number = 0;
  private toolCallCount: number = 0;
  private tokensUsed: number = 0;
  private estimatedCost: number = 0;
  private lastActivityTime: number;

  constructor(config: AutonomousConfig) {
    this.config = config;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
  }

  /**
   * Check if autonomous execution should continue
   */
  shouldContinue(): ContinueResult {
    // Check duration limit
    const durationMinutes = (Date.now() - this.startTime) / 60000;
    if (durationMinutes > this.config.maxDurationMinutes) {
      this.addCompletionSignal("timeout", "Max duration reached");
      return { continue: false, reason: "Max duration reached" };
    }

    // Check inactivity timeout
    const inactivityMinutes = (Date.now() - this.lastActivityTime) / 60000;
    if (inactivityMinutes > this.config.inactivityTimeoutMinutes) {
      this.addCompletionSignal("timeout", "Inactivity timeout");
      return { continue: false, reason: "Inactivity timeout" };
    }

    // Check loop limit
    if (this.loopCount >= this.config.maxLoops) {
      this.addCompletionSignal("limit_reached", "Max loops reached");
      return { continue: false, reason: "Max loops reached" };
    }

    // Check tool call limit
    if (this.toolCallCount >= this.config.maxToolCalls) {
      this.addCompletionSignal("limit_reached", "Max tool calls reached");
      return { continue: false, reason: "Max tool calls reached" };
    }

    // Check token limit
    if (this.tokensUsed >= this.config.maxTokens) {
      this.addCompletionSignal("limit_reached", "Max tokens reached");
      return { continue: false, reason: "Max tokens reached" };
    }

    // Check cost limit
    if (this.estimatedCost >= this.config.maxCostDollars) {
      this.addCompletionSignal("limit_reached", "Max cost reached");
      return { continue: false, reason: "Max cost reached" };
    }

    // Check consecutive errors
    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      this.addCompletionSignal("error", "Too many consecutive errors");
      return { continue: false, reason: "Too many consecutive errors" };
    }

    // Check for completion signals
    if (this.hasMetExitConditions()) {
      return { continue: false, reason: "Exit conditions met" };
    }

    return { continue: true };
  }

  /**
   * Check if exit conditions have been met based on configuration
   */
  hasMetExitConditions(): boolean {
    const hasExplicitSignal = this.completionSignals.some(
      (s) => s.type === "explicit",
    );

    // If explicit signal is required and not present, can't exit
    if (this.config.requireExplicitSignal && !hasExplicitSignal) {
      // Check if any natural completion indicator is present
      const hasPR = this.completionSignals.some((s) => s.type === "pr_created");
      const hasTests = this.completionSignals.some(
        (s) => s.type === "tests_passed",
      );
      const hasBuild = this.completionSignals.some(
        (s) => s.type === "build_success",
      );

      // Natural completion + explicit signal required
      if (
        (this.config.exitOnPRCreated && hasPR) ||
        (this.config.exitOnTestsPass && hasTests) ||
        (this.config.exitOnBuildSuccess && hasBuild)
      ) {
        // Has natural indicator but still needs explicit signal
        return false;
      }
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

    // Explicit signal alone is enough (if not requiring dual condition)
    return hasExplicitSignal;
  }

  /**
   * Add a completion signal
   */
  addCompletionSignal(type: CompletionSignalType, details?: string): void {
    // Avoid duplicate signals of the same type
    if (!this.completionSignals.some((s) => s.type === type)) {
      this.completionSignals.push({
        type,
        timestamp: Date.now(),
        details,
      });
    }
  }

  /**
   * Record an error during execution
   */
  recordError(): void {
    this.consecutiveErrors++;
    this.recordActivity();
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.consecutiveErrors = 0;
    this.recordActivity();
  }

  /**
   * Record activity to reset inactivity timeout
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Increment loop count
   */
  incrementLoop(): void {
    this.loopCount++;
    this.recordActivity();
  }

  /**
   * Increment tool call count
   */
  incrementToolCalls(count: number = 1): void {
    this.toolCallCount += count;
    this.recordActivity();
  }

  /**
   * Update token usage
   */
  updateTokens(tokens: number): void {
    this.tokensUsed += tokens;
    this.recordActivity();
  }

  /**
   * Update estimated cost
   */
  updateCost(cost: number): void {
    this.estimatedCost += cost;
    this.recordActivity();
  }

  /**
   * Check agent output for explicit exit signal
   */
  checkForExplicitSignal(output: string): boolean {
    if (output.includes(EXPLICIT_EXIT_SIGNAL)) {
      this.addCompletionSignal("explicit", "Agent signaled completion");
      return true;
    }
    return false;
  }

  /**
   * Check agent output for PR creation patterns
   */
  checkForPRCreated(output: string): boolean {
    const prPatterns = [
      /Created pull request #(\d+)/i,
      /Pull request.*created/i,
      /gh pr create.*succeeded/i,
      /Successfully created PR/i,
      /https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/i,
    ];

    for (const pattern of prPatterns) {
      const match = pattern.exec(output);
      if (match) {
        this.addCompletionSignal("pr_created", match[0]);
        return true;
      }
    }
    return false;
  }

  /**
   * Check agent output for test success patterns
   */
  checkForTestsPass(output: string): boolean {
    const testPatterns = [
      /All \d+ tests? passed/i,
      /Tests?:\s+\d+ passed.*0 failed/i,
      /✓.*\d+ tests? passed/i,
      /Test Suites:.*\d+ passed.*0 failed/i,
      /PASS.*\d+ tests?/i,
      /Tests passed: \d+/i,
      /All tests successful/i,
    ];

    for (const pattern of testPatterns) {
      const match = pattern.exec(output);
      if (match) {
        this.addCompletionSignal("tests_passed", match[0]);
        return true;
      }
    }
    return false;
  }

  /**
   * Check agent output for build success patterns
   */
  checkForBuildSuccess(output: string): boolean {
    const buildPatterns = [
      /Build succeeded/i,
      /Build completed successfully/i,
      /Compiled successfully/i,
      /Build: SUCCESS/i,
      /✓ Built in/i,
    ];

    for (const pattern of buildPatterns) {
      const match = pattern.exec(output);
      if (match) {
        this.addCompletionSignal("build_success", match[0]);
        return true;
      }
    }
    return false;
  }

  /**
   * Parse agent output for all completion signals
   */
  parseOutputForSignals(output: string): void {
    this.checkForExplicitSignal(output);
    if (this.config.exitOnPRCreated) {
      this.checkForPRCreated(output);
    }
    if (this.config.exitOnTestsPass) {
      this.checkForTestsPass(output);
    }
    if (this.config.exitOnBuildSuccess) {
      this.checkForBuildSuccess(output);
    }
  }

  /**
   * Get current execution metrics
   */
  getMetrics(): Omit<
    AutonomousExecution,
    "id" | "threadId" | "chatId" | "config"
  > {
    const now = new Date();
    return {
      status: this.hasMetExitConditions() ? "completed" : "running",
      startedAt: new Date(this.startTime),
      lastActivityAt: new Date(this.lastActivityTime),
      completedAt: this.hasMetExitConditions() ? now : undefined,
      loopCount: this.loopCount,
      toolCallCount: this.toolCallCount,
      tokensUsed: this.tokensUsed,
      estimatedCost: this.estimatedCost,
      completionSignals: [...this.completionSignals],
      exitReason: this.getExitReason(),
    };
  }

  /**
   * Get the exit reason if execution has ended
   */
  getExitReason(): string | undefined {
    const { continue: shouldContinue, reason } = this.shouldContinue();
    if (!shouldContinue) {
      return reason;
    }
    return undefined;
  }

  /**
   * Get all collected completion signals
   */
  getCompletionSignals(): CompletionSignal[] {
    return [...this.completionSignals];
  }

  /**
   * Get elapsed duration in minutes
   */
  getElapsedMinutes(): number {
    return (Date.now() - this.startTime) / 60000;
  }

  /**
   * Get remaining duration before timeout
   */
  getRemainingMinutes(): number {
    return Math.max(
      0,
      this.config.maxDurationMinutes - this.getElapsedMinutes(),
    );
  }

  /**
   * Check if user requested stop
   */
  handleUserStop(): void {
    this.addCompletionSignal("user_stop", "User requested stop");
  }

  /**
   * Get progress percentage based on limits
   */
  getProgressPercent(): number {
    const durationPercent =
      (this.getElapsedMinutes() / this.config.maxDurationMinutes) * 100;
    const loopPercent = (this.loopCount / this.config.maxLoops) * 100;
    const toolPercent = (this.toolCallCount / this.config.maxToolCalls) * 100;
    const tokenPercent = (this.tokensUsed / this.config.maxTokens) * 100;
    const costPercent = (this.estimatedCost / this.config.maxCostDollars) * 100;

    // Return the highest percentage (closest to limit)
    return Math.min(
      100,
      Math.max(
        durationPercent,
        loopPercent,
        toolPercent,
        tokenPercent,
        costPercent,
      ),
    );
  }
}
