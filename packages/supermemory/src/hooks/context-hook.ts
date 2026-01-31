import { SupermemoryClient } from "../client";
import { readStdin, writeOutput, HookOutput } from "./types";
import { isDebugEnabled, getApiKey, loadSettings } from "../utils/settings";

/**
 * Context Hook
 *
 * Now implements progressive disclosure instead of full context injection.
 * Informs Claude about available memory tools instead of dumping all memories.
 */

async function main(): Promise<void> {
  try {
    const settings = loadSettings();
    const useProgressiveDisclosure = settings.progressiveDisclosure ?? true;

    // Skip if no API key configured
    if (!getApiKey()) {
      writeOutput({ continue: true });
      return;
    }

    const input = await readStdin();
    const client = new SupermemoryClient(input.workingDirectory);

    const output: HookOutput = {
      continue: true,
    };

    if (useProgressiveDisclosure) {
      // New progressive disclosure approach - just inform about memory system
      const context = await client.getContext();

      if (context.itemCount > 0) {
        output.context = `
<system-reminder>
## Memory System Available

You have access to a persistent memory system with ${context.itemCount} stored memories via MCP tools:

**Progressive Disclosure Tools** (saves tokens by retrieving only what you need):
- **MemoryTree**: View hierarchical memory index (~200 tokens) - best for understanding available context
- **MemoryNavigate nodeId="..."**: Drill into specific branches (~100 tokens)
- **MemorySearch query="..."**: Semantic search (~50-100 tokens per result)
- **MemoryGet ids=[...]**: Retrieve full content (~500-1000 tokens per item)
- **MemoryTimeline anchor="..."**: Chronological view around a point
- **MemoryAdd content="..."**: Store important decisions for future

**Quick start**: If this project looks unfamiliar, try:
\`MemoryTree\` to see the memory hierarchy, then navigate to relevant sections.

This approach saves ~10x tokens compared to loading all memories upfront.
</system-reminder>
`;
      }
    } else {
      // Legacy: Full context injection (for backwards compatibility)
      const context = await client.getContext();

      if (context.itemCount > 0) {
        output.context = `
<system-reminder>
## Supermemory - Previous Context

The following memories from previous sessions may be relevant to this conversation:

${context.xml}

Use this context to maintain continuity and recall past work when relevant.
</system-reminder>
`;
      }
    }

    writeOutput(output);
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[context-hook] Error:", error);
    }
    // Always allow session to continue
    writeOutput({ continue: true });
  }
}

main();
