# Terragon-OSS Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for 10 key features identified from the Open-Inspect (background-agents) codebase review. Each feature includes database schema changes, code modifications, configuration options, and testing strategies.

---

## Feature 1: Sandbox Pre-warming and Warm Pools

### Overview

Pre-create sandboxes before user requests to eliminate cold start latency (typically 30-60s).

### Database Schema Changes

```sql
-- packages/shared/src/db/schema.ts

-- New table: warm_sandbox_pool
export const warmSandboxPool = pgTable("warm_sandbox_pool", {
  id: text("id").primaryKey(),
  sandboxId: text("sandbox_id").notNull(),
  provider: text("provider").notNull(), -- 'e2b' | 'daytona'
  size: text("size").notNull(), -- 'small' | 'medium' | 'large'
  status: text("status").notNull().default("warming"), -- 'warming' | 'ready' | 'claimed' | 'expired'
  templateId: text("template_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readyAt: timestamp("ready_at"),
  claimedAt: timestamp("claimed_at"),
  claimedByUserId: text("claimed_by_user_id").references(() => users.id),
  claimedByThreadId: text("claimed_by_thread_id").references(() => thread.id),
  expiresAt: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"),
});

-- New table: warm_pool_config
export const warmPoolConfig = pgTable("warm_pool_config", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  size: text("size").notNull(),
  targetCount: integer("target_count").notNull().default(2),
  maxCount: integer("max_count").notNull().default(5),
  ttlMinutes: integer("ttl_minutes").notNull().default(30),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### New Files

**packages/shared/src/model/warm-pool.ts**

```typescript
import { db } from "../db";
import { warmSandboxPool, warmPoolConfig } from "../db/schema";
import { eq, and, lt, sql } from "drizzle-orm";

export async function getAvailableWarmSandbox(
  db: DB,
  provider: string,
  size: string,
): Promise<WarmSandbox | null> {
  const [sandbox] = await db
    .update(warmSandboxPool)
    .set({ status: "claimed", claimedAt: new Date() })
    .where(
      and(
        eq(warmSandboxPool.provider, provider),
        eq(warmSandboxPool.size, size),
        eq(warmSandboxPool.status, "ready"),
        gt(warmSandboxPool.expiresAt, new Date()),
      ),
    )
    .returning()
    .limit(1);
  return sandbox ?? null;
}

export async function addWarmSandbox(db: DB, data: NewWarmSandbox) {
  return db.insert(warmSandboxPool).values(data).returning();
}

export async function getPoolConfig(db: DB, provider: string, size: string) {
  return db.query.warmPoolConfig.findFirst({
    where: and(
      eq(warmPoolConfig.provider, provider),
      eq(warmPoolConfig.size, size),
      eq(warmPoolConfig.enabled, true),
    ),
  });
}

export async function getPoolStats(db: DB) {
  return db
    .select({
      provider: warmSandboxPool.provider,
      size: warmSandboxPool.size,
      status: warmSandboxPool.status,
      count: sql<number>`count(*)`,
    })
    .from(warmSandboxPool)
    .groupBy(
      warmSandboxPool.provider,
      warmSandboxPool.size,
      warmSandboxPool.status,
    );
}
```

**packages/sandbox/src/warm-pool.ts**

```typescript
import {
  getAvailableWarmSandbox,
  addWarmSandbox,
  getPoolConfig,
} from "@terragon/shared/model/warm-pool";

export class WarmPoolManager {
  private replenishInterval: NodeJS.Timeout | null = null;

  async claimWarmSandbox(
    provider: string,
    size: string,
  ): Promise<string | null> {
    const sandbox = await getAvailableWarmSandbox(this.db, provider, size);
    if (sandbox) {
      return sandbox.sandboxId;
    }
    return null;
  }

  async replenishPool(): Promise<void> {
    const configs = await this.db.query.warmPoolConfig.findMany({
      where: eq(warmPoolConfig.enabled, true),
    });

    for (const config of configs) {
      const stats = await this.getPoolStatsForConfig(config);
      const deficit = config.targetCount - stats.readyCount;

      if (deficit > 0) {
        await this.createWarmSandboxes(config, Math.min(deficit, 2));
      }
    }
  }

  private async createWarmSandboxes(config: PoolConfig, count: number) {
    const promises = Array(count)
      .fill(null)
      .map(() => this.createSingleWarmSandbox(config));
    await Promise.allSettled(promises);
  }

  start(intervalMs = 30000) {
    this.replenishInterval = setInterval(
      () => this.replenishPool(),
      intervalMs,
    );
  }

  stop() {
    if (this.replenishInterval) {
      clearInterval(this.replenishInterval);
    }
  }
}
```

### Integration Points

**packages/sandbox/src/sandbox.ts** - Modify `getOrCreateSandbox`:

```typescript
export async function getOrCreateSandbox(options: CreateSandboxOptions) {
  // Try warm pool first
  if (options.useWarmPool !== false) {
    const warmSandboxId = await warmPoolManager.claimWarmSandbox(
      options.provider,
      options.size,
    );
    if (warmSandboxId) {
      const sandbox = await resumeSandbox(warmSandboxId, options);
      await setupClaimedWarmSandbox(sandbox, options);
      return sandbox;
    }
  }

  // Fall back to cold start
  return createSandboxCold(options);
}
```

### Configuration

**Environment Variables:**

```
WARM_POOL_ENABLED=true
WARM_POOL_REPLENISH_INTERVAL_MS=30000
WARM_POOL_DEFAULT_TTL_MINUTES=30
```

**Feature Flag:**

```typescript
// packages/shared/src/model/feature-flags-definitions.ts
warmPoolEnabled: {
  defaultValue: false,
  description: "Enable sandbox warm pool for reduced cold start latency",
  enabledForPreview: true,
}
```

### Testing Strategy

1. Unit tests for `WarmPoolManager` class
2. Integration tests for claim/replenish cycle
3. Load tests measuring cold start vs warm start latency
4. Cleanup tests verifying expired sandbox removal

---

## Feature 2: Filesystem Snapshots for Session Persistence

### Overview

Save and restore sandbox filesystem state across sessions for faster resume and state persistence.

### Database Schema Changes

```sql
-- Add to thread table
ALTER TABLE thread ADD COLUMN snapshot_id TEXT;
ALTER TABLE thread ADD COLUMN last_snapshot_at TIMESTAMP;
ALTER TABLE thread ADD COLUMN snapshot_size_bytes BIGINT;

-- New table: sandbox_snapshots
export const sandboxSnapshots = pgTable("sandbox_snapshots", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").references(() => thread.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  provider: text("provider").notNull(),
  snapshotRef: text("snapshot_ref").notNull(), -- Provider-specific reference
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  status: text("status").notNull().default("creating"), -- 'creating' | 'ready' | 'restoring' | 'failed' | 'deleted'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"), -- Git commit, branch, working directory state
});
```

### New Files

**packages/sandbox/src/snapshots.ts**

```typescript
export interface SnapshotManager {
  createSnapshot(
    sandboxId: string,
    metadata?: SnapshotMetadata,
  ): Promise<string>;
  restoreSnapshot(snapshotId: string): Promise<string>; // Returns new sandboxId
  deleteSnapshot(snapshotId: string): Promise<void>;
  listSnapshots(threadId: string): Promise<Snapshot[]>;
}

export class E2BSnapshotManager implements SnapshotManager {
  async createSnapshot(
    sandboxId: string,
    metadata?: SnapshotMetadata,
  ): Promise<string> {
    const sandbox = await Sandbox.resume(sandboxId);
    // E2B pause creates implicit snapshot
    await sandbox.pause();

    const snapshotId = generateSnapshotId();
    await db.insert(sandboxSnapshots).values({
      id: snapshotId,
      threadId: metadata?.threadId,
      userId: metadata?.userId,
      provider: "e2b",
      snapshotRef: sandboxId, // E2B uses sandboxId as snapshot ref
      status: "ready",
      metadata: {
        gitCommit: metadata?.gitCommit,
        branch: metadata?.branch,
        workingDir: metadata?.workingDir,
      },
    });

    return snapshotId;
  }

  async restoreSnapshot(snapshotId: string): Promise<string> {
    const snapshot = await db.query.sandboxSnapshots.findFirst({
      where: eq(sandboxSnapshots.id, snapshotId),
    });

    if (!snapshot) throw new Error("Snapshot not found");

    const sandbox = await Sandbox.resume(snapshot.snapshotRef);
    return sandbox.id;
  }
}

export class DaytonaSnapshotManager implements SnapshotManager {
  async createSnapshot(
    sandboxId: string,
    metadata?: SnapshotMetadata,
  ): Promise<string> {
    // Daytona has explicit snapshot API
    const response = await this.daytonaClient.createSnapshot(sandboxId);

    const snapshotId = generateSnapshotId();
    await db.insert(sandboxSnapshots).values({
      id: snapshotId,
      provider: "daytona",
      snapshotRef: response.snapshotId,
      status: "ready",
      ...metadata,
    });

    return snapshotId;
  }
}
```

### Server Actions

**apps/www/src/server-actions/snapshots.ts**

```typescript
"use server";

export async function createThreadSnapshot(threadId: string) {
  const user = await getCurrentUser();
  const thread = await getThread(threadId);

  if (!thread.sandboxId) {
    throw new Error("No active sandbox to snapshot");
  }

  const manager = getSnapshotManager(thread.sandboxProvider);
  const snapshotId = await manager.createSnapshot(thread.sandboxId, {
    threadId,
    userId: user.id,
    gitCommit: await getGitCommit(thread.sandboxId),
    branch: await getGitBranch(thread.sandboxId),
  });

  await db
    .update(thread)
    .set({
      snapshotId,
      lastSnapshotAt: new Date(),
    })
    .where(eq(thread.id, threadId));

  return snapshotId;
}

export async function restoreThreadFromSnapshot(
  threadId: string,
  snapshotId: string,
) {
  const manager = getSnapshotManager(snapshot.provider);
  const newSandboxId = await manager.restoreSnapshot(snapshotId);

  await db
    .update(thread)
    .set({
      sandboxId: newSandboxId,
      sandboxStatus: "running",
    })
    .where(eq(thread.id, threadId));

  return newSandboxId;
}
```

### UI Components

**apps/www/src/components/thread/snapshot-controls.tsx**

```typescript
export function SnapshotControls({ threadId }: { threadId: string }) {
  const { mutate: createSnapshot, isPending } = useCreateSnapshot();
  const { data: snapshots } = useThreadSnapshots(threadId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Camera className="h-4 w-4 mr-2" />
          Snapshots
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => createSnapshot(threadId)}>
          <Save className="h-4 w-4 mr-2" />
          Create Snapshot
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {snapshots?.map((snapshot) => (
          <DropdownMenuItem key={snapshot.id}>
            <Clock className="h-4 w-4 mr-2" />
            {formatDate(snapshot.createdAt)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Configuration

```
SNAPSHOT_ENABLED=true
SNAPSHOT_MAX_PER_THREAD=5
SNAPSHOT_RETENTION_DAYS=30
SNAPSHOT_AUTO_ON_HIBERNATE=true
```

---

## Feature 3: LLM-Powered Repository Classification

### Overview

Use AI to analyze repositories and classify them by type, tech stack, and complexity for better Slack integration and routing.

### Database Schema Changes

```sql
-- Add to environment table
ALTER TABLE environment ADD COLUMN classification JSONB;
ALTER TABLE environment ADD COLUMN classified_at TIMESTAMP;
ALTER TABLE environment ADD COLUMN classification_version INTEGER DEFAULT 1;

-- Classification JSONB structure:
-- {
--   "type": "web-app" | "api" | "cli" | "library" | "monorepo" | "mobile" | "infrastructure",
--   "primaryLanguage": "typescript",
--   "frameworks": ["next.js", "react", "tailwind"],
--   "hasTests": true,
--   "hasCi": true,
--   "complexity": "medium",
--   "description": "E-commerce platform built with Next.js",
--   "suggestedAgents": ["claudeCode", "gemini"],
--   "confidence": 0.92
-- }
```

### New Files

**apps/www/src/server-lib/classify-repository.ts**

```typescript
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const ClassificationSchema = z.object({
  type: z.enum([
    "web-app",
    "api",
    "cli",
    "library",
    "monorepo",
    "mobile",
    "infrastructure",
    "other",
  ]),
  primaryLanguage: z.string(),
  frameworks: z.array(z.string()),
  hasTests: z.boolean(),
  hasCi: z.boolean(),
  complexity: z.enum(["simple", "medium", "complex"]),
  description: z.string().max(200),
  suggestedAgents: z.array(z.enum(["claudeCode", "gemini", "codex", "amp"])),
  confidence: z.number().min(0).max(1),
});

export async function classifyRepository(
  repoInfo: RepoInfo,
): Promise<Classification> {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: ClassificationSchema,
    prompt: `Analyze this repository and classify it:

Repository: ${repoInfo.fullName}
Description: ${repoInfo.description}
Primary Language: ${repoInfo.language}
Topics: ${repoInfo.topics?.join(", ")}

File structure (sample):
${repoInfo.fileTree?.slice(0, 50).join("\n")}

Package.json dependencies (if available):
${JSON.stringify(repoInfo.packageJson?.dependencies, null, 2)?.slice(0, 1000)}

Classify the repository type, tech stack, and suggest appropriate AI agents.`,
  });

  return object;
}
```

**packages/shared/src/model/environment-classification.ts**

```typescript
export async function getOrClassifyEnvironment(
  db: DB,
  environmentId: string,
  forceReclassify = false,
): Promise<Classification | null> {
  const env = await db.query.environment.findFirst({
    where: eq(environment.id, environmentId),
  });

  if (!env) return null;

  // Return cached if fresh enough
  if (
    !forceReclassify &&
    env.classification &&
    env.classifiedAt &&
    Date.now() - env.classifiedAt.getTime() < 7 * 24 * 60 * 60 * 1000 // 7 days
  ) {
    return env.classification as Classification;
  }

  // Classify in background
  classifyEnvironmentAsync(db, env);

  return env.classification as Classification | null;
}

async function classifyEnvironmentAsync(db: DB, env: Environment) {
  try {
    const repoInfo = await fetchRepoInfo(env.repoFullName);
    const classification = await classifyRepository(repoInfo);

    await db
      .update(environment)
      .set({
        classification,
        classifiedAt: new Date(),
        classificationVersion: CURRENT_VERSION,
      })
      .where(eq(environment.id, env.id));
  } catch (error) {
    console.error("Classification failed:", error);
  }
}
```

### Integration with Slack

**apps/www/src/app/api/webhooks/slack/handlers.ts**

```typescript
async function handleSlackMention(event: SlackMentionEvent) {
  const { repoFullName, message } = parseSlackMessage(event);

  // Get repository classification
  const env = await getEnvironmentByRepo(repoFullName);
  const classification = await getOrClassifyEnvironment(db, env.id);

  // Use classification to enhance response
  const context = classification
    ? `
This is a ${classification.type} project using ${classification.primaryLanguage}
with ${classification.frameworks.join(", ")}.
Complexity: ${classification.complexity}.
`
    : "";

  // Select best agent based on classification
  const preferredAgent = classification?.suggestedAgents[0] ?? "claudeCode";

  // Create thread with enhanced context
  await createThreadFromSlack({
    message,
    context,
    agent: preferredAgent,
    environment: env,
  });
}
```

### Configuration

```
REPO_CLASSIFICATION_ENABLED=true
REPO_CLASSIFICATION_MODEL=gpt-4o-mini
REPO_CLASSIFICATION_CACHE_DAYS=7
```

---

## Feature 4: Commit Attribution per Prompt Author

### Overview

Track which user prompted each commit for accurate audit trails and accountability.

### Database Schema Changes

```sql
-- New table: commit_attribution
export const commitAttribution = pgTable("commit_attribution", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").references(() => thread.id).notNull(),
  commitSha: text("commit_sha").notNull(),
  promptedByUserId: text("prompted_by_user_id").references(() => users.id).notNull(),
  promptedBySlackUserId: text("prompted_by_slack_user_id"),
  executedByAgent: text("executed_by_agent").notNull(), -- 'claudeCode' | 'gemini' etc
  promptMessageId: text("prompt_message_id"), -- Reference to the message that triggered commit
  promptText: text("prompt_text"), -- The actual prompt (truncated)
  commitMessage: text("commit_message").notNull(),
  filesChanged: integer("files_changed"),
  insertions: integer("insertions"),
  deletions: integer("deletions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  repoFullName: text("repo_full_name").notNull(),
  branch: text("branch").notNull(),
});

CREATE INDEX idx_commit_attribution_user ON commit_attribution(prompted_by_user_id);
CREATE INDEX idx_commit_attribution_repo ON commit_attribution(repo_full_name);
CREATE INDEX idx_commit_attribution_sha ON commit_attribution(commit_sha);
```

### Implementation

**packages/sandbox/src/commands/git-commit-and-push.ts** - Modify:

```typescript
export async function gitCommitAndPush(
  sandbox: ISandbox,
  options: GitCommitOptions & { attribution?: CommitAttribution },
): Promise<GitCommitResult> {
  const { message, branch, attribution } = options;

  // Execute commit
  const result = await sandbox.commands.run(
    `git commit -m "${escapeMessage(message)}"`,
  );

  if (result.exitCode === 0) {
    const commitSha = await getLatestCommitSha(sandbox);
    const stats = await getCommitStats(sandbox, commitSha);

    // Record attribution
    if (attribution) {
      await db.insert(commitAttribution).values({
        id: generateId(),
        threadId: attribution.threadId,
        commitSha,
        promptedByUserId: attribution.userId,
        promptedBySlackUserId: attribution.slackUserId,
        executedByAgent: attribution.agent,
        promptMessageId: attribution.messageId,
        promptText: attribution.promptText?.slice(0, 500),
        commitMessage: message,
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions,
        repoFullName: attribution.repoFullName,
        branch,
      });
    }
  }

  return result;
}
```

**packages/daemon/src/daemon.ts** - Track attribution context:

```typescript
interface DaemonContext {
  currentPromptAuthor?: {
    userId: string;
    slackUserId?: string;
    messageId: string;
    promptText: string;
  };
}

// When processing tool calls that result in commits
async function handleGitCommitToolCall(
  toolCall: ToolCall,
  context: DaemonContext,
) {
  await gitCommitAndPush(sandbox, {
    message: toolCall.input.message,
    branch: toolCall.input.branch,
    attribution: context.currentPromptAuthor
      ? {
          ...context.currentPromptAuthor,
          threadId: context.threadId,
          agent: context.agent,
          repoFullName: context.repoFullName,
        }
      : undefined,
  });
}
```

### UI Components

**apps/www/src/components/thread/commit-history.tsx**

```typescript
export function CommitHistory({ threadId }: { threadId: string }) {
  const { data: commits } = useCommitHistory(threadId);

  return (
    <div className="space-y-2">
      {commits?.map((commit) => (
        <div key={commit.id} className="flex items-center gap-3 p-2 border rounded">
          <GitCommit className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-mono text-sm">{commit.commitSha.slice(0, 7)}</p>
            <p className="text-sm text-muted-foreground">{commit.commitMessage}</p>
          </div>
          <div className="text-right text-sm">
            <p>Prompted by: {commit.promptedByUser?.name}</p>
            <p className="text-muted-foreground">via {commit.executedByAgent}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### API Endpoint for Audit

**apps/www/src/app/api/audit/commits/route.ts**

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoFullName = searchParams.get("repo");
  const userId = searchParams.get("userId");
  const since = searchParams.get("since");

  const commits = await db.query.commitAttribution.findMany({
    where: and(
      repoFullName
        ? eq(commitAttribution.repoFullName, repoFullName)
        : undefined,
      userId ? eq(commitAttribution.promptedByUserId, userId) : undefined,
      since ? gte(commitAttribution.createdAt, new Date(since)) : undefined,
    ),
    orderBy: desc(commitAttribution.createdAt),
    limit: 100,
  });

  return Response.json({ commits });
}
```

---

## Feature 5: Multiplayer Presence Indicators

### Overview

Show real-time presence of other users viewing/editing the same thread.

### Database Schema Changes

```sql
-- Presence is ephemeral, stored in Redis not PostgreSQL
-- Redis key pattern: presence:{threadId}:{oderId}
-- Value: JSON { oderId, userName, avatarUrl, cursor?, lastSeen }
```

### Implementation

**packages/shared/src/presence.ts**

```typescript
import { redis } from "./redis";

const PRESENCE_TTL = 30; // seconds
const PRESENCE_PREFIX = "presence:thread:";

export interface UserPresence {
  oderId: string;
  userName: string;
  avatarUrl?: string;
  cursor?: { line: number; column: number; file?: string };
  lastSeen: number;
  status: "active" | "idle" | "away";
}

export async function updatePresence(
  threadId: string,
  presence: UserPresence,
): Promise<void> {
  const key = `${PRESENCE_PREFIX}${threadId}`;
  await redis.hset(key, presence.oderId, JSON.stringify(presence));
  await redis.expire(key, PRESENCE_TTL);
}

export async function getThreadPresence(
  threadId: string,
): Promise<UserPresence[]> {
  const key = `${PRESENCE_PREFIX}${threadId}`;
  const data = await redis.hgetall(key);

  const now = Date.now();
  return Object.values(data)
    .map((v) => JSON.parse(v) as UserPresence)
    .filter((p) => now - p.lastSeen < PRESENCE_TTL * 1000);
}

export async function removePresence(
  threadId: string,
  oderId: string,
): Promise<void> {
  const key = `${PRESENCE_PREFIX}${threadId}`;
  await redis.hdel(key, oderId);
}
```

**apps/broadcast/src/presence.ts**

```typescript
import type * as Party from "partykit/server";
import {
  updatePresence,
  getThreadPresence,
  removePresence,
} from "@terragon/shared/presence";

export default class PresenceServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    const threadId = this.room.id;
    const presence = await getThreadPresence(threadId);
    conn.send(JSON.stringify({ type: "presence_sync", users: presence }));
  }

  async onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message);

    if (data.type === "presence_update") {
      await updatePresence(this.room.id, {
        oderId: data.oderId,
        userName: data.userName,
        avatarUrl: data.avatarUrl,
        cursor: data.cursor,
        lastSeen: Date.now(),
        status: data.status ?? "active",
      });

      // Broadcast to all connections
      this.room.broadcast(
        JSON.stringify({
          type: "presence_update",
          user: data,
        }),
      );
    }
  }

  async onClose(conn: Party.Connection) {
    const oderId = conn.id; // Assuming connection id maps to oderId
    await removePresence(this.room.id, oderId);
    this.room.broadcast(
      JSON.stringify({
        type: "presence_leave",
        oderId,
      }),
    );
  }
}
```

### UI Components

**apps/www/src/components/thread/presence-avatars.tsx**

```typescript
import { usePresence } from "@/hooks/use-presence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function PresenceAvatars({ threadId }: { threadId: string }) {
  const { users, updateMyPresence } = usePresence(threadId);

  // Update presence on activity
  useEffect(() => {
    const interval = setInterval(() => {
      updateMyPresence({ status: "active" });
    }, 10000);
    return () => clearInterval(interval);
  }, [updateMyPresence]);

  const otherUsers = users.filter((u) => u.oderId !== currentUser.id);

  if (otherUsers.length === 0) return null;

  return (
    <div className="flex -space-x-2">
      {otherUsers.slice(0, 5).map((user) => (
        <Tooltip key={user.oderId}>
          <TooltipTrigger>
            <Avatar className="h-8 w-8 border-2 border-background">
              <AvatarImage src={user.avatarUrl} />
              <AvatarFallback>{user.userName[0]}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            <p>{user.userName}</p>
            <p className="text-xs text-muted-foreground">
              {user.status === "active" ? "Active now" : "Away"}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
      {otherUsers.length > 5 && (
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm">
          +{otherUsers.length - 5}
        </div>
      )}
    </div>
  );
}
```

**apps/www/src/hooks/use-presence.ts**

```typescript
import usePartySocket from "partysocket/react";
import { useCallback, useState } from "react";

export function usePresence(threadId: string) {
  const [users, setUsers] = useState<UserPresence[]>([]);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST!,
    room: `presence:${threadId}`,
    onMessage(event) {
      const data = JSON.parse(event.data);

      if (data.type === "presence_sync") {
        setUsers(data.users);
      } else if (data.type === "presence_update") {
        setUsers((prev) => {
          const filtered = prev.filter((u) => u.oderId !== data.user.oderId);
          return [...filtered, data.user];
        });
      } else if (data.type === "presence_leave") {
        setUsers((prev) => prev.filter((u) => u.oderId !== data.oderId));
      }
    },
  });

  const updateMyPresence = useCallback(
    (update: Partial<UserPresence>) => {
      socket.send(
        JSON.stringify({
          type: "presence_update",
          ...update,
          oderId: currentUser.id,
          userName: currentUser.name,
          avatarUrl: currentUser.image,
          lastSeen: Date.now(),
        }),
      );
    },
    [socket],
  );

  return { users, updateMyPresence };
}
```

---

## Feature 6: Inactivity-Based Snapshot and Cleanup

### Overview

Automatically snapshot and hibernate inactive sandboxes to save resources.

### Implementation

**apps/www/src/jobs/inactivity-cleanup.ts**

```typescript
import { CronJob } from "cron";
import { shouldHibernateSandbox } from "@/agent/sandbox-resource";
import { createThreadSnapshot } from "@/server-actions/snapshots";
import { hibernateSandbox } from "@terragon/sandbox";

interface InactivityConfig {
  checkIntervalMs: number;
  inactivityThresholdMs: number;
  snapshotBeforeHibernate: boolean;
  notifyUser: boolean;
}

const DEFAULT_CONFIG: InactivityConfig = {
  checkIntervalMs: 60000, // Check every minute
  inactivityThresholdMs: 15 * 60 * 1000, // 15 minutes
  snapshotBeforeHibernate: true,
  notifyUser: true,
};

export class InactivityCleanupJob {
  private job: CronJob;

  constructor(private config: InactivityConfig = DEFAULT_CONFIG) {
    this.job = new CronJob("*/1 * * * *", () => this.run());
  }

  async run() {
    const activeThreads = await db.query.thread.findMany({
      where: and(
        eq(thread.sandboxStatus, "running"),
        isNotNull(thread.sandboxId),
      ),
    });

    for (const t of activeThreads) {
      const shouldHibernate = await shouldHibernateSandbox(t.id);
      const isInactive = await this.checkInactivity(t);

      if (shouldHibernate && isInactive) {
        await this.hibernateThread(t);
      }
    }
  }

  private async checkInactivity(t: Thread): Promise<boolean> {
    const lastActivity = await redis.get(`thread:${t.id}:lastActivity`);
    if (!lastActivity) return true;

    const elapsed = Date.now() - parseInt(lastActivity, 10);
    return elapsed > this.config.inactivityThresholdMs;
  }

  private async hibernateThread(t: Thread) {
    try {
      // Create snapshot if configured
      if (this.config.snapshotBeforeHibernate) {
        await createThreadSnapshot(t.id);
      }

      // Hibernate sandbox
      await hibernateSandbox(t.sandboxId!, t.sandboxProvider);

      // Update thread status
      await db
        .update(thread)
        .set({
          sandboxStatus: "hibernating",
        })
        .where(eq(thread.id, t.id));

      // Notify user if configured
      if (this.config.notifyUser) {
        await publishBroadcastUserMessage(t.userId, {
          type: "thread_hibernated",
          threadId: t.id,
          reason: "inactivity",
        });
      }
    } catch (error) {
      console.error(`Failed to hibernate thread ${t.id}:`, error);
    }
  }

  start() {
    this.job.start();
  }

  stop() {
    this.job.stop();
  }
}
```

**apps/www/src/agent/sandbox-resource.ts** - Add activity tracking:

```typescript
export async function trackActivity(threadId: string) {
  await redis.set(`thread:${threadId}:lastActivity`, Date.now().toString(), {
    ex: 24 * 60 * 60, // 24 hour TTL
  });
}

// Call this on user messages, tool executions, etc.
```

### Configuration

```
INACTIVITY_CHECK_INTERVAL_MS=60000
INACTIVITY_THRESHOLD_MS=900000
INACTIVITY_SNAPSHOT_BEFORE_HIBERNATE=true
INACTIVITY_NOTIFY_USER=true
```

---

## Feature 7: Enhanced Slack Callback System

### Overview

Rich notifications back to Slack with status updates, code snippets, and interactive buttons.

### Implementation

**apps/www/src/server-lib/slack-callbacks.ts**

````typescript
import { WebClient } from "@slack/web-api";

interface SlackCallback {
  type: "status" | "code" | "error" | "complete" | "review_request";
  threadTs: string;
  channelId: string;
  data: CallbackData;
}

export class SlackCallbackService {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async sendStatusUpdate(callback: SlackCallback & { type: "status" }) {
    await this.client.chat.postMessage({
      channel: callback.channelId,
      thread_ts: callback.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Status:* ${callback.data.status}\n${callback.data.message}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `:clock1: ${new Date().toLocaleTimeString()}`,
            },
          ],
        },
      ],
    });
  }

  async sendCodeSnippet(callback: SlackCallback & { type: "code" }) {
    await this.client.chat.postMessage({
      channel: callback.channelId,
      thread_ts: callback.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${callback.data.filename}*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "```" + callback.data.code.slice(0, 2900) + "```",
          },
        },
      ],
    });
  }

  async sendCompletionWithActions(
    callback: SlackCallback & { type: "complete" },
  ) {
    await this.client.chat.postMessage({
      channel: callback.channelId,
      thread_ts: callback.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:white_check_mark: *Task Completed*\n${callback.data.summary}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View in Terry" },
              url: callback.data.threadUrl,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Create PR" },
              action_id: "create_pr",
              value: callback.data.threadId,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Continue" },
              action_id: "continue_thread",
              value: callback.data.threadId,
            },
          ],
        },
      ],
    });
  }

  async sendError(callback: SlackCallback & { type: "error" }) {
    await this.client.chat.postMessage({
      channel: callback.channelId,
      thread_ts: callback.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:x: *Error*\n${callback.data.message}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "```" + callback.data.details?.slice(0, 500) + "```",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Retry" },
              action_id: "retry_task",
              value: callback.data.threadId,
              style: "primary",
            },
          ],
        },
      ],
    });
  }
}
````

**apps/www/src/app/api/webhooks/slack/interactions/route.ts**

```typescript
export async function POST(request: Request) {
  const payload = await parseSlackInteraction(request);

  switch (payload.actions[0].action_id) {
    case "create_pr":
      await handleCreatePR(payload);
      break;
    case "continue_thread":
      await handleContinueThread(payload);
      break;
    case "retry_task":
      await handleRetryTask(payload);
      break;
  }

  return new Response("ok");
}
```

### Integration with Daemon

**packages/daemon/src/slack-integration.ts**

```typescript
export async function notifySlackOnCompletion(
  context: DaemonContext,
  result: ExecutionResult,
) {
  if (!context.slackThread) return;

  const callback = new SlackCallbackService(context.slackToken);

  if (result.error) {
    await callback.sendError({
      type: "error",
      threadTs: context.slackThread.ts,
      channelId: context.slackThread.channelId,
      data: {
        message: result.error.message,
        details: result.error.stack,
        threadId: context.threadId,
      },
    });
  } else {
    await callback.sendCompletionWithActions({
      type: "complete",
      threadTs: context.slackThread.ts,
      channelId: context.slackThread.channelId,
      data: {
        summary: result.summary,
        threadUrl: `${process.env.APP_URL}/thread/${context.threadId}`,
        threadId: context.threadId,
      },
    });
  }
}
```

---

## Feature 8: Token Aggregation for Efficient Streaming

### Overview

Batch token updates to reduce WebSocket traffic and database writes.

### Implementation

**packages/daemon/src/token-aggregator.ts**

```typescript
interface TokenBucket {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  lastFlush: number;
}

export class TokenAggregator {
  private buckets: Map<string, TokenBucket> = new Map();
  private flushInterval: NodeJS.Timeout;

  constructor(
    private flushIntervalMs = 1000,
    private onFlush: (threadId: string, tokens: TokenBucket) => Promise<void>,
  ) {
    this.flushInterval = setInterval(() => this.flushAll(), flushIntervalMs);
  }

  add(threadId: string, usage: TokenUsage) {
    let bucket = this.buckets.get(threadId);
    if (!bucket) {
      bucket = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        lastFlush: Date.now(),
      };
      this.buckets.set(threadId, bucket);
    }

    bucket.inputTokens += usage.input_tokens ?? 0;
    bucket.outputTokens += usage.output_tokens ?? 0;
    bucket.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
    bucket.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  }

  private async flushAll() {
    const entries = Array.from(this.buckets.entries());
    this.buckets.clear();

    await Promise.allSettled(
      entries.map(([threadId, bucket]) => this.onFlush(threadId, bucket)),
    );
  }

  async flush(threadId: string) {
    const bucket = this.buckets.get(threadId);
    if (bucket) {
      this.buckets.delete(threadId);
      await this.onFlush(threadId, bucket);
    }
  }

  stop() {
    clearInterval(this.flushInterval);
    this.flushAll();
  }
}
```

**packages/daemon/src/daemon.ts** - Integration:

```typescript
const tokenAggregator = new TokenAggregator(1000, async (threadId, tokens) => {
  await sendToBroadcast({
    type: "token_usage",
    threadId,
    usage: {
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      cacheCreationTokens: tokens.cacheCreationTokens,
      cacheReadTokens: tokens.cacheReadTokens,
    },
  });

  await updateThreadTokenUsage(threadId, tokens);
});

// When processing stream events
stream.on("usage", (usage) => {
  tokenAggregator.add(threadId, usage);
});

// On stream end, flush immediately
stream.on("end", () => {
  tokenAggregator.flush(threadId);
});
```

---

## Feature 9: User Preferences per Slack User

### Overview

Store and apply user-specific preferences for Slack-initiated tasks.

### Database Schema Changes

```sql
-- Extend slackSettings table
ALTER TABLE slack_settings ADD COLUMN preferences JSONB DEFAULT '{}';

-- Preferences structure:
-- {
--   "defaultAgent": "claudeCode",
--   "defaultSandboxSize": "medium",
--   "autoCreatePR": false,
--   "notifyOnComplete": true,
--   "notifyOnError": true,
--   "codeStyle": {
--     "language": "typescript",
--     "formatting": "prettier"
--   },
--   "responseVerbosity": "concise" | "detailed",
--   "timezone": "America/New_York"
-- }
```

### Implementation

**packages/shared/src/model/slack-preferences.ts**

```typescript
import { z } from "zod";

export const SlackUserPreferencesSchema = z.object({
  defaultAgent: z.enum(["claudeCode", "gemini", "codex", "amp"]).optional(),
  defaultSandboxSize: z.enum(["small", "medium", "large"]).optional(),
  autoCreatePR: z.boolean().optional(),
  notifyOnComplete: z.boolean().default(true),
  notifyOnError: z.boolean().default(true),
  codeStyle: z
    .object({
      language: z.string().optional(),
      formatting: z.string().optional(),
    })
    .optional(),
  responseVerbosity: z.enum(["concise", "detailed"]).optional(),
  timezone: z.string().optional(),
});

export type SlackUserPreferences = z.infer<typeof SlackUserPreferencesSchema>;

export async function getSlackUserPreferences(
  db: DB,
  slackUserId: string,
  workspaceId: string,
): Promise<SlackUserPreferences> {
  const settings = await db.query.slackSettings.findFirst({
    where: and(
      eq(slackSettings.slackUserId, slackUserId),
      eq(slackSettings.workspaceId, workspaceId),
    ),
  });

  return SlackUserPreferencesSchema.parse(settings?.preferences ?? {});
}

export async function updateSlackUserPreferences(
  db: DB,
  slackUserId: string,
  workspaceId: string,
  preferences: Partial<SlackUserPreferences>,
): Promise<void> {
  const existing = await getSlackUserPreferences(db, slackUserId, workspaceId);
  const merged = { ...existing, ...preferences };

  await db
    .update(slackSettings)
    .set({
      preferences: merged,
    })
    .where(
      and(
        eq(slackSettings.slackUserId, slackUserId),
        eq(slackSettings.workspaceId, workspaceId),
      ),
    );
}
```

**apps/www/src/app/api/webhooks/slack/handlers.ts** - Apply preferences:

```typescript
async function createThreadFromSlack(event: SlackMentionEvent) {
  const preferences = await getSlackUserPreferences(db, event.user, event.team);

  const thread = await createThread({
    name: extractTaskName(event.text),
    agent: preferences.defaultAgent ?? "claudeCode",
    sandboxSize: preferences.defaultSandboxSize ?? "small",
    userId: linkedUserId,
    slackContext: {
      channelId: event.channel,
      threadTs: event.thread_ts ?? event.ts,
      userId: event.user,
      preferences,
    },
  });

  return thread;
}
```

### Slack Commands for Preferences

**apps/www/src/app/api/webhooks/slack/commands/route.ts**

```typescript
// Handle /terry-settings command
export async function POST(request: Request) {
  const payload = await parseSlackCommand(request);

  if (payload.command === "/terry-settings") {
    const preferences = await getSlackUserPreferences(
      db,
      payload.user_id,
      payload.team_id,
    );

    // Open modal with current settings
    await slack.views.open({
      trigger_id: payload.trigger_id,
      view: buildPreferencesModal(preferences),
    });
  }

  return new Response("ok");
}

function buildPreferencesModal(preferences: SlackUserPreferences) {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Terry Settings" },
    submit: { type: "plain_text", text: "Save" },
    blocks: [
      {
        type: "input",
        block_id: "default_agent",
        label: { type: "plain_text", text: "Default AI Agent" },
        element: {
          type: "static_select",
          action_id: "agent_select",
          initial_option: preferences.defaultAgent
            ? {
                text: { type: "plain_text", text: preferences.defaultAgent },
                value: preferences.defaultAgent,
              }
            : undefined,
          options: [
            {
              text: { type: "plain_text", text: "Claude Code" },
              value: "claudeCode",
            },
            { text: { type: "plain_text", text: "Gemini" }, value: "gemini" },
            { text: { type: "plain_text", text: "Codex" }, value: "codex" },
          ],
        },
      },
      // ... more settings blocks
    ],
  };
}
```

---

## Feature 10: Circuit Breaker Pattern for Sandbox Spawning

### Overview

Prevent cascade failures when sandbox providers are having issues.

### Implementation

**packages/utils/src/circuit-breaker.ts**

```typescript
export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening
  successThreshold: number; // Successes before closing
  timeout: number; // Time in open state before half-open (ms)
  monitoringWindow: number; // Time window for failure counting (ms)
}

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures: number[] = [];
  private successes = 0;
  private lastFailure: number = 0;
  private stateChangeListeners: ((state: CircuitState) => void)[] = [];

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      monitoringWindow: 60000,
    },
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure >= this.config.timeout) {
        this.transitionTo("half-open");
      } else {
        throw new CircuitOpenError(this.name, this.getRemainingTimeout());
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo("closed");
      }
    }
    // Clear old failures outside monitoring window
    const cutoff = Date.now() - this.config.monitoringWindow;
    this.failures = this.failures.filter((t) => t > cutoff);
  }

  private onFailure() {
    this.lastFailure = Date.now();
    this.failures.push(this.lastFailure);
    this.successes = 0;

    // Count failures in monitoring window
    const cutoff = Date.now() - this.config.monitoringWindow;
    const recentFailures = this.failures.filter((t) => t > cutoff);

    if (recentFailures.length >= this.config.failureThreshold) {
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitState) {
    if (this.state !== newState) {
      console.log(`Circuit breaker ${this.name}: ${this.state} -> ${newState}`);
      this.state = newState;
      if (newState === "closed") {
        this.failures = [];
        this.successes = 0;
      }
      this.stateChangeListeners.forEach((l) => l(newState));
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getRemainingTimeout(): number {
    return Math.max(0, this.config.timeout - (Date.now() - this.lastFailure));
  }

  onStateChange(listener: (state: CircuitState) => void) {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(
        (l) => l !== listener,
      );
    };
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfterMs: number,
  ) {
    super(
      `Circuit breaker ${circuitName} is open. Retry after ${retryAfterMs}ms`,
    );
    this.name = "CircuitOpenError";
  }
}
```

**packages/sandbox/src/sandbox.ts** - Integration:

```typescript
import {
  CircuitBreaker,
  CircuitOpenError,
} from "@terragon/utils/circuit-breaker";

const sandboxCircuitBreakers = {
  e2b: new CircuitBreaker("e2b-sandbox", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    monitoringWindow: 120000,
  }),
  daytona: new CircuitBreaker("daytona-sandbox", {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    monitoringWindow: 60000,
  }),
};

export async function createSandbox(options: CreateSandboxOptions) {
  const breaker = sandboxCircuitBreakers[options.provider];

  try {
    return await breaker.execute(async () => {
      return await createSandboxInternal(options);
    });
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // Try fallback provider
      const fallbackProvider = getFallbackProvider(options.provider);
      if (fallbackProvider) {
        console.log(`Falling back to ${fallbackProvider} due to circuit open`);
        return createSandbox({ ...options, provider: fallbackProvider });
      }
    }
    throw error;
  }
}

function getFallbackProvider(primary: string): string | null {
  const fallbacks: Record<string, string> = {
    e2b: "daytona",
    daytona: "e2b",
  };
  return fallbacks[primary] ?? null;
}
```

### Health Check Endpoint

**apps/www/src/app/api/health/sandboxes/route.ts**

```typescript
export async function GET() {
  const status = {
    e2b: {
      state: sandboxCircuitBreakers.e2b.getState(),
      retryAfter: sandboxCircuitBreakers.e2b.getRemainingTimeout(),
    },
    daytona: {
      state: sandboxCircuitBreakers.daytona.getState(),
      retryAfter: sandboxCircuitBreakers.daytona.getRemainingTimeout(),
    },
  };

  const healthy = Object.values(status).some((s) => s.state !== "open");

  return Response.json(status, {
    status: healthy ? 200 : 503,
  });
}
```

---

## Implementation Priority & Dependencies

### Phase 1: Foundation (Week 1-2)

1. **Circuit Breaker Pattern** - Critical for stability
2. **Token Aggregation** - Reduces load immediately
3. **Inactivity Cleanup** - Resource optimization

### Phase 2: Core Features (Week 3-4)

4. **Sandbox Pre-warming** - Major UX improvement (depends on Phase 1)
5. **Filesystem Snapshots** - Enables session persistence
6. **Commit Attribution** - Audit capability

### Phase 3: Slack Enhancements (Week 5-6)

7. **Enhanced Slack Callbacks** - Better Slack experience
8. **User Preferences per Slack User** - Personalization
9. **LLM Repository Classification** - Smarter routing

### Phase 4: Collaboration (Week 7-8)

10. **Multiplayer Presence** - Real-time collaboration

---

## Testing Strategy

### Unit Tests

- Each feature should have >80% coverage
- Mock external services (Redis, database, Slack API)
- Test edge cases and error conditions

### Integration Tests

- Test feature interactions
- Test database migrations
- Test WebSocket connections

### Load Tests

- Warm pool under concurrent demand
- Token aggregation under high throughput
- Circuit breaker under failure conditions

### E2E Tests

- Full Slack workflow with callbacks
- Snapshot create/restore cycle
- Presence sync across multiple clients

---

## Configuration Summary

```env
# Feature 1: Warm Pool
WARM_POOL_ENABLED=true
WARM_POOL_REPLENISH_INTERVAL_MS=30000
WARM_POOL_DEFAULT_TTL_MINUTES=30

# Feature 2: Snapshots
SNAPSHOT_ENABLED=true
SNAPSHOT_MAX_PER_THREAD=5
SNAPSHOT_RETENTION_DAYS=30
SNAPSHOT_AUTO_ON_HIBERNATE=true

# Feature 3: Repository Classification
REPO_CLASSIFICATION_ENABLED=true
REPO_CLASSIFICATION_MODEL=gpt-4o-mini
REPO_CLASSIFICATION_CACHE_DAYS=7

# Feature 6: Inactivity Cleanup
INACTIVITY_CHECK_INTERVAL_MS=60000
INACTIVITY_THRESHOLD_MS=900000
INACTIVITY_SNAPSHOT_BEFORE_HIBERNATE=true
INACTIVITY_NOTIFY_USER=true

# Feature 8: Token Aggregation
TOKEN_AGGREGATION_FLUSH_INTERVAL_MS=1000

# Feature 10: Circuit Breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
CIRCUIT_BREAKER_TIMEOUT_MS=60000
CIRCUIT_BREAKER_MONITORING_WINDOW_MS=120000
```

---

## Migration Scripts

```sql
-- migrations/001_warm_pool.sql
CREATE TABLE warm_sandbox_pool (...);
CREATE TABLE warm_pool_config (...);
CREATE INDEX idx_warm_pool_status ON warm_sandbox_pool(provider, size, status);

-- migrations/002_snapshots.sql
CREATE TABLE sandbox_snapshots (...);
ALTER TABLE thread ADD COLUMN snapshot_id TEXT;
ALTER TABLE thread ADD COLUMN last_snapshot_at TIMESTAMP;

-- migrations/003_commit_attribution.sql
CREATE TABLE commit_attribution (...);
CREATE INDEX idx_commit_attribution_user ON commit_attribution(prompted_by_user_id);
CREATE INDEX idx_commit_attribution_repo ON commit_attribution(repo_full_name);

-- migrations/004_classification.sql
ALTER TABLE environment ADD COLUMN classification JSONB;
ALTER TABLE environment ADD COLUMN classified_at TIMESTAMP;

-- migrations/005_slack_preferences.sql
ALTER TABLE slack_settings ADD COLUMN preferences JSONB DEFAULT '{}';
```

---

This plan provides complete implementations for all 10 features with full database schemas, code implementations, configuration options, and testing strategies.
