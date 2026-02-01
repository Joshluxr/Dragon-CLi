#!/usr/bin/env node
/**
 * Cache clear command - removes all locally cached memories.
 */

import { getMemoryRouter } from "../cache/factory";

async function main(): Promise<void> {
  try {
    const router = await getMemoryRouter();

    if (!router.isCacheAvailable()) {
      console.log("Cache is not available.");
      return;
    }

    const statsBefore = await router.getCacheStats();
    console.log(`Clearing ${statsBefore.item_count} cached items...`);

    await router.clearCache();

    console.log("Cache cleared successfully.");
  } catch (error) {
    console.error("Error clearing cache:", error);
    process.exit(1);
  }
}

main();
