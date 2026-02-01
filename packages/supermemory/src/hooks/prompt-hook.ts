import { getMemoryRouter } from "../cache/factory";
import { readStdin, writeOutput } from "./types";
import { isDebugEnabled } from "../utils/settings";

async function main(): Promise<void> {
  try {
    const input = await readStdin();

    // Skip if no prompt provided
    if (!input.userPrompt) {
      writeOutput({ continue: true });
      return;
    }

    const router = await getMemoryRouter(input.workingDirectory);

    // Store the prompt as a memory entry
    await router.addMemory(`User prompt: ${input.userPrompt}`, "user-prompt");

    writeOutput({ continue: true });
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[prompt-hook] Error:", error);
    }
    writeOutput({ continue: true });
  }
}

main();
