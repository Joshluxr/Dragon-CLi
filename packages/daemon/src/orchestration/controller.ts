/**
 * Multi-Agent Orchestration Controller
 *
 * Manages coordinated parallel execution of multiple agents with:
 * - Swarm mode: All agents run simultaneously with file ownership
 * - Pipeline mode: Sequential execution with context handoff
 * - Parallel mode: Respects dependency graph for optimal parallelism
 */

import type {
  OrchestrationSession,
  OrchestrationAgent,
  OrchestrationAgentStatus,
  AgentResult,
  FileConflict,
  OrchestrationEvent,
  OrchestrationEventType,
} from "./types";
import { AGENT_TASK_COMPLETE_SIGNAL } from "./types";

/**
 * Result of checking whether orchestration should continue
 */
export interface ContinueResult {
  continue: boolean;
  reason?: string;
}

/**
 * Agent run context passed between pipeline stages
 */
export interface AgentContext {
  previousOutputs: Map<string, string>;
  sharedData: Record<string, unknown>;
}

/**
 * Orchestration metrics
 */
export interface OrchestrationMetrics {
  sessionId: string;
  status: OrchestrationSession["status"];
  totalAgents: number;
  completedAgents: number;
  failedAgents: number;
  runningAgents: number;
  pendingAgents: number;
  blockedAgents: number;
  elapsedMinutes: number;
  conflicts: FileConflict[];
}

/**
 * Controller for managing multi-agent orchestration
 */
export class OrchestrationController {
  private session: OrchestrationSession;
  private agents: Map<string, OrchestrationAgent> = new Map();
  private fileLocks: Map<string, string> = new Map(); // filePath -> agentId
  private startTime: number;
  private conflicts: FileConflict[] = [];
  private eventListeners: Array<(event: OrchestrationEvent) => void> = [];

  constructor(session: OrchestrationSession, agents: OrchestrationAgent[]) {
    this.session = session;
    this.startTime = Date.now();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
  }

  /**
   * Get the orchestration session
   */
  getSession(): OrchestrationSession {
    return this.session;
  }

  /**
   * Get all agents
   */
  getAgents(): OrchestrationAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): OrchestrationAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Check if orchestration should continue
   */
  shouldContinue(): ContinueResult {
    const config = this.session.config;

    // Check timeout
    const elapsedMinutes = this.getElapsedMinutes();
    if (elapsedMinutes >= config.sessionTimeoutMinutes) {
      return { continue: false, reason: "Session timeout reached" };
    }

    // Check if all agents are done
    const agents = Array.from(this.agents.values());
    const allDone = agents.every(
      (a) =>
        a.status === "completed" ||
        a.status === "failed" ||
        a.status === "blocked",
    );

    if (allDone) {
      // Check if we have failures and requireAllSuccess is true
      const hasFailed = agents.some((a) => a.status === "failed");
      if (hasFailed && config.requireAllSuccess) {
        return {
          continue: false,
          reason: "Agent failed and requireAllSuccess is true",
        };
      }
      return { continue: false, reason: "All agents completed" };
    }

    return { continue: true };
  }

  /**
   * Get runnable agents (pending with satisfied dependencies)
   */
  getRunnableAgents(): OrchestrationAgent[] {
    const completedIds = new Set<string>();
    for (const agent of this.agents.values()) {
      if (agent.status === "completed") {
        completedIds.add(agent.id);
      }
    }

    return Array.from(this.agents.values()).filter((agent) => {
      if (agent.status !== "pending") return false;

      // Check if all dependencies are completed
      const deps = agent.dependencies || [];
      return deps.every((depId) => completedIds.has(depId));
    });
  }

  /**
   * Get agents that should run in the next batch (respects concurrency)
   */
  getNextBatch(): OrchestrationAgent[] {
    const config = this.session.config;
    const runnable = this.getRunnableAgents();

    // Count currently running agents
    const runningCount = Array.from(this.agents.values()).filter(
      (a) => a.status === "running",
    ).length;

    // Calculate how many more we can start
    const availableSlots = Math.max(
      0,
      config.maxConcurrentAgents - runningCount,
    );

    if (this.session.mode === "pipeline") {
      // Pipeline: run one at a time in order
      const ordered = runnable.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return ordered.slice(0, 1);
    }

    // Swarm/Parallel: run as many as concurrency allows
    return runnable.slice(0, availableSlots);
  }

  /**
   * Check if a specific agent has all dependencies satisfied
   */
  hasSatisfiedDependencies(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    const deps = agent.dependencies || [];
    return deps.every((depId) => {
      const dep = this.agents.get(depId);
      return dep?.status === "completed";
    });
  }

  /**
   * Check for dependency deadlock
   */
  hasDeadlock(): boolean {
    const pending = Array.from(this.agents.values()).filter(
      (a) => a.status === "pending",
    );
    const running = Array.from(this.agents.values()).filter(
      (a) => a.status === "running",
    );

    // No deadlock if agents are running or none pending
    if (running.length > 0 || pending.length === 0) {
      return false;
    }

    // Check if any pending agent can run
    const runnable = this.getRunnableAgents();
    return runnable.length === 0 && pending.length > 0;
  }

  /**
   * Acquire file locks for an agent
   */
  acquireFileLocks(agentId: string): { success: boolean; conflicts: string[] } {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false, conflicts: [] };
    }

    if (!this.session.config.enableFileLocking) {
      return { success: true, conflicts: [] };
    }

    const conflicts: string[] = [];

    for (const file of agent.ownedFiles || []) {
      const existingOwner = this.fileLocks.get(file);
      if (existingOwner && existingOwner !== agentId) {
        conflicts.push(file);
      }
    }

    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }

    // Acquire all locks
    for (const file of agent.ownedFiles || []) {
      this.fileLocks.set(file, agentId);
    }

    return { success: true, conflicts: [] };
  }

  /**
   * Release file locks for an agent
   */
  releaseFileLocks(agentId: string): void {
    for (const [file, owner] of this.fileLocks.entries()) {
      if (owner === agentId) {
        this.fileLocks.delete(file);
      }
    }
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: OrchestrationAgentStatus): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = status;

    if (status === "running" && !agent.startedAt) {
      agent.startedAt = new Date();
    }
    if (status === "completed" || status === "failed") {
      agent.completedAt = new Date();
      this.releaseFileLocks(agentId);
    }

    this.agents.set(agentId, agent);
    this.emitEvent(
      status === "completed"
        ? "agent_completed"
        : status === "failed"
          ? "agent_failed"
          : status === "blocked"
            ? "agent_blocked"
            : "agent_started",
      agentId,
    );
  }

  /**
   * Set agent result
   */
  setAgentResult(agentId: string, result: AgentResult): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.result = result;
    this.agents.set(agentId, agent);
  }

  /**
   * Set agent thread ID
   */
  setAgentThread(agentId: string, threadId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.threadId = threadId;
    this.agents.set(agentId, agent);
  }

  /**
   * Gather outputs from completed dependencies
   */
  gatherDependencyOutputs(agentId: string): AgentContext {
    const agent = this.agents.get(agentId);
    const context: AgentContext = {
      previousOutputs: new Map(),
      sharedData: {},
    };

    if (!agent) return context;

    for (const depId of agent.dependencies || []) {
      const dep = this.agents.get(depId);
      if (dep?.result?.output) {
        context.previousOutputs.set(dep.role, dep.result.output);
      }
    }

    return context;
  }

  /**
   * Check for file conflicts across completed agents
   */
  detectConflicts(): FileConflict[] {
    const fileAgents: Map<string, string[]> = new Map();

    for (const agent of this.agents.values()) {
      if (agent.status !== "completed") continue;

      const modifiedFiles = agent.result?.filesModified || [];
      for (const file of modifiedFiles) {
        const agents = fileAgents.get(file) || [];
        agents.push(agent.id);
        fileAgents.set(file, agents);
      }
    }

    const conflicts: FileConflict[] = [];
    for (const [file, agents] of fileAgents.entries()) {
      if (agents.length > 1) {
        conflicts.push({
          filePath: file,
          agents,
          conflictType: "concurrent-modification",
        });
      }
    }

    this.conflicts = conflicts;
    if (conflicts.length > 0) {
      this.emitEvent("conflict_detected", undefined, { conflicts });
    }

    return conflicts;
  }

  /**
   * Check agent output for completion signal
   */
  checkForCompletionSignal(output: string): boolean {
    return output.includes(AGENT_TASK_COMPLETE_SIGNAL);
  }

  /**
   * Extract modified files from agent output
   */
  extractModifiedFiles(output: string): string[] {
    const files: string[] = [];

    // Look for common patterns
    const patterns = [
      /Modified:\s*([^\n]+)/gi,
      /Changed:\s*([^\n]+)/gi,
      /Updated:\s*([^\n]+)/gi,
      /Created:\s*([^\n]+)/gi,
      /Files modified:\s*\n((?:[-*]\s*[^\n]+\n?)+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const fileStr = match[1];
        if (!fileStr) continue;
        // Split by commas or newlines with bullets
        const parts = fileStr
          .split(/[,\n]/)
          .map((p) => p.replace(/^[-*]\s*/, "").trim());
        for (const part of parts) {
          if (part && (part.includes("/") || part.includes("."))) {
            files.push(part);
          }
        }
      }
    }

    return [...new Set(files)];
  }

  /**
   * Get current orchestration metrics
   */
  getMetrics(): OrchestrationMetrics {
    const agents = Array.from(this.agents.values());

    return {
      sessionId: this.session.id,
      status: this.session.status,
      totalAgents: agents.length,
      completedAgents: agents.filter((a) => a.status === "completed").length,
      failedAgents: agents.filter((a) => a.status === "failed").length,
      runningAgents: agents.filter((a) => a.status === "running").length,
      pendingAgents: agents.filter((a) => a.status === "pending").length,
      blockedAgents: agents.filter((a) => a.status === "blocked").length,
      elapsedMinutes: this.getElapsedMinutes(),
      conflicts: this.conflicts,
    };
  }

  /**
   * Get elapsed time in minutes
   */
  getElapsedMinutes(): number {
    return (Date.now() - this.startTime) / 60000;
  }

  /**
   * Build prompt for an agent
   */
  buildAgentPrompt(agentId: string): string {
    const agent = this.agents.get(agentId);
    if (!agent) return "";

    const context = this.gatherDependencyOutputs(agentId);

    let prompt = `## Orchestrated Task: ${agent.role}

You are part of a multi-agent orchestration. Your specific role is: **${agent.role}**

### Your Task:
${agent.task}

### File Ownership:
You are responsible for these files:
${agent.ownedFiles.map((f) => `- ${f}`).join("\n")}

**Important**: Only modify files in your ownership. Do not modify other files.

`;

    if (context.previousOutputs.size > 0) {
      prompt += `### Context from Previous Agents:\n`;
      for (const [role, output] of context.previousOutputs.entries()) {
        prompt += `\n**${role}**:\n${output}\n`;
      }
      prompt += `\n`;
    }

    prompt += `### Coordination Protocol:
1. Only work on your assigned task
2. Only modify your owned files
3. When complete, clearly state "${AGENT_TASK_COMPLETE_SIGNAL}"
4. Report any blockers immediately

### Output Format:
When done, summarize:
- Files modified
- Changes made
- Any issues encountered
`;

    return prompt;
  }

  /**
   * Add event listener
   */
  addEventListener(listener: (event: OrchestrationEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: OrchestrationEvent) => void): void {
    this.eventListeners = this.eventListeners.filter((l) => l !== listener);
  }

  /**
   * Emit an orchestration event
   */
  private emitEvent(
    type: OrchestrationEventType,
    agentId?: string,
    data?: Record<string, unknown>,
  ): void {
    const event: OrchestrationEvent = {
      type,
      sessionId: this.session.id,
      agentId,
      timestamp: Date.now(),
      data,
    };

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Mark session as completed
   */
  markCompleted(): void {
    this.session.status = "completed";
    this.session.completedAt = new Date();
    this.emitEvent("session_completed");
  }

  /**
   * Mark session as failed
   */
  markFailed(reason?: string): void {
    this.session.status = "failed";
    this.session.completedAt = new Date();
    this.emitEvent("session_failed", undefined, { reason });
  }

  /**
   * Get progress percentage
   */
  getProgressPercent(): number {
    const agents = Array.from(this.agents.values());
    if (agents.length === 0) return 0;

    const done = agents.filter(
      (a) => a.status === "completed" || a.status === "failed",
    ).length;
    return Math.round((done / agents.length) * 100);
  }
}
