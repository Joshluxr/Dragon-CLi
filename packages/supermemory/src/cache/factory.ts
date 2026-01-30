/**
 * Factory for creating and managing MemoryRouter instances.
 */

import { MemoryRouter } from "./router";
import { checkZvecSupport } from "./platform";
import { loadSettings } from "../utils/settings";
import type { MemoryRouterConfig } from "./types";

let globalRouter: MemoryRouter | null = null;

/**
 * Get or create a MemoryRouter instance.
 */
export async function getMemoryRouter(
  workingDir?: string,
): Promise<MemoryRouter> {
  if (globalRouter) {
    return globalRouter;
  }

  const settings = loadSettings();

  // Define cache config type
  interface CacheConfig {
    enabled?: boolean;
    mode?: "hybrid" | "cache-only" | "remote-only";
    syncEnabled?: boolean;
    syncIntervalMinutes?: number;
    maxCacheSizeMb?: number;
    ttlDays?: number;
  }

  // Get cache settings from settings object (if present)
  const rawSettings = settings as typeof settings & { cache?: CacheConfig };
  const userCacheSettings = rawSettings.cache || {};

  // Determine cache settings (with defaults)
  const cacheSettings = {
    enabled: true,
    mode: "hybrid" as const,
    syncEnabled: true,
    syncIntervalMinutes: 5,
    maxCacheSizeMb: 100,
    ttlDays: 30,
    ...userCacheSettings,
  };

  // Check if cache should be enabled
  const zvecAvailable = await checkZvecSupport();
  const cacheEnabled = cacheSettings.enabled && zvecAvailable;

  const config: MemoryRouterConfig = {
    mode: cacheEnabled ? cacheSettings.mode : "remote-only",
    cacheEnabled,
    syncEnabled: cacheSettings.syncEnabled,
    syncIntervalMs: cacheSettings.syncIntervalMinutes * 60 * 1000,
    maxCacheSize: settings.maxProfileItems,
    ttlSeconds: cacheSettings.ttlDays * 24 * 60 * 60,
  };

  globalRouter = new MemoryRouter(workingDir, config);
  await globalRouter.initialize();

  return globalRouter;
}

/**
 * Reset the global router instance.
 */
export function resetRouter(): void {
  if (globalRouter) {
    globalRouter.stopBackgroundSync();
    globalRouter = null;
  }
}

/**
 * Shutdown and cleanup the global router.
 */
export async function shutdownRouter(): Promise<void> {
  if (globalRouter) {
    await globalRouter.shutdown();
    globalRouter = null;
  }
}
