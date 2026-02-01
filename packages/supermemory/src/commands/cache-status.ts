#!/usr/bin/env node
/**
 * Cache status command - displays local cache information.
 */

import { getMemoryRouter } from "../cache/factory";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function main(): Promise<void> {
  try {
    const router = await getMemoryRouter();

    if (!router.isCacheAvailable()) {
      console.log("Cache Status: DISABLED");
      console.log(
        "Reason: Platform not supported or cache disabled in settings",
      );
      console.log("");
      console.log("Requirements:");
      console.log("  - Python 3.10-3.12");
      console.log("  - Linux x86_64 or macOS ARM64");
      console.log("  - zvec package installed: pip install zvec");
      return;
    }

    const stats = await router.getCacheStats();

    console.log("Cache Status: ENABLED");
    console.log("");
    console.log("Statistics:");
    console.log(`  Items:           ${stats.item_count}`);
    console.log(`  Size:            ${formatBytes(stats.size_bytes)}`);
    console.log(
      `  Index Complete:  ${(stats.index_completeness * 100).toFixed(1)}%`,
    );
    console.log("");
    console.log("Storage: Local only (Zvec vector cache)");
  } catch (error) {
    console.error("Error getting cache status:", error);
    process.exit(1);
  }
}

main();
