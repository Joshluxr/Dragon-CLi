import { SupermemoryClient } from "../client";
import { readStdin, writeOutput, HookOutput } from "./types";
import { isDebugEnabled, getApiKey } from "../utils/settings";

async function main(): Promise<void> {
  try {
    // Skip if no API key configured
    if (!getApiKey()) {
      writeOutput({ continue: true });
      return;
    }

    const input = await readStdin();
    const client = new SupermemoryClient(input.workingDirectory);

    const context = await client.getContext();

    const output: HookOutput = {
      continue: true,
    };

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
