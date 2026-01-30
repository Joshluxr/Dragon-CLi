import { SupermemoryClient } from "../client";
import { readStdin, writeOutput } from "./types";
import {
  isDebugEnabled,
  loadSettings,
  getSkipToolsFromEnv,
  getApiKey,
} from "../utils/settings";

const DEFAULT_CAPTURE_TOOLS = ["Edit", "Write", "Bash", "Task"];

async function main(): Promise<void> {
  try {
    // Skip if no API key configured
    if (!getApiKey()) {
      writeOutput({ continue: true });
      return;
    }

    const input = await readStdin();
    const settings = loadSettings();

    // Check if this tool should be captured
    const captureTools =
      settings.captureTools.length > 0
        ? settings.captureTools
        : DEFAULT_CAPTURE_TOOLS;

    const skipTools = [...(settings.skipTools || []), ...getSkipToolsFromEnv()];

    if (!input.toolName || skipTools.includes(input.toolName)) {
      writeOutput({ continue: true });
      return;
    }

    if (!captureTools.includes(input.toolName)) {
      writeOutput({ continue: true });
      return;
    }

    const client = new SupermemoryClient(input.workingDirectory);

    // Format the observation
    const content = formatObservation(input.toolName, input.toolResult);

    if (content) {
      await client.addMemory(content, "tool-observation");
    }

    writeOutput({ continue: true });
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[observation-hook] Error:", error);
    }
    writeOutput({ continue: true });
  }
}

function formatObservation(toolName: string, result?: string): string | null {
  if (!result) return null;

  // Truncate very long results
  const maxLength = 2000;
  const truncated =
    result.length > maxLength
      ? result.slice(0, maxLength) + "...[truncated]"
      : result;

  return `Tool: ${toolName}\nResult: ${truncated}`;
}

main();
