import { redis } from "@/lib/redis";

/**
 * For each sandbox id, we track if it is:
 * - being used by a thread chat (set of thread chat ids)
 * - being used in a terminal (terminal status = 1)
 * - being used elsewhere (active users > 0)
 * - last activity timestamp
 */

const THREAD_CHATS_PREFIX = "sandbox-active-thread-chats:";
const TERMINAL_STATUS_PREFIX = "sandbox-terminal-status:";
const ACTIVE_USERS_PREFIX = "sandbox-active-users:";
const LAST_ACTIVITY_PREFIX = "sandbox-last-activity:";

/** Default inactivity threshold in milliseconds (15 minutes) */
export const DEFAULT_INACTIVITY_THRESHOLD_MS = 15 * 60 * 1000;

/** TTL for last activity key (24 hours) */
const LAST_ACTIVITY_TTL_SECONDS = 24 * 60 * 60;

export async function setTerminalActive({
  sandboxId,
  expires,
}: {
  sandboxId: string;
  expires: number;
}) {
  const pipeline = redis.pipeline();
  pipeline.set(`${TERMINAL_STATUS_PREFIX}${sandboxId}`, "1");
  pipeline.expire(`${TERMINAL_STATUS_PREFIX}${sandboxId}`, expires);
  await pipeline.exec();
}

export async function setActiveThreadChat({
  sandboxId,
  threadChatId,
  isActive,
}: {
  sandboxId: string;
  threadChatId: string;
  isActive: boolean;
}) {
  if (isActive) {
    const pipeline = redis.pipeline();
    pipeline.sadd(`${THREAD_CHATS_PREFIX}${sandboxId}`, threadChatId);
    pipeline.expire(`${THREAD_CHATS_PREFIX}${sandboxId}`, 60 * 60 * 24); // 1 day
    await pipeline.exec();
  } else {
    await redis.srem(`${THREAD_CHATS_PREFIX}${sandboxId}`, threadChatId);
  }
}

export async function withSandboxResource<T>({
  sandboxId,
  label,
  callback,
}: {
  sandboxId: string;
  label: string;
  callback: () => Promise<T>;
}): Promise<T> {
  const pipeline = redis.pipeline();
  pipeline.incr(`${ACTIVE_USERS_PREFIX}${sandboxId}`);
  pipeline.expire(`${ACTIVE_USERS_PREFIX}${sandboxId}`, 10 * 60); // 10 minutes
  const [activeUsersAfterIncrement, _] = await pipeline.exec();
  if (!activeUsersAfterIncrement) {
    throw new Error("Failed to acquire sandbox resource");
  }
  console.log(
    `withSandboxResource(${label}): activeUsers after increment`,
    activeUsersAfterIncrement,
  );
  try {
    return await callback();
  } finally {
    try {
      const activeUsersAfterDecrement = await redis.decr(
        `${ACTIVE_USERS_PREFIX}${sandboxId}`,
      );
      console.log(
        `withSandboxResource(${label}): activeUsers after decrement`,
        activeUsersAfterDecrement,
      );
    } catch (e) {
      console.error("Failed to decrement active users for sandbox", e);
    }
  }
}

export async function getActiveUsers(sandboxId: string) {
  const activeUsers = await redis.get(`${ACTIVE_USERS_PREFIX}${sandboxId}`);
  if (!activeUsers) {
    return 0;
  }
  const activeUsersParsed = parseInt(activeUsers as string);
  if (isNaN(activeUsersParsed)) {
    console.error(
      `Invalid active users for sandbox ${sandboxId}: ${activeUsers}`,
    );
    await redis.del(`${ACTIVE_USERS_PREFIX}${sandboxId}`);
    return 0;
  }
  return activeUsersParsed;
}

export async function getActiveThreadChats(sandboxId: string) {
  const activeThreadChats = await redis.smembers(
    `${THREAD_CHATS_PREFIX}${sandboxId}`,
  );
  return activeThreadChats;
}

export async function getTerminalStatus(sandboxId: string) {
  const terminalStatus = await redis.get(
    `${TERMINAL_STATUS_PREFIX}${sandboxId}`,
  );
  if (!terminalStatus) {
    return 0;
  }
  const terminalStatusParsed = parseInt(terminalStatus as string);
  if (terminalStatusParsed !== 0 && terminalStatusParsed !== 1) {
    console.error(
      `Invalid terminal status for sandbox ${sandboxId}: ${terminalStatus}`,
    );
    await redis.del(`${TERMINAL_STATUS_PREFIX}${sandboxId}`);
    return 0;
  }
  return terminalStatusParsed;
}

export async function shouldHibernateSandbox(sandboxId: string) {
  const [activeUsers, activeThreadChats, terminalStatus] = await Promise.all([
    getActiveUsers(sandboxId),
    getActiveThreadChats(sandboxId),
    getTerminalStatus(sandboxId),
  ]);
  const shouldHibernate =
    activeUsers <= 0 && activeThreadChats.length === 0 && terminalStatus === 0;
  console.log("shouldHibernateSandbox", {
    sandboxId,
    activeUsers,
    activeThreadChats,
    terminalStatus,
    shouldHibernate,
  });
  return shouldHibernate;
}

/**
 * Track activity for a sandbox
 */
export async function trackSandboxActivity(sandboxId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.set(`${LAST_ACTIVITY_PREFIX}${sandboxId}`, Date.now().toString());
  pipeline.expire(
    `${LAST_ACTIVITY_PREFIX}${sandboxId}`,
    LAST_ACTIVITY_TTL_SECONDS,
  );
  await pipeline.exec();
}

/**
 * Get the last activity timestamp for a sandbox
 */
export async function getLastActivity(
  sandboxId: string,
): Promise<number | null> {
  const lastActivity = await redis.get(`${LAST_ACTIVITY_PREFIX}${sandboxId}`);
  if (!lastActivity) {
    return null;
  }
  const timestamp = parseInt(lastActivity as string, 10);
  if (isNaN(timestamp)) {
    console.error(
      `Invalid last activity timestamp for sandbox ${sandboxId}: ${lastActivity}`,
    );
    await redis.del(`${LAST_ACTIVITY_PREFIX}${sandboxId}`);
    return null;
  }
  return timestamp;
}

/**
 * Check if a sandbox has been inactive for longer than the threshold
 */
export async function isInactiveSandbox(
  sandboxId: string,
  thresholdMs: number = DEFAULT_INACTIVITY_THRESHOLD_MS,
): Promise<boolean> {
  const lastActivity = await getLastActivity(sandboxId);
  if (lastActivity === null) {
    // No activity recorded, consider inactive
    return true;
  }
  const elapsed = Date.now() - lastActivity;
  return elapsed > thresholdMs;
}

/**
 * Check if a sandbox should be hibernated due to inactivity
 * This combines the resource check with the inactivity check
 */
export async function shouldHibernateDueToInactivity(
  sandboxId: string,
  thresholdMs: number = DEFAULT_INACTIVITY_THRESHOLD_MS,
): Promise<{
  shouldHibernate: boolean;
  reason: string;
  details: {
    activeUsers: number;
    activeThreadChats: string[];
    terminalStatus: number;
    isInactive: boolean;
    lastActivityMs: number | null;
    inactivityThresholdMs: number;
  };
}> {
  const [activeUsers, activeThreadChats, terminalStatus, lastActivity] =
    await Promise.all([
      getActiveUsers(sandboxId),
      getActiveThreadChats(sandboxId),
      getTerminalStatus(sandboxId),
      getLastActivity(sandboxId),
    ]);

  const isInactive =
    lastActivity === null || Date.now() - lastActivity > thresholdMs;

  const hasNoResources =
    activeUsers <= 0 && activeThreadChats.length === 0 && terminalStatus === 0;

  const shouldHibernate = hasNoResources && isInactive;

  let reason = "";
  if (shouldHibernate) {
    reason = "No active resources and inactive";
  } else if (!hasNoResources) {
    const reasons = [];
    if (activeUsers > 0) reasons.push(`${activeUsers} active users`);
    if (activeThreadChats.length > 0)
      reasons.push(`${activeThreadChats.length} active thread chats`);
    if (terminalStatus > 0) reasons.push("terminal is active");
    reason = `Resources in use: ${reasons.join(", ")}`;
  } else {
    reason = "Resources available but still within activity threshold";
  }

  return {
    shouldHibernate,
    reason,
    details: {
      activeUsers,
      activeThreadChats,
      terminalStatus,
      isInactive,
      lastActivityMs: lastActivity,
      inactivityThresholdMs: thresholdMs,
    },
  };
}

/**
 * Get all sandbox IDs that are being tracked for activity
 */
export async function getTrackedSandboxIds(): Promise<string[]> {
  const keys = await redis.keys(`${LAST_ACTIVITY_PREFIX}*`);
  return keys.map((key) => key.replace(LAST_ACTIVITY_PREFIX, ""));
}

/**
 * Clear all activity tracking data for a sandbox
 */
export async function clearSandboxTracking(sandboxId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(`${THREAD_CHATS_PREFIX}${sandboxId}`);
  pipeline.del(`${TERMINAL_STATUS_PREFIX}${sandboxId}`);
  pipeline.del(`${ACTIVE_USERS_PREFIX}${sandboxId}`);
  pipeline.del(`${LAST_ACTIVITY_PREFIX}${sandboxId}`);
  await pipeline.exec();
}
