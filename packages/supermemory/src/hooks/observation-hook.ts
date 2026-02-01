import { getMemoryRouter } from "../cache/factory";
import { readStdin, writeOutput } from "./types";
import {
  isDebugEnabled,
  loadSettings,
  getSkipToolsFromEnv,
} from "../utils/settings";
import { filterPrivateContent, shouldStore } from "../utils/privacy";

const DEFAULT_CAPTURE_TOOLS = ["Edit", "Write", "Bash", "Task"];

/**
 * Patterns that indicate low-value observations to skip.
 */
const NOISE_PATTERNS = [
  /^error:\s/i,
  /^warning:\s/i,
  /no files found/i,
  /permission denied/i,
  /command not found/i,
  /^\s*$/,
];

async function main(): Promise<void> {
  try {
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

    // Check if observation is worth storing
    if (!shouldCaptureObservation(input.toolName, input.toolResult)) {
      if (isDebugEnabled()) {
        console.log(
          `[observation-hook] Skipping low-value observation from ${input.toolName}`,
        );
      }
      writeOutput({ continue: true });
      return;
    }

    const router = await getMemoryRouter(input.workingDirectory);

    // Format and filter the observation
    let content = formatObservation(input.toolName, input.toolResult);

    if (content) {
      // Apply privacy filtering if enabled
      if (settings.privacyFilter) {
        const filterResult = filterPrivateContent(content);
        content = filterResult.filtered;

        if (filterResult.removedCount > 0 && isDebugEnabled()) {
          console.log(
            `[observation-hook] Filtered ${filterResult.removedCount} private sections`,
          );
        }

        if (filterResult.warnings.length > 0 && isDebugEnabled()) {
          console.log(
            `[observation-hook] Privacy warnings:`,
            filterResult.warnings,
          );
        }
      }

      // Check if content is still worth storing after filtering
      if (shouldStore(content)) {
        await router.addMemory(content, "tool-observation");
      }
    }

    writeOutput({ continue: true });
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[observation-hook] Error:", error);
    }
    writeOutput({ continue: true });
  }
}

/**
 * Determines if an observation is worth capturing.
 */
function shouldCaptureObservation(toolName: string, result?: string): boolean {
  if (!result) return false;

  // Skip empty or very short results
  if (result.trim().length < 50) return false;

  // Skip common noise patterns
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(result)) return false;
  }

  // For Read/Glob/Grep, be more selective (read-only operations)
  if (["Read", "Glob", "Grep"].includes(toolName)) {
    // Only capture if the result seems significant
    return result.length > 500;
  }

  return true;
}

/**
 * Formats an observation for storage, with smart summarization.
 */
function formatObservation(toolName: string, result?: string): string | null {
  if (!result) return null;

  const maxLength = 2000;

  // For file edits, capture the key change
  if (toolName === "Edit" || toolName === "Write") {
    if (result.length > maxLength) {
      // Extract key parts: file path and change summary
      const lines = result.split("\n");
      const firstLines = lines.slice(0, 10).join("\n");
      const lastLines = lines.slice(-5).join("\n");
      return `Tool: ${toolName}\nResult (summarized):\n${firstLines}\n...[${lines.length - 15} lines omitted]...\n${lastLines}`;
    }
  }

  // For bash, capture command and key output
  if (toolName === "Bash") {
    const lines = result.split("\n");
    if (lines.length > 20) {
      const firstLines = lines.slice(0, 10).join("\n");
      const lastLines = lines.slice(-5).join("\n");
      return `Tool: ${toolName}\nResult (summarized):\n${firstLines}\n...[${lines.length - 15} lines omitted]...\n${lastLines}`;
    }
  }

  // Standard truncation for other tools
  const truncated =
    result.length > maxLength
      ? result.slice(0, maxLength) + "...[truncated]"
      : result;

  return `Tool: ${toolName}\nResult: ${truncated}`;
}

main();
