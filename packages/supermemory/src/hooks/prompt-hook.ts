import { SupermemoryClient } from "../client";
import { readStdin, writeOutput } from "./types";
import { isDebugEnabled, getApiKey } from "../utils/settings";

async function main(): Promise<void> {
  try {
    // Skip if no API key configured
    if (!getApiKey()) {
      writeOutput({ continue: true });
      return;
    }

    const input = await readStdin();

    // Skip if no prompt provided
    if (!input.userPrompt) {
      writeOutput({ continue: true });
      return;
    }

    const client = new SupermemoryClient(input.workingDirectory);

    // Store the prompt as a memory entry
    await client.addMemory(`User prompt: ${input.userPrompt}`, "user-prompt");

    writeOutput({ continue: true });
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[prompt-hook] Error:", error);
    }
    writeOutput({ continue: true });
  }
}

main();
