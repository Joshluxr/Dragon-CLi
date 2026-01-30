# Phase 7: Multi-Agent Orchestration

**Status**: Pending
**Priority**: 7
**Effort**: High

---

## Overview

Enable coordinated parallel execution of multiple agents:

1. Swarm mode: Multiple agents working on related subtasks
2. Pipeline mode: Sequential agent chains with handoff
3. File ownership: Prevent conflicts via file locking
4. Merge strategy: Coordinate changes before commit
5. Real-time coordination via PartyKit

---

## How It Works

```
1. User creates complex task requiring multiple agents
2. System (or agent) decomposes task into subtasks
3. Subtasks assigned to parallel agents with:
   a. Isolated workspaces or file boundaries
   b. Coordination protocol
   c. Merge strategy
4. Agents execute in parallel
5. Orchestrator monitors progress, handles conflicts
6. Changes merged and committed
7. Combined result returned to user
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

```typescript
// Orchestration session
export const orchestrationSessionTable = pgTable("orchestration_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentThreadId: uuid("parent_thread_id").references(() => threadTable.id),
  userId: uuid("user_id").references(() => userTable.id),
  mode: text("mode").$type<"swarm" | "pipeline" | "parallel">(),
  status: text("status").$type<
    "planning" | "running" | "merging" | "completed" | "failed"
  >(),
  config: jsonb("config").$type<OrchestrationConfig>(),
  taskDecomposition: jsonb("task_decomposition").$type<TaskDecomposition>(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Individual agent assignments
export const orchestrationAgentTable = pgTable("orchestration_agent", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => orchestrationSessionTable.id),
  threadId: uuid("thread_id").references(() => threadTable.id),
  role: text("role"), // e.g., "backend", "frontend", "tests"
  task: text("task"),
  ownedFiles: jsonb("owned_files").$type<string[]>(),
  dependencies: jsonb("dependencies").$type<string[]>(), // Agent IDs this depends on
  status: text("status").$type<
    "pending" | "running" | "completed" | "failed" | "blocked"
  >(),
  order: integer("order"), // For pipeline mode
  result: jsonb("result").$type<AgentResult>(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// File locks for conflict prevention
export const fileLockTable = pgTable("file_lock", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => orchestrationSessionTable.id),
  agentId: uuid("agent_id").references(() => orchestrationAgentTable.id),
  filePath: text("file_path").notNull(),
  lockType: text("lock_type").$type<"exclusive" | "shared">(),
  acquiredAt: timestamp("acquired_at").defaultNow(),
  releasedAt: timestamp("released_at"),
});
```

### 2. Orchestration Types

```typescript
// packages/shared/src/model/orchestration.ts

export interface OrchestrationConfig {
  mode: "swarm" | "pipeline" | "parallel";

  // Parallelism
  maxConcurrentAgents: number;
  agentTimeout: number; // minutes

  // File handling
  enableFileLocking: boolean;
  conflictResolution: "last-write-wins" | "merge" | "manual";

  // Coordination
  enableRealTimeSync: boolean;
  syncIntervalSeconds: number;

  // Merge
  autoMerge: boolean;
  requireAllSuccess: boolean;
}

export interface TaskDecomposition {
  originalTask: string;
  subtasks: SubTask[];
  dependencies: DependencyGraph;
}

export interface SubTask {
  id: string;
  title: string;
  description: string;
  role: string;
  estimatedDuration: number; // minutes
  files: string[]; // Files this task may touch
  inputs: string[]; // Required inputs from other tasks
  outputs: string[]; // Outputs this task produces
}

export interface DependencyGraph {
  nodes: string[]; // SubTask IDs
  edges: { from: string; to: string }[];
}

export interface AgentResult {
  success: boolean;
  filesModified: string[];
  output: string;
  prNumber?: number;
  error?: string;
}
```

### 3. Orchestration Controller

```typescript
// packages/daemon/src/orchestration/controller.ts

export class OrchestrationController {
  private session: OrchestrationSession;
  private agents: Map<string, OrchestrationAgent> = new Map();
  private partySocket: PartySocket;

  constructor(session: OrchestrationSession) {
    this.session = session;
    this.partySocket = new PartySocket({
      host: PARTYKIT_HOST,
      room: `orchestration:${session.id}`,
    });
  }

  async start(): Promise<void> {
    // Load agents
    const agents = await db.query.orchestrationAgentTable.findMany({
      where: eq(orchestrationAgentTable.sessionId, this.session.id),
    });

    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }

    // Start based on mode
    switch (this.session.mode) {
      case "swarm":
        await this.runSwarmMode();
        break;
      case "pipeline":
        await this.runPipelineMode();
        break;
      case "parallel":
        await this.runParallelMode();
        break;
    }
  }

  async runSwarmMode(): Promise<void> {
    // All agents start simultaneously with file ownership
    const runnableAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === "pending",
    );

    // Acquire file locks
    for (const agent of runnableAgents) {
      await this.acquireFileLocks(agent);
    }

    // Start all agents in parallel
    await Promise.all(runnableAgents.map((agent) => this.runAgent(agent)));

    // Merge results
    await this.mergeResults();
  }

  async runPipelineMode(): Promise<void> {
    // Agents run sequentially based on order
    const orderedAgents = Array.from(this.agents.values()).sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    for (const agent of orderedAgents) {
      // Wait for dependencies
      await this.waitForDependencies(agent);

      // Pass outputs from previous agents as context
      const context = await this.gatherDependencyOutputs(agent);

      await this.runAgent(agent, context);

      if (agent.status === "failed" && this.session.config.requireAllSuccess) {
        throw new Error(`Pipeline failed at agent ${agent.role}`);
      }
    }
  }

  async runParallelMode(): Promise<void> {
    // Run agents respecting dependency graph
    const graph = this.session.taskDecomposition.dependencies;
    const completed = new Set<string>();

    while (completed.size < this.agents.size) {
      // Find agents with all dependencies satisfied
      const runnable = Array.from(this.agents.values()).filter((agent) => {
        if (agent.status !== "pending") return false;
        const deps = agent.dependencies || [];
        return deps.every((depId) => completed.has(depId));
      });

      if (runnable.length === 0) {
        // Check for deadlock
        const pending = Array.from(this.agents.values()).filter(
          (a) => a.status === "pending",
        );
        if (pending.length > 0) {
          throw new Error("Dependency deadlock detected");
        }
        break;
      }

      // Run batch with concurrency limit
      const batch = runnable.slice(0, this.session.config.maxConcurrentAgents);
      await Promise.all(batch.map((agent) => this.runAgent(agent)));

      // Mark completed
      for (const agent of batch) {
        if (agent.status === "completed") {
          completed.add(agent.id);
        }
      }
    }

    await this.mergeResults();
  }

  async runAgent(agent: OrchestrationAgent, context?: string): Promise<void> {
    // Update status
    await db
      .update(orchestrationAgentTable)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(orchestrationAgentTable.id, agent.id));

    // Broadcast status
    this.broadcast({ type: "agent_started", agentId: agent.id });

    try {
      // Build agent prompt
      const prompt = this.buildAgentPrompt(agent, context);

      // Create child thread
      const thread = await createThread({
        userId: this.session.userId,
        repoFullName: agent.repoFullName,
        initialMessage: prompt,
        parentThreadId: this.session.parentThreadId,
        metadata: {
          orchestrationSessionId: this.session.id,
          orchestrationAgentId: agent.id,
          role: agent.role,
        },
      });

      // Wait for completion
      const result = await this.waitForThreadCompletion(thread.id);

      // Update agent status
      await db
        .update(orchestrationAgentTable)
        .set({
          status: result.success ? "completed" : "failed",
          result,
          completedAt: new Date(),
        })
        .where(eq(orchestrationAgentTable.id, agent.id));

      this.broadcast({
        type: "agent_completed",
        agentId: agent.id,
        success: result.success,
      });
    } catch (error) {
      await db
        .update(orchestrationAgentTable)
        .set({
          status: "failed",
          result: { success: false, error: error.message },
          completedAt: new Date(),
        })
        .where(eq(orchestrationAgentTable.id, agent.id));

      this.broadcast({
        type: "agent_failed",
        agentId: agent.id,
        error: error.message,
      });
    }
  }

  async acquireFileLocks(agent: OrchestrationAgent): Promise<void> {
    if (!this.session.config.enableFileLocking) return;

    for (const file of agent.ownedFiles || []) {
      // Check for existing locks
      const existingLock = await db.query.fileLockTable.findFirst({
        where: and(
          eq(fileLockTable.sessionId, this.session.id),
          eq(fileLockTable.filePath, file),
          isNull(fileLockTable.releasedAt),
        ),
      });

      if (existingLock && existingLock.agentId !== agent.id) {
        throw new Error(`File ${file} already locked by another agent`);
      }

      // Acquire lock
      await db.insert(fileLockTable).values({
        sessionId: this.session.id,
        agentId: agent.id,
        filePath: file,
        lockType: "exclusive",
      });
    }
  }

  async mergeResults(): Promise<void> {
    if (!this.session.config.autoMerge) return;

    const completedAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === "completed",
    );

    // Collect all modified files
    const allModified = new Set<string>();
    for (const agent of completedAgents) {
      for (const file of agent.result?.filesModified || []) {
        allModified.add(file);
      }
    }

    // Check for conflicts
    const conflicts = await this.detectConflicts(completedAgents);

    if (conflicts.length > 0) {
      if (this.session.config.conflictResolution === "manual") {
        await this.requestManualResolution(conflicts);
        return;
      } else if (this.session.config.conflictResolution === "merge") {
        await this.autoMergeConflicts(conflicts);
      }
      // last-write-wins: just proceed
    }

    // Create combined commit
    await this.createCombinedCommit(completedAgents);
  }

  buildAgentPrompt(agent: OrchestrationAgent, context?: string): string {
    let prompt = `
## Orchestrated Task: ${agent.role}

You are part of a multi-agent orchestration. Your specific role is: **${agent.role}**

### Your Task:
${agent.task}

### File Ownership:
You are responsible for these files:
${(agent.ownedFiles || []).map((f) => `- ${f}`).join("\n")}

**Important**: Only modify files in your ownership. Do not modify other files.

`;

    if (context) {
      prompt += `
### Context from Previous Agents:
${context}

`;
    }

    prompt += `
### Coordination Protocol:
1. Only work on your assigned task
2. Only modify your owned files
3. When complete, clearly state "AGENT_TASK_COMPLETE"
4. Report any blockers immediately

### Output Format:
When done, summarize:
- Files modified
- Changes made
- Any issues encountered
`;

    return prompt;
  }

  broadcast(message: object): void {
    this.partySocket.send(JSON.stringify(message));
  }
}
```

### 4. Task Decomposition Service

```typescript
// packages/daemon/src/orchestration/decomposer.ts

export async function decomposeTask(
  task: string,
  repoInfo: RepoInfo,
): Promise<TaskDecomposition> {
  // Use Claude to analyze and decompose the task
  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `
Analyze this development task and decompose it into parallel subtasks:

Task: ${task}

Repository Structure:
${repoInfo.structure}

Technology Stack:
${repoInfo.techStack.join(", ")}

Decompose into subtasks that can be executed by parallel agents. Consider:
1. Backend vs Frontend separation
2. Test writing as separate task
3. Documentation updates
4. File dependencies

Output as JSON:
{
  "subtasks": [
    {
      "id": "unique-id",
      "title": "Task title",
      "description": "What to do",
      "role": "backend|frontend|tests|docs|infra",
      "estimatedDuration": 15,
      "files": ["src/file1.ts", "src/file2.ts"],
      "inputs": [],
      "outputs": ["api-endpoint-ready"]
    }
  ],
  "dependencies": {
    "nodes": ["id1", "id2"],
    "edges": [{ "from": "id1", "to": "id2" }]
  }
}
`,
      },
    ],
  });

  const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse task decomposition");

  return JSON.parse(jsonMatch[0]);
}
```

### 5. Orchestration UI

```typescript
// apps/www/src/components/orchestration/orchestration-view.tsx

export function OrchestrationView({ sessionId }: Props) {
  const session = useOrchestrationSession(sessionId);
  const agents = useOrchestrationAgents(sessionId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Multi-Agent Orchestration</CardTitle>
            <Badge>{session.mode.toUpperCase()}</Badge>
          </div>
          <CardDescription>
            {session.taskDecomposition.originalTask}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>

      {/* Dependency Graph Visualization */}
      {session.mode === "parallel" && (
        <Card>
          <CardHeader>
            <CardTitle>Dependency Graph</CardTitle>
          </CardHeader>
          <CardContent>
            <DependencyGraph
              nodes={agents}
              edges={session.taskDecomposition.dependencies.edges}
            />
          </CardContent>
        </Card>
      )}

      {/* File Ownership Map */}
      <Card>
        <CardHeader>
          <CardTitle>File Ownership</CardTitle>
        </CardHeader>
        <CardContent>
          <FileOwnershipMap agents={agents} />
        </CardContent>
      </Card>

      {/* Live Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <OrchestrationActivityFeed sessionId={sessionId} />
        </CardContent>
      </Card>
    </div>
  );
}

function AgentCard({ agent }: { agent: OrchestrationAgent }) {
  return (
    <Card className={cn(
      "transition-all",
      agent.status === "running" && "ring-2 ring-blue-500",
      agent.status === "completed" && "bg-green-50",
      agent.status === "failed" && "bg-red-50",
    )}>
      <CardHeader>
        <div className="flex justify-between">
          <Badge variant="outline">{agent.role}</Badge>
          <AgentStatusBadge status={agent.status} />
        </div>
        <CardTitle className="text-lg">{agent.task.slice(0, 50)}...</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm space-y-2">
          <div>
            <span className="text-muted-foreground">Files: </span>
            {agent.ownedFiles?.length || 0}
          </div>
          {agent.status === "running" && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Working...</span>
            </div>
          )}
          {agent.threadId && (
            <Link href={`/thread/${agent.threadId}`} className="text-blue-500">
              View Details →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Testing Strategy

```typescript
describe("Multi-Agent Orchestration", () => {
  it("decomposes task into subtasks", async () => {
    const decomposition = await decomposeTask(
      "Add user authentication with login page",
      mockRepoInfo,
    );
    expect(decomposition.subtasks.length).toBeGreaterThan(1);
    expect(decomposition.subtasks.some((s) => s.role === "backend")).toBe(true);
    expect(decomposition.subtasks.some((s) => s.role === "frontend")).toBe(
      true,
    );
  });

  it("runs agents in parallel", async () => {
    const session = await createOrchestrationSession({
      mode: "parallel",
      config: defaultConfig,
    });
    const controller = new OrchestrationController(session);

    const startTimes: number[] = [];
    // Mock agent runs to track concurrency
    vi.spyOn(controller, "runAgent").mockImplementation(async () => {
      startTimes.push(Date.now());
      await sleep(100);
    });

    await controller.start();

    // Verify parallel execution
    const timeDiffs = startTimes.slice(1).map((t, i) => t - startTimes[i]);
    expect(timeDiffs.some((d) => d < 50)).toBe(true); // Some started nearly simultaneously
  });

  it("respects dependencies in parallel mode", async () => {
    const session = await createOrchestrationSession({
      mode: "parallel",
      taskDecomposition: {
        subtasks: [
          { id: "a", role: "backend", dependencies: [] },
          { id: "b", role: "frontend", dependencies: ["a"] },
        ],
        dependencies: { nodes: ["a", "b"], edges: [{ from: "a", to: "b" }] },
      },
    });

    const order: string[] = [];
    vi.spyOn(controller, "runAgent").mockImplementation(async (agent) => {
      order.push(agent.id);
    });

    await controller.start();
    expect(order[0]).toBe("a");
    expect(order[1]).toBe("b");
  });

  it("prevents file conflicts with locking", async () => {
    const session = await createOrchestrationSession({
      config: { enableFileLocking: true },
    });

    await controller.acquireFileLocks(agent1);
    await expect(
      controller.acquireFileLocks(agent2WithSameFile),
    ).rejects.toThrow("already locked");
  });
});
```

---

## Security Considerations

- Limit max concurrent agents per user
- Isolate agent sandboxes
- Validate file ownership boundaries
- Rate limit orchestration session creation
- Timeout stuck agents
- Clean up orphaned locks
