/**
 * Session State and Checkpoint Types
 *
 * Enables seamless session continuity and cross-agent handoff:
 * - Checkpoint auto-save at key moments
 * - Full session state serialization
 * - Cross-agent context transfer
 * - Resume from any checkpoint
 */

import type { AIAgent } from "@dragon/agent/types";

/**
 * Checkpoint types
 */
export type CheckpointType = "auto" | "manual" | "error" | "handoff";

/**
 * Tool history entry for tracking tool usage
 */
export interface ToolHistoryEntry {
  toolName: string;
  timestamp: number;
  success: boolean;
  summary?: string;
}

/**
 * Session state serialization format
 */
export interface SessionState {
  version: string;
  timestamp: number;

  // Thread info
  threadId: string;
  chatId: string;
  userId: string;

  // Messages (simplified representation)
  messageCount: number;
  lastMessagePreview: string;

  // Agent state
  agent: AIAgent;
  model: string;
  systemPrompt?: string;

  // Conversation context
  conversationSummary?: string;
  keyTopics: string[];
  workingFiles: string[];

  // Tool state
  toolHistory: ToolHistoryEntry[];
  pendingToolCount: number;

  // MCP state
  mcpServers: string[];
  mcpContext?: Record<string, unknown>;

  // Git state
  gitBranch?: string;
  hasUncommittedChanges: boolean;
  uncommittedFileCount?: number;

  // Execution plan (if in plan mode)
  hasPlan: boolean;
  planPhase?: number;
  planStep?: number;

  // Custom context
  customContext?: Record<string, unknown>;
}

/**
 * Checkpoint metadata for listing/search
 */
export interface CheckpointMetadata {
  id: string;
  threadId: string;
  chatId: string;
  name: string;
  description?: string;
  type: CheckpointType;
  createdAt: Date;
  stateSize: number;
  messageCount: number;
  contextSummary?: string;
  agent: AIAgent;
  model?: string;
}

/**
 * Agent handoff record
 */
export interface AgentHandoff {
  id: string;
  fromThreadId: string;
  toThreadId: string;
  fromAgent: AIAgent;
  toAgent: AIAgent;
  checkpointId: string;
  reason?: string;
  context?: string;
  createdAt: Date;
}

/**
 * Handoff chain entry for visualizing handoff history
 */
export interface HandoffChainEntry {
  fromThreadId: string;
  toThreadId: string;
  fromAgent: AIAgent;
  toAgent: AIAgent;
  reason?: string;
  createdAt: Date;
}

/**
 * Options for creating a checkpoint
 */
export interface CreateCheckpointOptions {
  name?: string;
  description?: string;
  type: CheckpointType;
}

/**
 * Options for resuming from a checkpoint
 */
export interface ResumeCheckpointOptions {
  newAgent?: AIAgent;
  additionalContext?: string;
}

/**
 * Options for initiating a handoff
 */
export interface InitiateHandoffOptions {
  toAgent: AIAgent;
  reason: string;
  context?: string;
}

/**
 * Default session state version
 */
export const SESSION_STATE_VERSION = "1.0";

/**
 * Default checkpoint configuration
 */
export interface CheckpointConfig {
  autoCheckpointEnabled: boolean;
  autoCheckpointIntervalMinutes: number;
  checkpointOnToolComplete: boolean;
  checkpointOnError: boolean;
  maxCheckpointsPerSession: number;
  retentionDays: number;
}

/**
 * Default checkpoint configuration
 */
export const defaultCheckpointConfig: CheckpointConfig = {
  autoCheckpointEnabled: true,
  autoCheckpointIntervalMinutes: 15,
  checkpointOnToolComplete: false,
  checkpointOnError: true,
  maxCheckpointsPerSession: 50,
  retentionDays: 30,
};

/**
 * Extract key topics from message content
 */
export function extractKeyTopics(content: string): string[] {
  const topics: string[] = [];

  // Look for file paths
  const fileMatches = content.match(
    /[\w/-]+\.(ts|tsx|js|jsx|py|rs|go|java|md|json|yaml|yml)/g,
  );
  if (fileMatches) {
    topics.push(...fileMatches.slice(0, 5));
  }

  // Look for function/class names
  const codeMatches = content.match(
    /(?:function|class|const|let|var|def|fn)\s+(\w+)/g,
  );
  if (codeMatches) {
    topics.push(...codeMatches.slice(0, 5));
  }

  // Look for common keywords
  const keywords = [
    "authentication",
    "database",
    "api",
    "component",
    "test",
    "fix",
    "bug",
    "feature",
    "refactor",
    "optimize",
    "deploy",
    "config",
  ];
  for (const keyword of keywords) {
    if (content.toLowerCase().includes(keyword)) {
      topics.push(keyword);
    }
  }

  return [...new Set(topics)].slice(0, 10);
}

/**
 * Extract working files from tool history
 */
export function extractWorkingFiles(toolHistory: ToolHistoryEntry[]): string[] {
  const files: string[] = [];

  for (const entry of toolHistory) {
    if (entry.summary) {
      const fileMatches = entry.summary.match(
        /[\w/-]+\.(ts|tsx|js|jsx|py|rs|go|java|md|json|yaml|yml)/g,
      );
      if (fileMatches) {
        files.push(...fileMatches);
      }
    }
  }

  return [...new Set(files)].slice(0, 20);
}

/**
 * Build handoff prompt for the new agent
 */
export function buildHandoffPrompt(
  state: SessionState,
  options: InitiateHandoffOptions,
): string {
  return `## Agent Handoff

You are receiving a handoff from a previous agent. Here's the context:

### Previous Work Summary
${state.conversationSummary || "No summary available"}

### Key Topics
${state.keyTopics.join(", ") || "None identified"}

### Files Being Worked On
${state.workingFiles.length > 0 ? state.workingFiles.join("\n") : "None identified"}

### Git State
- Branch: ${state.gitBranch || "unknown"}
- Uncommitted changes: ${state.hasUncommittedChanges ? "Yes" : "No"}

### Handoff Reason
${options.reason}

${options.context ? `### Additional Context\n${options.context}\n` : ""}
---

Please continue the work from where the previous agent left off.
`;
}

/**
 * Validate checkpoint configuration
 */
export function validateCheckpointConfig(
  config: Partial<CheckpointConfig>,
): CheckpointConfig {
  const defaults = defaultCheckpointConfig;

  return {
    autoCheckpointEnabled:
      config.autoCheckpointEnabled ?? defaults.autoCheckpointEnabled,
    autoCheckpointIntervalMinutes: Math.max(
      5,
      Math.min(
        config.autoCheckpointIntervalMinutes ??
          defaults.autoCheckpointIntervalMinutes,
        60,
      ),
    ),
    checkpointOnToolComplete:
      config.checkpointOnToolComplete ?? defaults.checkpointOnToolComplete,
    checkpointOnError: config.checkpointOnError ?? defaults.checkpointOnError,
    maxCheckpointsPerSession: Math.max(
      10,
      Math.min(
        config.maxCheckpointsPerSession ?? defaults.maxCheckpointsPerSession,
        100,
      ),
    ),
    retentionDays: Math.max(
      7,
      Math.min(config.retentionDays ?? defaults.retentionDays, 365),
    ),
  };
}
