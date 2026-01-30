# Dragon Features Documentation

This document describes all major features implemented in Dragon, including the 10-phase feature expansion.

## Table of Contents

1. [Core Features](#core-features)
2. [Phase 1: Issue-to-PR Automation](#phase-1-issue-to-pr-automation)
3. [Phase 2: PR-Agent Code Review](#phase-2-pr-agent-code-review)
4. [Phase 3: Plan and Act Modes](#phase-3-plan-and-act-modes)
5. [Phase 4: TDD Guard Hooks](#phase-4-tdd-guard-hooks)
6. [Phase 5: Browser Automation](#phase-5-browser-automation)
7. [Phase 6: Autonomous Exit Detection](#phase-6-autonomous-exit-detection)
8. [Phase 7: Multi-Agent Orchestration](#phase-7-multi-agent-orchestration)
9. [Phase 8: Usage Dashboard](#phase-8-usage-dashboard)
10. [Phase 9: Session Continuity](#phase-9-session-continuity)
11. [Phase 10: MCP Self-Extension](#phase-10-mcp-self-extension)

---

## Core Features

### Multi-Agent Support

Dragon supports multiple AI coding agents:

- **Claude Code** (Anthropic)
- **OpenAI Codex**
- **Amp**
- **Gemini CLI**

### Sandbox Isolation

Each agent runs in an isolated container with its own repository copy, ensuring:

- Safe file operations
- Independent test execution
- No interference between concurrent tasks

### Git Workflow Integration

- Automatic branch creation for tasks
- AI-generated commits and PRs
- Checkpoint-based progress saving

---

## Phase 1: Issue-to-PR Automation

**Purpose**: Automatically convert GitHub issues into pull requests by delegating work to AI agents.

### How It Works

1. When a GitHub issue is labeled or assigned, a webhook triggers automation
2. An AI agent picks up the issue and analyzes requirements
3. The agent creates a branch, implements changes, and opens a PR
4. The PR is linked back to the original issue

### Configuration

Automations can be configured per-repository with:

- Trigger types (issue opened, labeled, assigned)
- Target branch selection
- Agent and model preferences

### Files

- `apps/www/src/app/api/webhooks/github/route.ts` - Webhook handler
- `packages/shared/src/automations.ts` - Automation configuration types

---

## Phase 2: PR-Agent Code Review

**Purpose**: Automatic code review for pull requests with configurable focus areas.

### Features

- **Automatic Triggers**: Review on PR opened, synchronized, or ready for review
- **Focus Areas**: Security, performance, style, logic, tests
- **Smart Filtering**: Skip draft PRs, bot-created PRs, or PRs with too many files
- **Custom Rules**: User-defined review criteria

### Configuration Options

```typescript
interface AutoReviewConfig {
  enabledTriggers: PRReviewTrigger[]; // ["opened", "ready_for_review"]
  skipDraftPRs: boolean; // true
  skipBots: boolean; // true
  maxFilesChanged: number; // 50
  focusAreas: PRReviewFocusArea[]; // ["security", "logic", "tests"]
  customRules: string[]; // User-defined rules
}
```

### Files

- `packages/shared/src/model/auto-review.ts` - Configuration and parsing
- `packages/shared/src/model/pr-review.ts` - PR review types
- `apps/www/src/components/settings/auto-review-settings.tsx` - UI settings

---

## Phase 3: Plan and Act Modes

**Purpose**: Structured execution where agents first create a plan, get approval, then execute.

### Modes

#### Plan Mode

Agent analyzes the task and creates a detailed execution plan:

```json
{
  "type": "execution_plan",
  "title": "Add user authentication",
  "summary": "Implement JWT-based auth with login/logout",
  "phases": [
    {
      "id": "phase-1",
      "name": "Setup Auth Library",
      "steps": [...]
    }
  ]
}
```

#### Act Mode

After plan approval, agent executes step-by-step with progress tracking:

```json
{
  "type": "step_complete",
  "phaseId": "phase-1",
  "stepId": "step-1",
  "output": "Installed dependencies"
}
```

#### Auto Mode

Agent decides when to plan vs. execute based on task complexity.

### Configuration

- `defaultAgentMode`: "plan" | "act" | "auto"
- `planModeThreshold`: Complexity threshold for auto-switching

### Files

- `packages/shared/src/model/execution-plan.ts` - Plan types and parsing
- `packages/shared/src/model/plan-management.ts` - Plan operations
- `apps/www/src/components/chat/plan-viewer.tsx` - Plan UI
- `apps/www/src/components/chat/mode-toggle.tsx` - Mode switching UI

---

## Phase 4: TDD Guard Hooks

**Purpose**: Enforce code quality through automated checks before commits.

### Available Checks

| Check         | Description            |
| ------------- | ---------------------- |
| `typeCheck`   | TypeScript compilation |
| `lint`        | ESLint/Prettier        |
| `lintAutoFix` | Auto-fix lint issues   |
| `tests`       | Run test suite         |
| `coverage`    | Check test coverage    |

### Configuration

```typescript
interface TDDGuardConfig {
  typeCheck: boolean; // true
  lint: boolean; // true
  lintAutoFix: boolean; // true
  tests: boolean; // true
  coverage: boolean; // false
  minCoverage: number; // 80
  maxTestDuration: number; // 300 seconds
  blockOnFailure: boolean; // true
  warnOnly: boolean; // false
  // Custom commands
  typeCheckCommand?: string;
  lintCommand?: string;
  testCommand?: string;
  coverageCommand?: string;
}
```

### Output Parsing

- `parseTestSummary()` - Extracts pass/fail counts from Jest/Vitest output
- `parseCoveragePercentage()` - Extracts coverage percentage
- `extractFixedFiles()` - Lists auto-fixed files

### Files

- `packages/shared/src/model/tdd-guard.ts` - Configuration and parsing
- `apps/www/src/components/settings/tdd-guard-settings.tsx` - Settings UI
- `apps/www/src/components/chat/tdd-guard-result.tsx` - Results display

---

## Phase 5: Browser Automation

**Purpose**: Headless browser control for visual testing and UI verification.

### Available Actions

| Action        | Description           |
| ------------- | --------------------- |
| `launch`      | Start browser session |
| `navigate`    | Go to URL             |
| `screenshot`  | Capture page/element  |
| `click`       | Click element         |
| `type`        | Input text            |
| `scroll`      | Scroll page           |
| `get_console` | Get console logs      |
| `wait_for`    | Wait for selector     |
| `evaluate`    | Run JavaScript        |
| `close`       | End session           |

### Security

- Domain allowlist (default: localhost, 127.0.0.1)
- Wildcard domain support (`*.example.com`)
- Session timeout limits
- Screenshot size limits

### Configuration

```typescript
interface BrowserConfig {
  enabled: boolean;
  allowedDomains: string[]; // ["localhost", "127.0.0.1"]
  maxScreenshotSize: number; // 5MB
  maxSessionDuration: number; // 5 minutes
  defaultViewport: { width: 1280; height: 720 };
}
```

### Files

- `packages/shared/src/model/browser-automation.ts` - Types and config
- `packages/daemon/src/browser/session.ts` - Session management
- `packages/daemon/src/browser/handler.ts` - Action handlers
- `apps/www/src/components/chat/browser-screenshot.tsx` - Screenshot display

---

## Phase 6: Autonomous Exit Detection

**Purpose**: Run agents autonomously with intelligent completion detection and safety limits.

### Completion Signals

| Signal          | Description                          |
| --------------- | ------------------------------------ |
| `explicit`      | Agent outputs `EXIT_AUTONOMOUS_MODE` |
| `pr_created`    | PR URL detected in output            |
| `tests_passed`  | Test success pattern detected        |
| `build_success` | Build success pattern detected       |
| `user_stop`     | User requested stop                  |
| `timeout`       | Time limit reached                   |
| `limit_reached` | Resource limit hit                   |
| `error`         | Too many consecutive errors          |

### Safety Limits

```typescript
interface AutonomousConfig {
  maxDurationMinutes: number; // 60
  maxLoops: number; // 10
  maxToolCalls: number; // 200
  maxTokens: number; // 500,000
  maxCostDollars: number; // 10
  inactivityTimeoutMinutes: number; // 5
  maxConsecutiveErrors: number; // 3
}
```

### Exit Conditions

- `requireExplicitSignal`: Require agent to explicitly signal completion
- `exitOnPRCreated`: Exit when PR is created
- `exitOnTestsPass`: Exit when all tests pass
- `exitOnBuildSuccess`: Exit when build succeeds

### Files

- `packages/shared/src/model/autonomous.ts` - Configuration and types
- `packages/daemon/src/autonomous/controller.ts` - Loop controller (26 tests)
- `apps/www/src/components/chat/autonomous-controls.tsx` - UI controls

---

## Phase 7: Multi-Agent Orchestration

**Purpose**: Coordinate multiple agents working on related subtasks simultaneously.

### Orchestration Modes

#### Swarm Mode

All agents run simultaneously with file ownership boundaries:

```
Agent A: src/api/*
Agent B: src/ui/*
Agent C: tests/*
```

#### Pipeline Mode

Sequential execution with context handoff:

```
Agent 1 → Agent 2 → Agent 3
```

#### Parallel Mode

Respects dependency graph for optimal parallelism:

```
    A
   / \
  B   C
   \ /
    D
```

### File Locking

Prevents concurrent modifications:

- **Exclusive locks**: Only one agent can modify
- **Shared locks**: Multiple agents can read

### Configuration

```typescript
interface OrchestrationConfig {
  mode: "swarm" | "pipeline" | "parallel";
  maxConcurrentAgents: number; // 3
  agentTimeoutMinutes: number; // 30
  enableFileLocking: boolean; // true
  conflictResolution: "last-write-wins" | "merge" | "manual";
  autoMerge: boolean; // true
  requireAllSuccess: boolean; // false
  maxTotalAgents: number; // 10
  sessionTimeoutMinutes: number; // 120
}
```

### Agent Roles

Pre-defined roles: `BACKEND`, `FRONTEND`, `TESTS`, `DOCS`, `INFRA`, `DATABASE`, `API`, `UI`

### Files

- `packages/shared/src/model/orchestration.ts` - Types and config
- `packages/shared/src/model/orchestration-db.ts` - Database operations
- `packages/daemon/src/orchestration/controller.ts` - Controller (42 tests)

---

## Phase 8: Usage Dashboard

**Purpose**: Track agent usage, costs, and analytics.

### Tracked Metrics

- Tasks (total, successful, failed)
- Token usage (input, output, cache)
- Estimated costs
- Duration
- Per-agent breakdown

### Model Pricing (per million tokens)

| Model            | Input  | Output | Cache Read | Cache Write |
| ---------------- | ------ | ------ | ---------- | ----------- |
| Claude Opus 4.5  | $15.00 | $75.00 | $1.50      | $18.75      |
| Claude Sonnet 4  | $3.00  | $15.00 | $0.30      | $3.75       |
| Claude Haiku 3.5 | $1.00  | $5.00  | $0.10      | $1.25       |
| GPT-4o           | $5.00  | $15.00 | -          | -           |
| GPT-4o Mini      | $0.15  | $0.60  | -          | -           |
| Gemini 2.5 Pro   | $1.25  | $5.00  | -          | -           |

### Cost Limits

```typescript
interface CostLimits {
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
  alertThresholdPercent: number; // 80
}
```

### Helper Functions

- `calculateCost()` - Compute cost from token usage
- `aggregateByWeek()` - Weekly usage summaries
- `aggregateByAgent()` - Per-agent breakdowns
- `formatNumber()` - K/M/B formatting

### Files

- `packages/shared/src/model/usage-tracker.ts` - Cost calculation
- `packages/shared/src/model/usage-dashboard.ts` - Dashboard types
- `apps/www/src/components/dashboard/usage-dashboard.tsx` - Dashboard UI
- `apps/www/src/components/settings/cost-limits-settings.tsx` - Limit settings

---

## Phase 9: Session Continuity

**Purpose**: Save and restore session state for seamless continuation and agent handoffs.

### Checkpoint Types

| Type      | Description                 |
| --------- | --------------------------- |
| `auto`    | Automatic periodic saves    |
| `manual`  | User-triggered saves        |
| `error`   | Saved on error for recovery |
| `handoff` | Saved before agent transfer |

### Session State

```typescript
interface SessionState {
  // Thread info
  threadId: string;
  chatId: string;
  messageCount: number;

  // Agent state
  agent: AIAgent;
  model: string;

  // Context
  conversationSummary?: string;
  keyTopics: string[];
  workingFiles: string[];

  // Tool state
  toolHistory: ToolHistoryEntry[];

  // Git state
  gitBranch?: string;
  hasUncommittedChanges: boolean;

  // Plan state (if applicable)
  hasPlan: boolean;
  planPhase?: number;
  planStep?: number;
}
```

### Agent Handoff

Transfer context between agents:

1. Create checkpoint with current state
2. Record handoff with reason
3. Build handoff prompt for new agent
4. Resume with full context

### Configuration

```typescript
interface CheckpointConfig {
  autoCheckpointEnabled: boolean; // true
  autoCheckpointIntervalMinutes: number; // 15
  checkpointOnToolComplete: boolean; // false
  checkpointOnError: boolean; // true
  maxCheckpointsPerSession: number; // 50
  retentionDays: number; // 30
}
```

### Files

- `packages/shared/src/model/session-state.ts` - State types
- `packages/shared/src/model/session-state-db.ts` - Database operations

---

## Phase 10: MCP Self-Extension

**Purpose**: Allow agents to create custom MCP tools dynamically.

### Tool Definition

```typescript
interface ToolDefinition {
  name: string; // Lowercase, letters/numbers/underscores
  description: string; // 10-1000 characters
  category: ToolCategory; // "utility" | "integration" | "analysis" | "automation"
  inputSchema: JSONSchema; // JSON Schema for parameters
  outputSchema?: JSONSchema;
  implementation: string; // TypeScript or Python code
  runtime: "typescript" | "python";
  examples?: ToolExample[];
  dependencies?: string[];
}
```

### Security Validation

Blocked patterns (to prevent dangerous operations):

**TypeScript:**

- `require('child_process')`, `require('fs')`
- `import ... from 'child_process'`, `import ... from 'fs'`
- `process.env`, `eval()`, `new Function()`
- `exec()`, `spawn()`, `__dirname`, `__filename`

**Python:**

- `import os`, `import subprocess`
- `exec()`, `eval()`, `open()`
- `os.system()`, `subprocess.run()`

### Tool Lifecycle

1. **Draft**: Agent creates tool
2. **Pending Review**: Awaiting user approval
3. **Approved**: Available for use
4. **Rejected**: Not approved
5. **Deprecated**: No longer active

### Execution Tracking

- Usage count
- Error count
- Last used timestamp
- Execution logs with input/output

### Files

- `packages/shared/src/model/custom-tools.ts` - Types and validation
- `packages/shared/src/model/custom-tools-db.ts` - Database operations

---

## Database Schema

All features are backed by PostgreSQL tables defined in `packages/shared/src/db/schema.ts`:

### Core Tables

- `user`, `session`, `account` - Authentication
- `thread`, `threadChat` - Conversations
- `environment` - Per-repo settings

### Feature Tables

| Phase | Tables                                                   |
| ----- | -------------------------------------------------------- |
| 1-2   | `prReview`, `automations`                                |
| 3     | `executionPlan`                                          |
| 6     | `autonomousExecution`                                    |
| 7     | `orchestrationSession`, `orchestrationAgent`, `fileLock` |
| 8     | `dailyUsageStats`, `userCostLimit`                       |
| 9     | `sessionCheckpoint`, `agentHandoff`                      |
| 10    | `customTool`, `toolExecutionLog`                         |

---

## Testing

Run all tests:

```bash
pnpm test
```

Run specific feature tests:

```bash
# Autonomous controller (26 tests)
pnpm vitest run src/autonomous/controller.test.ts

# Orchestration controller (42 tests)
pnpm vitest run src/orchestration/controller.test.ts
```

TypeScript check:

```bash
pnpm run tsc-check
```
