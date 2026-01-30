#!/usr/bin/env node
/**
 * Sync now command - manually triggers synchronization.
 */

import { getMemoryRouter } from "../cache/factory";

async function main(): Promise<void> {
  try {
    const router = await getMemoryRouter();

    if (!router.isCacheAvailable()) {
      console.log("Cannot sync: Cache is not available.");
      console.log("Supermemory is used directly without local caching.");
      return;
    }

    console.log("Starting sync...");
    const result = await router.syncNow();

    console.log(`Sync completed in ${result.duration}ms`);
    console.log("");
    console.log("Results:");
    console.log(`  Uploaded:   ${result.uploaded}`);
    console.log(`  Downloaded: ${result.downloaded}`);
    console.log(`  Conflicts:  ${result.conflicts}`);
    console.log(`  Success:    ${result.success ? "Yes" : "No"}`);

    if (result.errors.length > 0) {
      console.log("");
      console.log("Errors:");
      result.errors.forEach((e) => console.log(`  - ${e}`));
    }
  } catch (error) {
    console.error("Error during sync:", error);
    process.exit(1);
  }
}

main();
