#!/usr/bin/env node
/**
 * Sync status command - shows sync state and pending operations.
 */

import { getMemoryRouter } from "../cache/factory";

function formatTime(timestamp: number): string {
  if (!timestamp) return "Never";
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  return new Date(timestamp).toLocaleString();
}

async function main(): Promise<void> {
  try {
    const router = await getMemoryRouter();

    if (!router.isCacheAvailable()) {
      console.log("Sync Status: N/A (Cache disabled)");
      console.log("");
      console.log(
        "When cache is disabled, all operations go directly to Supermemory.",
      );
      return;
    }

    const health = await router.getHealth();
    const stats = await router.getCacheStats();

    console.log("Sync Status");
    console.log("===========");
    console.log("");
    console.log(`Last Sync:        ${formatTime(health.lastSyncTime)}`);
    console.log(
      `Supermemory:      ${health.supermemoryOnline ? "Connected" : "Disconnected"}`,
    );
    console.log("");
    console.log("Pending Operations:");
    console.log(`  Uploads:        ${health.pendingUploads}`);
    console.log("");
    console.log("Cache:");
    console.log(`  Total Items:    ${stats.item_count}`);

    if (health.pendingUploads > 0) {
      console.log("");
      console.log(
        "Note: Run '/sync' to upload pending memories to Supermemory.",
      );
    }
  } catch (error) {
    console.error("Error getting sync status:", error);
    process.exit(1);
  }
}

main();
