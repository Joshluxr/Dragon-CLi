import { getMemoryRouter } from "../cache/factory";
import { readStdin, writeOutput } from "./types";
import { isDebugEnabled } from "../utils/settings";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const input = await readStdin();

    // Get transcript from file or input
    let transcript = input.transcript;
    if (!transcript && input.transcriptPath) {
      try {
        transcript = fs.readFileSync(input.transcriptPath, "utf-8");
      } catch {
        // Transcript file not available
      }
    }

    if (!transcript) {
      writeOutput({ continue: true });
      return;
    }

    const router = await getMemoryRouter(input.workingDirectory);

    // Extract summary from transcript
    const summary = extractSummary(transcript);

    if (summary) {
      await router.addMemory(summary, "session-summary");
    }

    writeOutput({ continue: true });
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[summary-hook] Error:", error);
    }
    writeOutput({ continue: true });
  }
}

function extractSummary(transcript: string): string | null {
  // Extract key information from the transcript
  const lines = transcript.split("\n");

  // Find user messages and assistant key actions
  const userMessages: string[] = [];
  const actions: string[] = [];

  for (const line of lines) {
    if (line.startsWith("User:") || line.startsWith("Human:")) {
      userMessages.push(line.replace(/^(User|Human):\s*/, ""));
    }
    // Look for tool use patterns
    if (
      line.includes("Edit") ||
      line.includes("Write") ||
      line.includes("created") ||
      line.includes("modified")
    ) {
      actions.push(line.trim());
    }
  }

  if (userMessages.length === 0 && actions.length === 0) {
    return null;
  }

  const summary = [
    "Session Summary:",
    "",
    "User Requests:",
    ...userMessages.slice(0, 5).map((m) => `- ${m.slice(0, 200)}`),
    "",
    "Key Actions:",
    ...actions.slice(0, 10).map((a) => `- ${a.slice(0, 200)}`),
  ].join("\n");

  return summary;
}

main();
