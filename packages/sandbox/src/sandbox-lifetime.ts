/** Idle / provider TTL for sandboxes (E2B, OpenSandbox create+renew, Docker auto-pause timer). */
export const sandboxDefaultLifetimeMs = 48 * 60 * 60 * 1000; // 48 hours

export const sandboxDefaultLifetimeSec = Math.floor(
  sandboxDefaultLifetimeMs / 1000,
);

/** Upper bound for create+resume in www; must exceed provider lifetime. */
export const sandboxTimeoutMs = sandboxDefaultLifetimeMs + 10 * 60 * 1000;
