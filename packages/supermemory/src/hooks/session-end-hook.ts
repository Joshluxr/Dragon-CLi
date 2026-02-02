import { getMemoryRouter } from "../cache/factory";
import { readStdin, writeOutput } from "./types";
import { isDebugEnabled, loadSettings } from "../utils/settings";
import { filterPrivateContent } from "../utils/privacy";

/**
 * Session End Hook
 *
 * Captures session summary when Claude Code session ends.
 * Separate from Stop hook which triggers on pause/interrupt.
 */

interface SessionEndInput {
  session_id?: string;
  workingDirectory?: string;
  transcript?: string;
  exit_reason?: "completed" | "error" | "interrupted" | "timeout";
}

async function main(): Promise<void> {
  try {
    const input: SessionEndInput = await readStdin();
    const settings = loadSettings();

    if (!input.session_id && !input.transcript) {
      writeOutput({ continue: true });
      return;
    }

    const router = await getMemoryRouter(input.workingDirectory);

    // Extract session summary
    const summary = extractSessionSummary(
      input.transcript || "",
      input.exit_reason,
    );

    if (summary) {
      // Filter private content
      let filteredSummary = summary;
      if (settings.privacyFilter) {
        const filterResult = filterPrivateContent(summary);
        filteredSummary = filterResult.filtered;
      }

      await router.addMemory(filteredSummary, "session-summary");

      if (isDebugEnabled()) {
        console.log("[session-end-hook] Stored session summary");
      }
    }

    // Extract and store key decisions
    const decisions = extractDecisions(input.transcript || "");
    for (const decision of decisions) {
      let filteredDecision = decision;
      if (settings.privacyFilter) {
        const filterResult = filterPrivateContent(decision);
        filteredDecision = filterResult.filtered;
      }

      await router.addMemory(filteredDecision, "decision");
    }

    if (isDebugEnabled() && decisions.length > 0) {
      console.log(`[session-end-hook] Stored ${decisions.length} decisions`);
    }

    writeOutput({ continue: true });
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[session-end-hook] Error:", error);
    }
    writeOutput({ continue: true });
  }
}

/**
 * Extracts a session summary from the transcript.
 */
function extractSessionSummary(
  transcript: string,
  exitReason?: string,
): string | null {
  if (!transcript || transcript.length < 100) return null;

  const lines = transcript.split("\n");

  // Get first user message (intent)
  const firstUserMsg = lines.find(
    (l) => l.startsWith("User:") || l.startsWith("Human:"),
  );

  // Get key actions (edits, writes, etc.)
  const actions = lines
    .filter((l) =>
      /\b(Edit|Write|created|modified|deleted|fixed|implemented|added|removed|updated)\b/i.test(
        l,
      ),
    )
    .slice(0, 10);

  // Get last assistant message (conclusion)
  const lastAssistantMsg = lines
    .filter((l) => l.startsWith("Assistant:"))
    .pop();

  if (!firstUserMsg && !lastAssistantMsg) return null;

  const parts: string[] = ["## Session Summary"];

  if (exitReason) {
    parts.push(`**Exit Reason:** ${exitReason}`);
  }

  if (firstUserMsg) {
    const request = firstUserMsg.replace(/^(User:|Human:)\s*/i, "");
    parts.push(`**Request:** ${request.substring(0, 200)}`);
  }

  if (actions.length > 0) {
    parts.push("");
    parts.push("**Key Actions:**");
    for (const action of actions) {
      parts.push(`- ${action.substring(0, 150)}`);
    }
  }

  if (lastAssistantMsg) {
    const conclusion = lastAssistantMsg.replace(/^Assistant:\s*/i, "");
    parts.push("");
    parts.push(`**Conclusion:** ${conclusion.substring(0, 300)}`);
  }

  return parts.join("\n");
}

/**
 * Extracts key decisions from the transcript.
 */
function extractDecisions(transcript: string): string[] {
  const decisions: string[] = [];
  const seenDecisions = new Set<string>();

  // Decision indicator patterns
  const decisionPatterns = [
    /decided to (.+?)(?:\.|$)/gi,
    /chose (.+?) (?:because|over|instead)/gi,
    /(?:will|going to) use (.+?) for/gi,
    /the approach (?:is|will be) (.+?)(?:\.|$)/gi,
    /selected (.+?) as/gi,
  ];

  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(transcript)) !== null) {
      const decision = match[1]?.trim();
      if (decision && decision.length > 15 && decision.length < 300) {
        // Deduplicate
        const normalized = decision.toLowerCase();
        if (!seenDecisions.has(normalized)) {
          seenDecisions.add(normalized);
          decisions.push(`Decision: ${decision}`);
        }
      }
    }
  }

  // Limit to top 5 decisions
  return decisions.slice(0, 5);
}

main();
