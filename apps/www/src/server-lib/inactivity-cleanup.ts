/**
 * Inactivity Cleanup Job
 *
 * Periodically checks for inactive sandboxes and hibernates them
 * to save resources.
 */

import {
  shouldHibernateDueToInactivity,
  clearSandboxTracking,
  DEFAULT_INACTIVITY_THRESHOLD_MS,
} from "@/agent/sandbox-resource";
import { db } from "@/lib/db";
import { thread } from "@terragon/shared/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { hibernateSandbox, getSandboxOrNull } from "@terragon/sandbox";
import {
  getGitDiffMaybeCutoff,
  gitDiffStats,
} from "@terragon/sandbox/commands";
import { publishBroadcastUserMessage } from "@terragon/shared/broadcast-server";
import { getThread, updateThread } from "@terragon/shared/model/threads";
import { getErrorMessage } from "@terragon/utils/error";
import type { SandboxProvider } from "@terragon/types/sandbox";

export interface InactivityCleanupConfig {
  /** Interval between cleanup checks in ms (default: 60000 = 1 minute) */
  checkIntervalMs: number;
  /** Inactivity threshold before hibernation in ms (default: 15 minutes) */
  inactivityThresholdMs: number;
  /** Whether to create a snapshot before hibernating (default: true) */
  snapshotBeforeHibernate: boolean;
  /** Whether to notify users when their sandbox is hibernated (default: true) */
  notifyUser: boolean;
  /** Maximum number of sandboxes to process per check cycle (default: 10) */
  batchSize: number;
  /** Whether the cleanup job is enabled (default: true) */
  enabled: boolean;
}

const DEFAULT_CONFIG: InactivityCleanupConfig = {
  checkIntervalMs: 60000, // 1 minute
  inactivityThresholdMs: DEFAULT_INACTIVITY_THRESHOLD_MS,
  snapshotBeforeHibernate: true,
  notifyUser: true,
  batchSize: 10,
  enabled: true,
};

export interface CleanupResult {
  threadId: string;
  sandboxId: string;
  userId: string;
  status: "hibernated" | "skipped" | "error";
  reason: string;
  error?: string;
}

export class InactivityCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private stats = {
    totalChecks: 0,
    totalHibernated: 0,
    totalSkipped: 0,
    totalErrors: 0,
  };

  constructor(private config: InactivityCleanupConfig = DEFAULT_CONFIG) {}

  /**
   * Start the cleanup job
   */
  start(): void {
    if (this.intervalId) {
      console.log("[InactivityCleanup] Job already running");
      return;
    }

    if (!this.config.enabled) {
      console.log("[InactivityCleanup] Job is disabled");
      return;
    }

    console.log(
      `[InactivityCleanup] Starting job with interval ${this.config.checkIntervalMs}ms`,
    );

    this.intervalId = setInterval(() => {
      this.run().catch((error) => {
        console.error("[InactivityCleanup] Error during cleanup run:", error);
      });
    }, this.config.checkIntervalMs);

    // Don't prevent process exit
    this.intervalId.unref?.();
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[InactivityCleanup] Job stopped");
    }
  }

  /**
   * Run a single cleanup cycle
   */
  async run(): Promise<CleanupResult[]> {
    if (this.isRunning) {
      console.log(
        "[InactivityCleanup] Skipping run, previous cycle still in progress",
      );
      return [];
    }

    this.isRunning = true;
    this.lastRunAt = new Date();
    this.stats.totalChecks++;

    const results: CleanupResult[] = [];

    try {
      // Find threads with running sandboxes
      const activeThreads = await db.query.thread.findMany({
        where: and(
          eq(thread.sandboxStatus, "running"),
          isNotNull(thread.codesandboxId),
        ),
        columns: {
          id: true,
          codesandboxId: true,
          sandboxProvider: true,
          userId: true,
          name: true,
        },
        limit: this.config.batchSize,
      });

      console.log(
        `[InactivityCleanup] Checking ${activeThreads.length} active threads`,
      );

      for (const t of activeThreads) {
        if (!t.codesandboxId || !t.sandboxProvider) continue;

        try {
          const result = await this.processThread({
            threadId: t.id,
            sandboxId: t.codesandboxId,
            sandboxProvider: t.sandboxProvider as SandboxProvider,
            userId: t.userId,
            threadName: t.name,
          });
          results.push(result);

          if (result.status === "hibernated") {
            this.stats.totalHibernated++;
          } else if (result.status === "skipped") {
            this.stats.totalSkipped++;
          } else {
            this.stats.totalErrors++;
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          console.error(
            `[InactivityCleanup] Error processing thread ${t.id}:`,
            error,
          );
          results.push({
            threadId: t.id,
            sandboxId: t.codesandboxId,
            userId: t.userId,
            status: "error",
            reason: "Exception during processing",
            error: errorMessage,
          });
          this.stats.totalErrors++;
        }
      }
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  /**
   * Process a single thread for potential hibernation.
   * Checks inactivity, creates snapshot, hibernates, and updates status.
   */
  private async processThread(params: {
    threadId: string;
    sandboxId: string;
    sandboxProvider: SandboxProvider;
    userId: string;
    threadName: string | null;
  }): Promise<CleanupResult> {
    const { threadId, sandboxId, sandboxProvider, userId, threadName } = params;

    // Check if sandbox should be hibernated
    const check = await shouldHibernateDueToInactivity(
      sandboxId,
      this.config.inactivityThresholdMs,
    );

    if (!check.shouldHibernate) {
      return {
        threadId,
        sandboxId,
        userId,
        status: "skipped",
        reason: check.reason,
      };
    }

    console.log(
      `[InactivityCleanup] Hibernating sandbox ${sandboxId} for thread ${threadId}: ${check.reason}`,
    );

    try {
      // Create snapshot before hibernation if configured
      await this.maybeCreateSnapshot({
        threadId,
        sandboxId,
        sandboxProvider,
        userId,
      });

      // Hibernate sandbox and update thread status
      await this.hibernateAndUpdateThread({
        threadId,
        sandboxId,
        sandboxProvider,
      });

      // Post-hibernation cleanup and notifications
      await this.handlePostHibernation({
        sandboxId,
        userId,
        threadId,
        threadName,
      });

      return {
        threadId,
        sandboxId,
        userId,
        status: "hibernated",
        reason: check.reason,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `[InactivityCleanup] Failed to hibernate sandbox ${sandboxId}:`,
        error,
      );
      return {
        threadId,
        sandboxId,
        userId,
        status: "error",
        reason: "Failed to hibernate",
        error: errorMessage,
      };
    }
  }

  /**
   * Optionally create a snapshot before hibernation.
   * Failures are logged but don't block hibernation.
   */
  private async maybeCreateSnapshot(params: {
    threadId: string;
    sandboxId: string;
    sandboxProvider: SandboxProvider;
    userId: string;
  }): Promise<void> {
    if (!this.config.snapshotBeforeHibernate) {
      return;
    }

    try {
      await this.createPreHibernationSnapshot(params);
    } catch (snapshotError) {
      // Log but don't fail hibernation if snapshot fails
      console.warn(
        `[InactivityCleanup] Failed to create snapshot for thread ${params.threadId}:`,
        snapshotError,
      );
    }
  }

  /**
   * Hibernate the sandbox and update thread status in database.
   */
  private async hibernateAndUpdateThread(params: {
    threadId: string;
    sandboxId: string;
    sandboxProvider: SandboxProvider;
  }): Promise<void> {
    const { threadId, sandboxId, sandboxProvider } = params;

    await hibernateSandbox({
      sandboxProvider,
      sandboxId,
    });

    await db
      .update(thread)
      .set({
        sandboxStatus: "paused",
      })
      .where(eq(thread.id, threadId));
  }

  /**
   * Handle cleanup and notifications after successful hibernation.
   */
  private async handlePostHibernation(params: {
    sandboxId: string;
    userId: string;
    threadId: string;
    threadName: string | null;
  }): Promise<void> {
    const { sandboxId, userId, threadId, threadName } = params;

    // Clear tracking data
    await clearSandboxTracking(sandboxId);

    // Notify user if configured
    if (this.config.notifyUser) {
      await this.notifyUserOfHibernation(userId, threadId, threadName);
    }
  }

  private async notifyUserOfHibernation(
    userId: string,
    threadId: string,
    _threadName: string | null,
  ): Promise<void> {
    try {
      await publishBroadcastUserMessage({
        type: "user",
        id: userId,
        data: {
          threadId,
          threadStatusUpdated: "paused",
        },
      });
    } catch (error) {
      console.error(
        `[InactivityCleanup] Failed to notify user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Create a git diff snapshot before hibernation
   * This saves the current state of changes so users can see what work was done
   */
  private async createPreHibernationSnapshot(params: {
    threadId: string;
    sandboxId: string;
    sandboxProvider: SandboxProvider;
    userId: string;
  }): Promise<void> {
    const { threadId, sandboxId, sandboxProvider, userId } = params;

    // Get the thread to find the base branch
    const threadData = await getThread({ db, threadId, userId });
    if (!threadData) {
      console.log(
        `[InactivityCleanup] Thread ${threadId} not found, skipping snapshot`,
      );
      return;
    }

    // Get the sandbox session
    const session = await getSandboxOrNull({ sandboxProvider, sandboxId });
    if (!session) {
      console.log(
        `[InactivityCleanup] Sandbox ${sandboxId} not found, skipping snapshot`,
      );
      return;
    }

    console.log(
      `[InactivityCleanup] Creating pre-hibernation snapshot for thread ${threadId}`,
    );

    // Get git diff and stats
    const [diffOutput, stats] = await Promise.all([
      getGitDiffMaybeCutoff({
        session,
        baseBranch: threadData.repoBaseBranchName ?? undefined,
        allowCutoff: true, // Allow cutoff for hibernation snapshots
      }),
      gitDiffStats(session, {
        baseBranch: threadData.repoBaseBranchName ?? undefined,
      }),
    ]);

    // Update thread with snapshot data
    await updateThread({
      db,
      userId,
      threadId,
      updates: {
        gitDiff: diffOutput,
        gitDiffStats: stats,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[InactivityCleanup] Snapshot created for thread ${threadId}: ${stats?.files ?? 0} files, +${stats?.additions ?? 0}/-${stats?.deletions ?? 0}`,
    );
  }

  /**
   * Get job statistics
   */
  getStats(): {
    isRunning: boolean;
    lastRunAt: Date | null;
    config: InactivityCleanupConfig;
    stats: {
      totalChecks: number;
      totalHibernated: number;
      totalSkipped: number;
      totalErrors: number;
    };
  } {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      config: this.config,
      stats: { ...this.stats },
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<InactivityCleanupConfig>): void {
    this.config = { ...this.config, ...updates };

    // Restart if interval changed and job is running
    if (updates.checkIntervalMs !== undefined && this.intervalId) {
      this.stop();
      this.start();
    }
  }
}

// Singleton instance
let cleanupJobInstance: InactivityCleanupJob | null = null;

/**
 * Get or create the singleton cleanup job instance
 */
export function getInactivityCleanupJob(
  config?: Partial<InactivityCleanupConfig>,
): InactivityCleanupJob {
  if (!cleanupJobInstance) {
    cleanupJobInstance = new InactivityCleanupJob({
      ...DEFAULT_CONFIG,
      ...config,
    });
  }
  return cleanupJobInstance;
}

/**
 * Initialize and start the cleanup job from environment configuration
 */
export function initializeInactivityCleanup(): InactivityCleanupJob {
  const config: Partial<InactivityCleanupConfig> = {
    enabled: process.env.INACTIVITY_CLEANUP_ENABLED !== "false",
    checkIntervalMs: parseInt(
      process.env.INACTIVITY_CHECK_INTERVAL_MS ?? "60000",
      10,
    ),
    inactivityThresholdMs: parseInt(
      process.env.INACTIVITY_THRESHOLD_MS ??
        String(DEFAULT_INACTIVITY_THRESHOLD_MS),
      10,
    ),
    snapshotBeforeHibernate:
      process.env.INACTIVITY_SNAPSHOT_BEFORE_HIBERNATE !== "false",
    notifyUser: process.env.INACTIVITY_NOTIFY_USER !== "false",
    batchSize: parseInt(process.env.INACTIVITY_BATCH_SIZE ?? "10", 10),
  };

  const job = getInactivityCleanupJob(config);
  job.start();

  return job;
}
