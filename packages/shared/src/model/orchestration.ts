/**
 * Multi-Agent Orchestration Types
 *
 * Enables coordinated parallel execution of multiple agents:
 * - Swarm mode: Multiple agents working on related subtasks simultaneously
 * - Pipeline mode: Sequential agent chains with handoff
 * - Parallel mode: Respects dependency graph for optimal parallelism
 */

/**
 * Orchestration execution modes
 */
export type OrchestrationMode = "swarm" | "pipeline" | "parallel";

/**
 * Status of an orchestration session
 */
export type OrchestrationSessionStatus =
  | "planning"
  | "running"
  | "merging"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Status of an individual agent in orchestration
 */
export type OrchestrationAgentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

/**
 * File lock types for conflict prevention
 */
export type FileLockType = "exclusive" | "shared";

/**
 * Conflict resolution strategies
 */
export type ConflictResolution = "last-write-wins" | "merge" | "manual";

/**
 * Configuration for orchestration session
 */
export interface OrchestrationConfig {
  mode: OrchestrationMode;

  // Parallelism
  maxConcurrentAgents: number;
  agentTimeoutMinutes: number;

  // File handling
  enableFileLocking: boolean;
  conflictResolution: ConflictResolution;

  // Coordination
  enableRealTimeSync: boolean;
  syncIntervalSeconds: number;

  // Merge
  autoMerge: boolean;
  requireAllSuccess: boolean;

  // Safety limits
  maxTotalAgents: number;
  sessionTimeoutMinutes: number;
}

/**
 * Default orchestration configuration
 */
export const defaultOrchestrationConfig: OrchestrationConfig = {
  mode: "parallel",
  maxConcurrentAgents: 3,
  agentTimeoutMinutes: 30,
  enableFileLocking: true,
  conflictResolution: "merge",
  enableRealTimeSync: true,
  syncIntervalSeconds: 10,
  autoMerge: true,
  requireAllSuccess: false,
  maxTotalAgents: 10,
  sessionTimeoutMinutes: 120,
};

/**
 * Subtask definition for task decomposition
 */
export interface SubTask {
  id: string;
  title: string;
  description: string;
  role: string;
  estimatedDurationMinutes: number;
  files: string[];
  inputs: string[];
  outputs: string[];
}

/**
 * Dependency graph for parallel execution
 */
export interface DependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
}

/**
 * Task decomposition result
 */
export interface TaskDecomposition {
  originalTask: string;
  subtasks: SubTask[];
  dependencies: DependencyGraph;
}

/**
 * Result from an individual agent execution
 */
export interface AgentResult {
  success: boolean;
  filesModified: string[];
  output: string;
  prNumber?: number;
  error?: string;
}

/**
 * Orchestration session record
 */
export interface OrchestrationSession {
  id: string;
  parentThreadId: string;
  userId: string;
  mode: OrchestrationMode;
  status: OrchestrationSessionStatus;
  config: OrchestrationConfig;
  taskDecomposition: TaskDecomposition;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Orchestration agent record
 */
export interface OrchestrationAgent {
  id: string;
  sessionId: string;
  threadId?: string;
  role: string;
  task: string;
  ownedFiles: string[];
  dependencies: string[];
  status: OrchestrationAgentStatus;
  order?: number;
  result?: AgentResult;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * File lock record
 */
export interface FileLock {
  id: string;
  sessionId: string;
  agentId: string;
  filePath: string;
  lockType: FileLockType;
  acquiredAt: Date;
  releasedAt?: Date;
}

/**
 * File conflict detected during merge
 */
export interface FileConflict {
  filePath: string;
  agents: string[];
  conflictType: "concurrent-modification" | "dependency-violation";
}

/**
 * Orchestration event types for real-time updates
 */
export type OrchestrationEventType =
  | "session_started"
  | "session_completed"
  | "session_failed"
  | "agent_started"
  | "agent_completed"
  | "agent_failed"
  | "agent_blocked"
  | "conflict_detected"
  | "merge_started"
  | "merge_completed";

/**
 * Orchestration event payload
 */
export interface OrchestrationEvent {
  type: OrchestrationEventType;
  sessionId: string;
  agentId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Validate orchestration configuration
 */
export function validateOrchestrationConfig(
  config: Partial<OrchestrationConfig>,
): OrchestrationConfig {
  const defaults = defaultOrchestrationConfig;

  return {
    mode: config.mode ?? defaults.mode,
    maxConcurrentAgents: Math.max(
      1,
      Math.min(config.maxConcurrentAgents ?? defaults.maxConcurrentAgents, 10),
    ),
    agentTimeoutMinutes: Math.max(
      5,
      Math.min(config.agentTimeoutMinutes ?? defaults.agentTimeoutMinutes, 120),
    ),
    enableFileLocking: config.enableFileLocking ?? defaults.enableFileLocking,
    conflictResolution:
      config.conflictResolution ?? defaults.conflictResolution,
    enableRealTimeSync:
      config.enableRealTimeSync ?? defaults.enableRealTimeSync,
    syncIntervalSeconds: Math.max(
      5,
      Math.min(config.syncIntervalSeconds ?? defaults.syncIntervalSeconds, 60),
    ),
    autoMerge: config.autoMerge ?? defaults.autoMerge,
    requireAllSuccess: config.requireAllSuccess ?? defaults.requireAllSuccess,
    maxTotalAgents: Math.max(
      1,
      Math.min(config.maxTotalAgents ?? defaults.maxTotalAgents, 20),
    ),
    sessionTimeoutMinutes: Math.max(
      30,
      Math.min(
        config.sessionTimeoutMinutes ?? defaults.sessionTimeoutMinutes,
        480,
      ),
    ),
  };
}

/**
 * Agent role templates for common patterns
 */
export const AGENT_ROLES = {
  BACKEND: "backend",
  FRONTEND: "frontend",
  TESTS: "tests",
  DOCS: "docs",
  INFRA: "infra",
  DATABASE: "database",
  API: "api",
  UI: "ui",
} as const;

/**
 * Agent completion signal
 */
export const AGENT_TASK_COMPLETE_SIGNAL = "AGENT_TASK_COMPLETE";

/**
 * Build orchestrated agent prompt
 */
export function buildOrchestrationPrompt(
  agent: OrchestrationAgent,
  context?: string,
): string {
  let prompt = `## Orchestrated Task: ${agent.role}

You are part of a multi-agent orchestration. Your specific role is: **${agent.role}**

### Your Task:
${agent.task}

### File Ownership:
You are responsible for these files:
${agent.ownedFiles.map((f) => `- ${f}`).join("\n")}

**Important**: Only modify files in your ownership. Do not modify other files.

`;

  if (context) {
    prompt += `### Context from Previous Agents:
${context}

`;
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
