#!/usr/bin/env node
/**
 * Sync now command - deprecated.
 *
 * The memory system now operates entirely locally without external sync.
 * This command is kept for backwards compatibility but performs no action.
 */

async function main(): Promise<void> {
  console.log("Memory system now operates locally without external sync.");
  console.log("No sync operation needed.");
  console.log("");
  console.log("All memories are stored locally in the Zvec cache.");
}

main();
