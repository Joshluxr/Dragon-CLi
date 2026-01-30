/**
 * Multi-Agent Orchestration Types
 *
 * NOTE: These types are duplicated in @terragon/shared/model/orchestration.ts for use by
 * other packages. Changes here should be synchronized.
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
  maxConcurrentAgents: number;
  agentTimeoutMinutes: number;
  enableFileLocking: boolean;
  conflictResolution: ConflictResolution;
  enableRealTimeSync: boolean;
  syncIntervalSeconds: number;
  autoMerge: boolean;
  requireAllSuccess: boolean;
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
 * Agent completion signal
 */
export const AGENT_TASK_COMPLETE_SIGNAL = "AGENT_TASK_COMPLETE";

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
