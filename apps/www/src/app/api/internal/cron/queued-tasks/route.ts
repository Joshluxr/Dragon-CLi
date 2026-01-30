import type { NextRequest } from "next/server";
import {
  getUserIdsWithThreadsReadyToProcess,
  getUserIdsWithThreadsStuckInQueue,
  updateReattemptQueueAtForUser,
} from "@dragon/shared/model/threads";
import { db } from "@/lib/db";
import { env } from "@dragon/env/apps-www";
import { internalPOST } from "@/server-lib/internal-request";
import { sandboxCreationRateLimit } from "@/lib/rate-limit";
import { getPostHogServer } from "@/lib/posthog-server";
import {
  processBatchWithDelay,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_DELAY_MS,
} from "@dragon/utils/batch";

/**
 * Process users with rate-limited threads.
 * Checks rate limit status before processing and updates reattemptQueueAt if still limited.
 */
async function processOtherRateLimitedQueues() {
  console.log("Processing other rate-limited queues");
  const userIds = await getUserIdsWithThreadsReadyToProcess({ db });
  console.log(`Found ${userIds.length} users with other rate-limited threads`);

  // Log cron job queue processing metrics
  if (userIds.length > 0) {
    getPostHogServer().capture({
      distinctId: "system",
      event: "cron_queue_processing",
      properties: {
        usersWithRateLimitedThreads: userIds.length,
        queueType: "other_rate_limit",
      },
    });
  }

  await processBatchWithDelay(
    userIds,
    async (userId) => {
      // Check if the user has tokens remaining before we kick off the request to
      // process the thread queue so we don't end up making a bunch of useless requests.
      const rateLimitResult =
        await sandboxCreationRateLimit.getRemaining(userId);
      if (rateLimitResult.remaining === 0) {
        // Update reattemptQueueAt to the rate limit reset time to avoid unnecessary retries
        const resetTime = new Date(rateLimitResult.reset);
        await updateReattemptQueueAtForUser({
          db,
          userId,
          reattemptQueueAt: resetTime,
        });
        return;
      }
      // We have this make a separate request to process the thread queue
      // to keep each request's logs and errors separate and so each of them
      // get their own function time limit.
      await internalPOST(`process-thread-queue/${userId}`);
    },
    { batchSize: DEFAULT_BATCH_SIZE, delayMs: DEFAULT_BATCH_DELAY_MS },
  );
}

/**
 * Process users with threads stuck in concurrency queue.
 * These may be stuck due to race conditions or errors.
 */
async function processConcurrencyLimitedQueues() {
  console.log("Processing concurrency-limited queues");
  const userIds = await getUserIdsWithThreadsStuckInQueue({ db });
  console.log(`Found ${userIds.length} users with stuck threads`);

  if (userIds.length > 0) {
    console.log(userIds);
    // Log metrics for stuck users
    getPostHogServer().capture({
      distinctId: "system",
      event: "cron_queue_stuck_users",
      properties: {
        stuckUserCount: userIds.length,
        queueType: "tasks_concurrency",
      },
    });
  }

  await processBatchWithDelay(
    userIds,
    async (userId) => {
      await internalPOST(`process-thread-queue/${userId}`);
    },
    { batchSize: DEFAULT_BATCH_SIZE, delayMs: DEFAULT_BATCH_DELAY_MS },
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }
  console.log("Queued tasks cron task triggered");
  await processOtherRateLimitedQueues();
  await processConcurrencyLimitedQueues();
  console.log("Queued tasks cron task completed");
  return Response.json({ success: true });
}
