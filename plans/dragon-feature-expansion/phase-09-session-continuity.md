# Phase 9: Session Continuity

**Status**: Pending
**Priority**: 9
**Effort**: Medium

---

## Overview

Enable seamless session continuity and cross-agent handoff:

1. Checkpoint auto-save at key moments
2. Full session state serialization
3. Cross-agent context transfer
4. Resume from any checkpoint
5. Session history search

---

## How It Works

```
1. System creates checkpoints at key moments:
   a. After each tool completion
   b. Before long operations
   c. On user request
   d. Periodically (configurable)
2. Checkpoints stored in R2 with metadata in DB
3. Sessions can resume from any checkpoint
4. Context can be transferred to new agent
5. Users can search/browse session history
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

```typescript
// Session checkpoints
export const sessionCheckpointTable = pgTable("session_checkpoint", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").references(() => threadTable.id),
  chatId: uuid("chat_id").references(() => threadChatTable.id),

  // Checkpoint metadata
  name: text("name"),
  description: text("description"),
  type: text("type").$type<"auto" | "manual" | "error" | "handoff">(),

  // State reference
  stateKey: text("state_key").notNull(), // R2 key for full state
  stateSize: integer("state_size"), // bytes

  // Context summary (for quick preview)
  contextSummary: text("context_summary"),
  messageCount: integer("message_count"),

  // Agent info
  agent: text("agent").$type<AgentType>(),
  model: text("model"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),

  // Indexing for search
  searchVector: text("search_vector"), // tsvector for full-text search
});

// Cross-agent handoff records
export const agentHandoffTable = pgTable("agent_handoff", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromThreadId: uuid("from_thread_id").references(() => threadTable.id),
  toThreadId: uuid("to_thread_id").references(() => threadTable.id),
  fromAgent: text("from_agent").$type<AgentType>(),
  toAgent: text("to_agent").$type<AgentType>(),
  checkpointId: uuid("checkpoint_id").references(
    () => sessionCheckpointTable.id,
  ),
  reason: text("reason"),
  context: text("context"), // Handoff context/instructions
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 2. Session State Types

```typescript
// packages/shared/src/model/session-state.ts

export interface SessionState {
  version: string;
  timestamp: number;

  // Thread info
  threadId: string;
  chatId: string;
  userId: string;

  // Messages
  messages: DBMessage[];
  queuedMessages: DBUserMessage[];

  // Agent state
  agent: AgentType;
  model: string;
  systemPrompt: string;

  // Conversation context
  conversationSummary?: string;
  keyTopics: string[];
  workingFiles: string[];

  // Tool state
  pendingToolCalls: DBToolCall[];
  toolHistory: ToolHistoryEntry[];

  // MCP state
  mcpServers: string[];
  mcpContext?: Record<string, unknown>;

  // Git state
  gitBranch?: string;
  gitDiff?: string;
  uncommittedChanges?: string[];

  // Execution plan (if in plan mode)
  executionPlan?: ExecutionPlan;
  planProgress?: { phase: number; step: number };

  // Custom context
  customContext?: Record<string, unknown>;
}

export interface ToolHistoryEntry {
  toolName: string;
  timestamp: number;
  success: boolean;
  summary?: string;
}

export interface CheckpointMetadata {
  id: string;
  name: string;
  description: string;
  type: "auto" | "manual" | "error" | "handoff";
  createdAt: number;
  messageCount: number;
  contextSummary: string;
  agent: AgentType;
}
```

### 3. Checkpoint Service

```typescript
// packages/shared/src/services/checkpoint-service.ts

import { r2Client } from "@dragon/r2";

const CHECKPOINT_BUCKET = "session-checkpoints";

export async function createCheckpoint(
  threadId: string,
  chatId: string,
  options: {
    name?: string;
    description?: string;
    type: "auto" | "manual" | "error" | "handoff";
  },
): Promise<string> {
  // Gather session state
  const state = await gatherSessionState(threadId, chatId);

  // Generate context summary
  const contextSummary = await generateContextSummary(state);

  // Upload to R2
  const stateKey = `checkpoints/${threadId}/${chatId}/${Date.now()}.json`;
  const stateJson = JSON.stringify(state);

  await r2Client.put(CHECKPOINT_BUCKET, stateKey, stateJson);

  // Save metadata to DB
  const checkpoint = await db
    .insert(sessionCheckpointTable)
    .values({
      threadId,
      chatId,
      name: options.name || `Checkpoint ${new Date().toISOString()}`,
      description: options.description,
      type: options.type,
      stateKey,
      stateSize: stateJson.length,
      contextSummary,
      messageCount: state.messages.length,
      agent: state.agent,
      model: state.model,
      searchVector: generateSearchVector(state),
    })
    .returning();

  return checkpoint[0].id;
}

async function gatherSessionState(
  threadId: string,
  chatId: string,
): Promise<SessionState> {
  const thread = await db.query.threadTable.findFirst({
    where: eq(threadTable.id, threadId),
  });

  const chat = await db.query.threadChatTable.findFirst({
    where: eq(threadChatTable.id, chatId),
  });

  if (!thread || !chat) {
    throw new Error("Thread or chat not found");
  }

  // Get git state from sandbox if available
  let gitState = {};
  if (thread.sandboxId) {
    gitState = await getGitStateFromSandbox(thread.sandboxId);
  }

  // Extract key topics from messages
  const keyTopics = extractKeyTopics(chat.messages);

  // Get working files from tool calls
  const workingFiles = extractWorkingFiles(chat.messages);

  return {
    version: "1.0",
    timestamp: Date.now(),
    threadId,
    chatId,
    userId: thread.userId,
    messages: chat.messages,
    queuedMessages: chat.queuedMessages || [],
    agent: chat.agent || "claudeCode",
    model: chat.model || "claude-sonnet-4-20250514",
    systemPrompt: chat.systemPrompt || "",
    keyTopics,
    workingFiles,
    pendingToolCalls: extractPendingToolCalls(chat.messages),
    toolHistory: extractToolHistory(chat.messages),
    mcpServers: chat.mcpServers || [],
    ...gitState,
  };
}

async function generateContextSummary(state: SessionState): Promise<string> {
  // Use a fast model to generate a summary
  const response = await claude.messages.create({
    model: "claude-haiku-3-5-20241022",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Summarize this conversation state in 2-3 sentences. Focus on: what task was being worked on, current progress, and key decisions made.

Messages: ${state.messages
          .slice(-10)
          .map((m) =>
            m.type === "user"
              ? `User: ${truncate(m.content, 100)}`
              : m.type === "assistant"
                ? `Assistant: ${truncate(m.content, 100)}`
                : "",
          )
          .join("\n")}

Key topics: ${state.keyTopics.join(", ")}
Working files: ${state.workingFiles.slice(0, 5).join(", ")}`,
      },
    ],
  });

  return response.content[0].text;
}

export async function loadCheckpoint(
  checkpointId: string,
): Promise<SessionState> {
  const checkpoint = await db.query.sessionCheckpointTable.findFirst({
    where: eq(sessionCheckpointTable.id, checkpointId),
  });

  if (!checkpoint) {
    throw new Error("Checkpoint not found");
  }

  const stateJson = await r2Client.get(CHECKPOINT_BUCKET, checkpoint.stateKey);
  return JSON.parse(stateJson);
}

export async function resumeFromCheckpoint(
  checkpointId: string,
  options?: {
    newAgent?: AgentType;
    additionalContext?: string;
  },
): Promise<{ threadId: string; chatId: string }> {
  const state = await loadCheckpoint(checkpointId);

  // Create new chat in the same thread
  const newChat = await db
    .insert(threadChatTable)
    .values({
      threadId: state.threadId,
      messages: state.messages,
      queuedMessages: state.queuedMessages,
      agent: options?.newAgent || state.agent,
      model: state.model,
      status: "ready",
      resumedFromCheckpoint: checkpointId,
    })
    .returning();

  // If switching agents, create handoff record
  if (options?.newAgent && options.newAgent !== state.agent) {
    await db.insert(agentHandoffTable).values({
      fromThreadId: state.threadId,
      toThreadId: state.threadId,
      fromAgent: state.agent,
      toAgent: options.newAgent,
      checkpointId,
      context: options.additionalContext,
    });
  }

  return {
    threadId: state.threadId,
    chatId: newChat[0].id,
  };
}
```

### 4. Cross-Agent Handoff Service

```typescript
// packages/shared/src/services/handoff-service.ts

export async function initiateHandoff(
  fromThreadId: string,
  fromChatId: string,
  options: {
    toAgent: AgentType;
    reason: string;
    context: string;
  },
): Promise<{ newThreadId: string; newChatId: string }> {
  // Create checkpoint of current state
  const checkpointId = await createCheckpoint(fromThreadId, fromChatId, {
    type: "handoff",
    name: `Handoff to ${options.toAgent}`,
    description: options.reason,
  });

  const state = await loadCheckpoint(checkpointId);

  // Build handoff context
  const handoffPrompt = `
## Agent Handoff

You are receiving a handoff from a previous agent. Here's the context:

### Previous Work Summary
${state.conversationSummary || "No summary available"}

### Key Topics
${state.keyTopics.join(", ")}

### Files Being Worked On
${state.workingFiles.join("\n")}

### Handoff Reason
${options.reason}

### Additional Context
${options.context}

### Recent Conversation
${state.messages
  .slice(-5)
  .map((m) => formatMessage(m))
  .join("\n\n")}

---

Please continue the work from where the previous agent left off.
`;

  // Create new thread for the new agent
  const newThread = await createThread({
    userId: state.userId,
    repoFullName: state.repoFullName,
    initialMessage: handoffPrompt,
    parentThreadId: fromThreadId,
    agent: options.toAgent,
    metadata: {
      handoffFrom: fromThreadId,
      handoffCheckpoint: checkpointId,
    },
  });

  // Record handoff
  await db.insert(agentHandoffTable).values({
    fromThreadId,
    toThreadId: newThread.id,
    fromAgent: state.agent,
    toAgent: options.toAgent,
    checkpointId,
    reason: options.reason,
    context: options.context,
  });

  return {
    newThreadId: newThread.id,
    newChatId: newThread.chatId,
  };
}

export async function getHandoffChain(
  threadId: string,
): Promise<HandoffChainEntry[]> {
  const handoffs = await db.query.agentHandoffTable.findMany({
    where: or(
      eq(agentHandoffTable.fromThreadId, threadId),
      eq(agentHandoffTable.toThreadId, threadId),
    ),
    orderBy: [asc(agentHandoffTable.createdAt)],
  });

  // Build chain
  const chain: HandoffChainEntry[] = [];
  let currentId = threadId;

  // Find root
  const fromHandoffs = handoffs.filter((h) => h.toThreadId === currentId);
  if (fromHandoffs.length > 0) {
    currentId = fromHandoffs[0].fromThreadId;
  }

  // Walk forward
  while (true) {
    const next = handoffs.find((h) => h.fromThreadId === currentId);
    if (!next) break;

    chain.push({
      fromThreadId: next.fromThreadId,
      toThreadId: next.toThreadId,
      fromAgent: next.fromAgent,
      toAgent: next.toAgent,
      reason: next.reason,
      createdAt: next.createdAt,
    });

    currentId = next.toThreadId;
  }

  return chain;
}
```

### 5. Checkpoint UI Components

```typescript
// apps/www/src/components/session/checkpoint-manager.tsx

export function CheckpointManager({ threadId, chatId }: Props) {
  const { data: checkpoints, mutate } = useCheckpoints(threadId, chatId);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createCheckpoint(threadId, chatId, {
        type: "manual",
        name: `Manual checkpoint`,
      });
      mutate();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Checkpoints
          </CardTitle>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            Create Checkpoint
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {checkpoints.map(checkpoint => (
            <CheckpointCard
              key={checkpoint.id}
              checkpoint={checkpoint}
              onResume={() => handleResume(checkpoint.id)}
              onHandoff={() => openHandoffDialog(checkpoint.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckpointCard({ checkpoint, onResume, onHandoff }: CheckpointCardProps) {
  return (
    <div className="border rounded-lg p-3 hover:bg-muted/50 transition">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <CheckpointTypeBadge type={checkpoint.type} />
            <span className="font-medium">{checkpoint.name}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {checkpoint.contextSummary}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground mt-2">
            <span>{checkpoint.messageCount} messages</span>
            <span>{formatBytes(checkpoint.stateSize)}</span>
            <span>{formatRelativeTime(checkpoint.createdAt)}</span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onResume}>
              <Play className="h-4 w-4 mr-2" />
              Resume from here
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onHandoff}>
              <ArrowRight className="h-4 w-4 mr-2" />
              Handoff to another agent
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

### 6. Handoff Dialog

```typescript
// apps/www/src/components/session/handoff-dialog.tsx

export function HandoffDialog({ checkpointId, onClose }: Props) {
  const [agent, setAgent] = useState<AgentType>("claudeCode");
  const [reason, setReason] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);

  const handleHandoff = async () => {
    setLoading(true);
    try {
      const result = await initiateHandoff(checkpointId, {
        toAgent: agent,
        reason,
        context,
      });
      router.push(`/thread/${result.newThreadId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Handoff to Another Agent</DialogTitle>
          <DialogDescription>
            Transfer the current session context to a different agent
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Target Agent</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claudeCode">Claude Code</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="codex">Codex</SelectItem>
                <SelectItem value="amp">Amp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Reason for Handoff</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Need Codex for better test generation"
            />
          </div>

          <div>
            <Label>Additional Context (optional)</Label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Any specific instructions for the new agent..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleHandoff} disabled={loading || !reason}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            Initiate Handoff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 7. Session Search

```typescript
// apps/www/src/components/session/session-search.tsx

export function SessionSearch() {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useSessionSearch(query);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search past sessions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button variant="outline">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {isLoading && <Skeleton className="h-20" />}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map(result => (
            <SessionSearchResult key={result.id} result={result} />
          ))}
        </div>
      )}

      {results && results.length === 0 && query && (
        <p className="text-center text-muted-foreground py-8">
          No sessions found matching "{query}"
        </p>
      )}
    </div>
  );
}
```

---

## Testing Strategy

```typescript
describe("Session Continuity", () => {
  it("creates checkpoint with full state", async () => {
    const checkpointId = await createCheckpoint(threadId, chatId, {
      type: "manual",
      name: "Test checkpoint",
    });

    const state = await loadCheckpoint(checkpointId);
    expect(state.messages.length).toBeGreaterThan(0);
    expect(state.keyTopics).toBeDefined();
    expect(state.workingFiles).toBeDefined();
  });

  it("resumes from checkpoint correctly", async () => {
    const checkpointId = await createCheckpoint(threadId, chatId, {
      type: "manual",
    });

    const { chatId: newChatId } = await resumeFromCheckpoint(checkpointId);

    const newChat = await db.query.threadChatTable.findFirst({
      where: eq(threadChatTable.id, newChatId),
    });

    expect(newChat.resumedFromCheckpoint).toBe(checkpointId);
  });

  it("handles cross-agent handoff", async () => {
    const { newThreadId } = await initiateHandoff(threadId, chatId, {
      toAgent: "gemini",
      reason: "Test handoff",
      context: "Additional context",
    });

    const handoff = await db.query.agentHandoffTable.findFirst({
      where: eq(agentHandoffTable.toThreadId, newThreadId),
    });

    expect(handoff.fromAgent).toBe("claudeCode");
    expect(handoff.toAgent).toBe("gemini");
  });

  it("generates accurate context summary", async () => {
    const state = await gatherSessionState(threadId, chatId);
    const summary = await generateContextSummary(state);

    expect(summary.length).toBeGreaterThan(50);
    expect(summary.length).toBeLessThan(500);
  });
});
```

---

## Security Considerations

- Encrypt checkpoint state in R2
- Verify user ownership before resume
- Rate limit checkpoint creation
- Auto-expire old checkpoints (configurable retention)
- Audit log for handoffs
