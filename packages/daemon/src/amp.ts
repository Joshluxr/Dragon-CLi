import { nanoid } from "nanoid/non-secure";
import { IDaemonRuntime } from "./runtime";

/**
 * Get the Amp API key from the environment.
 * The key is passed from the sandbox environment variables.
 */
export function getAmpApiKeyOrNull(_runtime: IDaemonRuntime): string {
  return process.env.AMP_API_KEY ?? "";
}

/**
 * Create a command to run the Amp CLI with the given prompt.
 *
 * The command format is:
 *   cat <prompt_file> | amp [threads continue <sessionId>] --execute --stream-json --dangerously-allow-all
 *
 * @param runtime - The daemon runtime
 * @param prompt - The prompt to send to Gemini
 * @returns The shell command to execute
 */
export function ampCommand({
  runtime,
  prompt,
  sessionId,
}: {
  runtime: IDaemonRuntime;
  prompt: string;
  sessionId: string | null;
}): string {
  // Write prompt to a temporary file
  const tmpFileName = `/tmp/amp-prompt-${nanoid()}.txt`;
  runtime.writeFileSync(tmpFileName, prompt);
  // Build the command pipeline
  const parts = ["cat", tmpFileName, "|", "amp"];
  if (sessionId) {
    parts.push("threads continue", sessionId);
  }
  parts.push("--execute", "--stream-json", "--dangerously-allow-all"); // Skip confirmation prompts
  return parts.join(" ");
}
