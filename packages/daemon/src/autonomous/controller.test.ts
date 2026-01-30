import { describe, it, expect, beforeEach } from "vitest";
import { AutonomousController } from "./controller";
import { defaultAutonomousConfig, EXPLICIT_EXIT_SIGNAL } from "./types";
import type { AutonomousConfig } from "./types";

describe("AutonomousController", () => {
  let controller: AutonomousController;
  let config: AutonomousConfig;

  beforeEach(() => {
    config = { ...defaultAutonomousConfig };
    controller = new AutonomousController(config);
  });

  describe("shouldContinue", () => {
    it("returns true when no limits reached", () => {
      const result = controller.shouldContinue();
      expect(result.continue).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("stops when max loops reached", () => {
      config.maxLoops = 5;
      controller = new AutonomousController(config);

      for (let i = 0; i < 5; i++) {
        controller.incrementLoop();
      }

      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("Max loops reached");
    });

    it("stops when max tool calls reached", () => {
      config.maxToolCalls = 10;
      controller = new AutonomousController(config);

      controller.incrementToolCalls(10);

      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("Max tool calls reached");
    });

    it("stops when max tokens reached", () => {
      config.maxTokens = 1000;
      controller = new AutonomousController(config);

      controller.updateTokens(1000);

      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("Max tokens reached");
    });

    it("stops when max cost reached", () => {
      config.maxCostDollars = 5;
      controller = new AutonomousController(config);

      controller.updateCost(5);

      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("Max cost reached");
    });

    it("stops when consecutive errors exceed limit", () => {
      config.maxConsecutiveErrors = 3;
      controller = new AutonomousController(config);

      controller.recordError();
      controller.recordError();
      controller.recordError();

      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("Too many consecutive errors");
    });

    it("resets consecutive errors on success", () => {
      config.maxConsecutiveErrors = 3;
      controller = new AutonomousController(config);

      controller.recordError();
      controller.recordError();
      controller.recordSuccess();
      controller.recordError();

      const result = controller.shouldContinue();
      expect(result.continue).toBe(true);
    });
  });

  describe("checkForExplicitSignal", () => {
    it("detects explicit exit signal", () => {
      const output = `Done!\n${EXPLICIT_EXIT_SIGNAL}\nTask complete.`;
      const found = controller.checkForExplicitSignal(output);

      expect(found).toBe(true);
      expect(controller.getCompletionSignals()).toContainEqual(
        expect.objectContaining({
          type: "explicit",
          details: "Agent signaled completion",
        }),
      );
    });

    it("returns false when no signal present", () => {
      const output = "Just regular output here";
      const found = controller.checkForExplicitSignal(output);

      expect(found).toBe(false);
      expect(controller.getCompletionSignals()).toHaveLength(0);
    });
  });

  describe("checkForPRCreated", () => {
    it("detects PR creation pattern", () => {
      const output = "Created pull request #42";
      const found = controller.checkForPRCreated(output);

      expect(found).toBe(true);
      expect(controller.getCompletionSignals()).toContainEqual(
        expect.objectContaining({
          type: "pr_created",
        }),
      );
    });

    it("detects GitHub PR URL", () => {
      const output = "PR available at https://github.com/user/repo/pull/123";
      const found = controller.checkForPRCreated(output);

      expect(found).toBe(true);
    });

    it("returns false when no PR pattern present", () => {
      const output = "Just regular output";
      const found = controller.checkForPRCreated(output);

      expect(found).toBe(false);
    });
  });

  describe("checkForTestsPass", () => {
    it("detects test success pattern", () => {
      const output = "All 15 tests passed";
      const found = controller.checkForTestsPass(output);

      expect(found).toBe(true);
      expect(controller.getCompletionSignals()).toContainEqual(
        expect.objectContaining({
          type: "tests_passed",
        }),
      );
    });

    it("detects vitest/jest pattern", () => {
      const output = "Tests: 10 passed, 0 failed";
      const found = controller.checkForTestsPass(output);

      expect(found).toBe(true);
    });

    it("returns false when tests failed", () => {
      const output = "Tests: 8 passed, 2 failed";
      const found = controller.checkForTestsPass(output);

      expect(found).toBe(false);
    });
  });

  describe("checkForBuildSuccess", () => {
    it("detects build success pattern", () => {
      const output = "Build succeeded";
      const found = controller.checkForBuildSuccess(output);

      expect(found).toBe(true);
    });

    it("detects compiled successfully pattern", () => {
      const output = "Compiled successfully in 2.3s";
      const found = controller.checkForBuildSuccess(output);

      expect(found).toBe(true);
    });
  });

  describe("hasMetExitConditions", () => {
    it("returns true when explicit signal and requireExplicitSignal is true", () => {
      config.requireExplicitSignal = true;
      controller = new AutonomousController(config);

      controller.checkForExplicitSignal(EXPLICIT_EXIT_SIGNAL);

      expect(controller.hasMetExitConditions()).toBe(true);
    });

    it("returns false when PR created but explicit signal required", () => {
      config.requireExplicitSignal = true;
      config.exitOnPRCreated = true;
      controller = new AutonomousController(config);

      controller.checkForPRCreated("Created pull request #42");

      expect(controller.hasMetExitConditions()).toBe(false);
    });

    it("returns true when PR created and explicit not required", () => {
      config.requireExplicitSignal = false;
      config.exitOnPRCreated = true;
      controller = new AutonomousController(config);

      controller.checkForPRCreated("Created pull request #42");

      expect(controller.hasMetExitConditions()).toBe(true);
    });

    it("returns true when tests pass and exitOnTestsPass is true", () => {
      config.requireExplicitSignal = false;
      config.exitOnTestsPass = true;
      controller = new AutonomousController(config);

      controller.checkForTestsPass("All 10 tests passed");

      expect(controller.hasMetExitConditions()).toBe(true);
    });
  });

  describe("handleUserStop", () => {
    it("adds user_stop completion signal", () => {
      controller.handleUserStop();

      expect(controller.getCompletionSignals()).toContainEqual(
        expect.objectContaining({
          type: "user_stop",
          details: "User requested stop",
        }),
      );
    });
  });

  describe("getMetrics", () => {
    it("returns current execution metrics", () => {
      controller.incrementLoop();
      controller.incrementLoop();
      controller.incrementToolCalls(5);
      controller.updateTokens(1000);
      controller.updateCost(0.5);

      const metrics = controller.getMetrics();

      expect(metrics.loopCount).toBe(2);
      expect(metrics.toolCallCount).toBe(5);
      expect(metrics.tokensUsed).toBe(1000);
      expect(metrics.estimatedCost).toBe(0.5);
      expect(metrics.status).toBe("running");
    });

    it("returns completed status when exit conditions met", () => {
      config.requireExplicitSignal = false;
      config.exitOnTestsPass = true;
      controller = new AutonomousController(config);

      controller.checkForTestsPass("All 10 tests passed");
      const metrics = controller.getMetrics();

      expect(metrics.status).toBe("completed");
    });
  });

  describe("getProgressPercent", () => {
    it("returns highest percentage of any limit", () => {
      config.maxLoops = 10;
      config.maxToolCalls = 100;
      controller = new AutonomousController(config);

      controller.incrementLoop();
      controller.incrementLoop();
      controller.incrementLoop(); // 30% of loops

      const progress = controller.getProgressPercent();
      expect(progress).toBeGreaterThanOrEqual(30);
    });
  });

  describe("parseOutputForSignals", () => {
    it("parses multiple signals from output", () => {
      config.requireExplicitSignal = false;
      config.exitOnPRCreated = true;
      config.exitOnTestsPass = true;
      controller = new AutonomousController(config);

      const output = `
        Running tests...
        All 15 tests passed
        Creating PR...
        Created pull request #42
        ${EXPLICIT_EXIT_SIGNAL}
        Done!
      `;

      controller.parseOutputForSignals(output);
      const signals = controller.getCompletionSignals();

      expect(signals).toHaveLength(3);
      expect(signals.map((s) => s.type)).toContain("tests_passed");
      expect(signals.map((s) => s.type)).toContain("pr_created");
      expect(signals.map((s) => s.type)).toContain("explicit");
    });
  });
});
