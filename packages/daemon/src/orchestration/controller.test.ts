import { describe, it, expect, beforeEach, vi } from "vitest";
import { OrchestrationController } from "./controller";
import type { OrchestrationSession, OrchestrationAgent } from "./types";
import {
  defaultOrchestrationConfig,
  AGENT_TASK_COMPLETE_SIGNAL,
} from "./types";

describe("OrchestrationController", () => {
  let controller: OrchestrationController;
  let session: OrchestrationSession;
  let agents: OrchestrationAgent[];

  const createSession = (
    overrides: Partial<OrchestrationSession> = {},
  ): OrchestrationSession => ({
    id: "session-1",
    parentThreadId: "thread-1",
    userId: "user-1",
    mode: "parallel",
    status: "running",
    config: { ...defaultOrchestrationConfig },
    taskDecomposition: {
      originalTask: "Test task",
      subtasks: [],
      dependencies: { nodes: [], edges: [] },
    },
    createdAt: new Date(),
    ...overrides,
  });

  const createAgent = (
    overrides: Partial<OrchestrationAgent> = {},
  ): OrchestrationAgent => ({
    id: "agent-1",
    sessionId: "session-1",
    role: "backend",
    task: "Implement backend",
    ownedFiles: ["src/api/handler.ts"],
    dependencies: [],
    status: "pending",
    ...overrides,
  });

  beforeEach(() => {
    session = createSession();
    agents = [
      createAgent({ id: "agent-1", role: "backend" }),
      createAgent({
        id: "agent-2",
        role: "frontend",
        ownedFiles: ["src/ui/component.tsx"],
      }),
      createAgent({
        id: "agent-3",
        role: "tests",
        dependencies: ["agent-1", "agent-2"],
        ownedFiles: ["tests/api.test.ts"],
      }),
    ];
    controller = new OrchestrationController(session, agents);
  });

  describe("shouldContinue", () => {
    it("returns true when agents are pending", () => {
      const result = controller.shouldContinue();
      expect(result.continue).toBe(true);
    });

    it("returns false when all agents are completed", () => {
      for (const agent of agents) {
        controller.updateAgentStatus(agent.id, "completed");
      }
      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("All agents completed");
    });

    it("returns false when session times out", () => {
      session.config.sessionTimeoutMinutes = 0;
      controller = new OrchestrationController(session, agents);

      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("Session timeout reached");
    });

    it("returns false when agent fails and requireAllSuccess is true", () => {
      session.config.requireAllSuccess = true;
      controller = new OrchestrationController(session, agents);

      controller.updateAgentStatus("agent-1", "completed");
      controller.updateAgentStatus("agent-2", "failed");
      controller.updateAgentStatus("agent-3", "blocked");

      const result = controller.shouldContinue();
      expect(result.continue).toBe(false);
      expect(result.reason).toBe("Agent failed and requireAllSuccess is true");
    });
  });

  describe("getRunnableAgents", () => {
    it("returns agents with no dependencies", () => {
      const runnable = controller.getRunnableAgents();
      expect(runnable.length).toBe(2);
      expect(runnable.map((a) => a.id)).toContain("agent-1");
      expect(runnable.map((a) => a.id)).toContain("agent-2");
    });

    it("does not return agents with unsatisfied dependencies", () => {
      const runnable = controller.getRunnableAgents();
      expect(runnable.map((a) => a.id)).not.toContain("agent-3");
    });

    it("returns dependent agent when dependencies are completed", () => {
      controller.updateAgentStatus("agent-1", "completed");
      controller.updateAgentStatus("agent-2", "completed");

      const runnable = controller.getRunnableAgents();
      expect(runnable.map((a) => a.id)).toContain("agent-3");
    });

    it("does not return running or completed agents", () => {
      controller.updateAgentStatus("agent-1", "running");
      controller.updateAgentStatus("agent-2", "completed");

      const runnable = controller.getRunnableAgents();
      expect(runnable.length).toBe(0);
    });
  });

  describe("getNextBatch", () => {
    it("respects maxConcurrentAgents", () => {
      session.config.maxConcurrentAgents = 1;
      controller = new OrchestrationController(session, agents);

      const batch = controller.getNextBatch();
      expect(batch.length).toBe(1);
    });

    it("returns only one agent in pipeline mode", () => {
      session.mode = "pipeline";
      agents[0]!.order = 1;
      agents[1]!.order = 2;
      agents[2]!.order = 3;
      controller = new OrchestrationController(session, agents);

      const batch = controller.getNextBatch();
      expect(batch.length).toBe(1);
      expect(batch[0]!.order).toBe(1);
    });

    it("considers running agents when calculating available slots", () => {
      session.config.maxConcurrentAgents = 2;
      controller = new OrchestrationController(session, agents);

      controller.updateAgentStatus("agent-1", "running");

      const batch = controller.getNextBatch();
      expect(batch.length).toBe(1);
    });
  });

  describe("hasSatisfiedDependencies", () => {
    it("returns true for agent with no dependencies", () => {
      expect(controller.hasSatisfiedDependencies("agent-1")).toBe(true);
    });

    it("returns false for agent with unsatisfied dependencies", () => {
      expect(controller.hasSatisfiedDependencies("agent-3")).toBe(false);
    });

    it("returns true when all dependencies are completed", () => {
      controller.updateAgentStatus("agent-1", "completed");
      controller.updateAgentStatus("agent-2", "completed");

      expect(controller.hasSatisfiedDependencies("agent-3")).toBe(true);
    });
  });

  describe("hasDeadlock", () => {
    it("returns false when agents are running", () => {
      controller.updateAgentStatus("agent-1", "running");
      expect(controller.hasDeadlock()).toBe(false);
    });

    it("returns false when no agents are pending", () => {
      for (const agent of agents) {
        controller.updateAgentStatus(agent.id, "completed");
      }
      expect(controller.hasDeadlock()).toBe(false);
    });

    it("returns true when pending agents have circular dependencies", () => {
      // Create circular dependency scenario
      const circularAgents = [
        createAgent({
          id: "a",
          dependencies: ["b"],
          ownedFiles: ["a.ts"],
        }),
        createAgent({
          id: "b",
          dependencies: ["a"],
          ownedFiles: ["b.ts"],
        }),
      ];
      const circularSession = createSession();
      const circularController = new OrchestrationController(
        circularSession,
        circularAgents,
      );

      expect(circularController.hasDeadlock()).toBe(true);
    });
  });

  describe("file locking", () => {
    it("acquires locks successfully for non-conflicting files", () => {
      const result = controller.acquireFileLocks("agent-1");
      expect(result.success).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it("prevents acquiring locks for already locked files", () => {
      controller.acquireFileLocks("agent-1");

      // Create agent with overlapping file
      const conflictingAgent = createAgent({
        id: "conflict",
        ownedFiles: ["src/api/handler.ts"],
      });
      const testAgents = [...agents, conflictingAgent];
      const testController = new OrchestrationController(session, testAgents);
      testController.acquireFileLocks("agent-1");

      const result = testController.acquireFileLocks("conflict");
      expect(result.success).toBe(false);
      expect(result.conflicts).toContain("src/api/handler.ts");
    });

    it("allows same agent to re-acquire their own locks", () => {
      controller.acquireFileLocks("agent-1");
      const result = controller.acquireFileLocks("agent-1");
      expect(result.success).toBe(true);
    });

    it("releases locks when agent completes", () => {
      controller.acquireFileLocks("agent-1");
      controller.updateAgentStatus("agent-1", "completed");

      // Now another agent with same file should be able to lock
      const newAgent = createAgent({
        id: "new",
        ownedFiles: ["src/api/handler.ts"],
      });
      const testController = new OrchestrationController(session, [
        ...agents,
        newAgent,
      ]);

      const result = testController.acquireFileLocks("new");
      expect(result.success).toBe(true);
    });

    it("skips locking when enableFileLocking is false", () => {
      session.config.enableFileLocking = false;
      controller = new OrchestrationController(session, agents);

      const result = controller.acquireFileLocks("agent-1");
      expect(result.success).toBe(true);
    });
  });

  describe("updateAgentStatus", () => {
    it("sets startedAt when status becomes running", () => {
      controller.updateAgentStatus("agent-1", "running");
      const agent = controller.getAgent("agent-1");
      expect(agent?.startedAt).toBeDefined();
    });

    it("sets completedAt when status becomes completed", () => {
      controller.updateAgentStatus("agent-1", "completed");
      const agent = controller.getAgent("agent-1");
      expect(agent?.completedAt).toBeDefined();
    });

    it("releases file locks on completion", () => {
      controller.acquireFileLocks("agent-1");
      controller.updateAgentStatus("agent-1", "completed");

      // Verify locks are released by trying to acquire same files
      const newAgent = createAgent({
        id: "new",
        ownedFiles: ["src/api/handler.ts"],
      });
      const testController = new OrchestrationController(session, [
        ...agents,
        newAgent,
      ]);
      const result = testController.acquireFileLocks("new");
      expect(result.success).toBe(true);
    });
  });

  describe("gatherDependencyOutputs", () => {
    it("gathers outputs from completed dependencies", () => {
      controller.updateAgentStatus("agent-1", "completed");
      controller.setAgentResult("agent-1", {
        success: true,
        filesModified: ["src/api/handler.ts"],
        output: "Backend implementation complete",
      });

      controller.updateAgentStatus("agent-2", "completed");
      controller.setAgentResult("agent-2", {
        success: true,
        filesModified: ["src/ui/component.tsx"],
        output: "Frontend implementation complete",
      });

      const context = controller.gatherDependencyOutputs("agent-3");
      expect(context.previousOutputs.get("backend")).toBe(
        "Backend implementation complete",
      );
      expect(context.previousOutputs.get("frontend")).toBe(
        "Frontend implementation complete",
      );
    });

    it("returns empty map for agent with no dependencies", () => {
      const context = controller.gatherDependencyOutputs("agent-1");
      expect(context.previousOutputs.size).toBe(0);
    });
  });

  describe("detectConflicts", () => {
    it("detects concurrent modification of same file", () => {
      controller.updateAgentStatus("agent-1", "completed");
      controller.setAgentResult("agent-1", {
        success: true,
        filesModified: ["src/shared/utils.ts"],
        output: "Done",
      });

      controller.updateAgentStatus("agent-2", "completed");
      controller.setAgentResult("agent-2", {
        success: true,
        filesModified: ["src/shared/utils.ts"],
        output: "Done",
      });

      const conflicts = controller.detectConflicts();
      expect(conflicts.length).toBe(1);
      expect(conflicts[0]!.filePath).toBe("src/shared/utils.ts");
      expect(conflicts[0]!.agents).toContain("agent-1");
      expect(conflicts[0]!.agents).toContain("agent-2");
    });

    it("returns empty array when no conflicts", () => {
      controller.updateAgentStatus("agent-1", "completed");
      controller.setAgentResult("agent-1", {
        success: true,
        filesModified: ["src/api/handler.ts"],
        output: "Done",
      });

      controller.updateAgentStatus("agent-2", "completed");
      controller.setAgentResult("agent-2", {
        success: true,
        filesModified: ["src/ui/component.tsx"],
        output: "Done",
      });

      const conflicts = controller.detectConflicts();
      expect(conflicts.length).toBe(0);
    });
  });

  describe("checkForCompletionSignal", () => {
    it("detects completion signal in output", () => {
      const output = `Task complete!\n${AGENT_TASK_COMPLETE_SIGNAL}\nAll done.`;
      expect(controller.checkForCompletionSignal(output)).toBe(true);
    });

    it("returns false when no signal present", () => {
      const output = "Just regular output here";
      expect(controller.checkForCompletionSignal(output)).toBe(false);
    });
  });

  describe("extractModifiedFiles", () => {
    it("extracts files from Modified: format", () => {
      const output = "Modified: src/api/handler.ts, src/api/router.ts";
      const files = controller.extractModifiedFiles(output);
      expect(files).toContain("src/api/handler.ts");
      expect(files).toContain("src/api/router.ts");
    });

    it("extracts files from bullet list format", () => {
      const output = `Files modified:
- src/api/handler.ts
- src/api/router.ts
`;
      const files = controller.extractModifiedFiles(output);
      expect(files).toContain("src/api/handler.ts");
      expect(files).toContain("src/api/router.ts");
    });
  });

  describe("getMetrics", () => {
    it("returns correct metrics", () => {
      controller.updateAgentStatus("agent-1", "completed");
      controller.updateAgentStatus("agent-2", "running");

      const metrics = controller.getMetrics();
      expect(metrics.totalAgents).toBe(3);
      expect(metrics.completedAgents).toBe(1);
      expect(metrics.runningAgents).toBe(1);
      expect(metrics.pendingAgents).toBe(1);
    });
  });

  describe("buildAgentPrompt", () => {
    it("includes agent task and role", () => {
      const prompt = controller.buildAgentPrompt("agent-1");
      expect(prompt).toContain("backend");
      expect(prompt).toContain("Implement backend");
    });

    it("includes file ownership", () => {
      const prompt = controller.buildAgentPrompt("agent-1");
      expect(prompt).toContain("src/api/handler.ts");
    });

    it("includes completion signal instructions", () => {
      const prompt = controller.buildAgentPrompt("agent-1");
      expect(prompt).toContain(AGENT_TASK_COMPLETE_SIGNAL);
    });

    it("includes context from dependencies", () => {
      controller.updateAgentStatus("agent-1", "completed");
      controller.setAgentResult("agent-1", {
        success: true,
        filesModified: [],
        output: "Backend API ready",
      });

      controller.updateAgentStatus("agent-2", "completed");
      controller.setAgentResult("agent-2", {
        success: true,
        filesModified: [],
        output: "Frontend ready",
      });

      const prompt = controller.buildAgentPrompt("agent-3");
      expect(prompt).toContain("Backend API ready");
      expect(prompt).toContain("Frontend ready");
    });
  });

  describe("event listeners", () => {
    it("emits events on status changes", () => {
      const listener = vi.fn();
      controller.addEventListener(listener);

      controller.updateAgentStatus("agent-1", "running");
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "agent_started",
          agentId: "agent-1",
        }),
      );

      controller.updateAgentStatus("agent-1", "completed");
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "agent_completed",
          agentId: "agent-1",
        }),
      );
    });

    it("removes event listeners", () => {
      const listener = vi.fn();
      controller.addEventListener(listener);
      controller.removeEventListener(listener);

      controller.updateAgentStatus("agent-1", "running");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("getProgressPercent", () => {
    it("returns 0 when no agents done", () => {
      expect(controller.getProgressPercent()).toBe(0);
    });

    it("returns correct percentage", () => {
      controller.updateAgentStatus("agent-1", "completed");
      expect(controller.getProgressPercent()).toBe(33);

      controller.updateAgentStatus("agent-2", "completed");
      expect(controller.getProgressPercent()).toBe(67);

      controller.updateAgentStatus("agent-3", "failed");
      expect(controller.getProgressPercent()).toBe(100);
    });
  });
});
