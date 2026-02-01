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

  // Determine cache settings (with defaults) - now local-only
  const cacheSettings = {
    enabled: true,
    mode: "cache-only" as const,
    syncEnabled: false, // No external sync needed
    syncIntervalMinutes: 0,
    maxCacheSizeMb: 100,
    ttlDays: 90, // 90 days for local-only storage
    ...userCacheSettings,
  };

  // Check if cache should be enabled
  const zvecAvailable = await checkZvecSupport();
  const cacheEnabled = cacheSettings.enabled && zvecAvailable;

  const config: MemoryRouterConfig = {
    mode: "cache-only", // Always local-only
    cacheEnabled,
    syncEnabled: false, // No external sync
    syncIntervalMs: 0,
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
