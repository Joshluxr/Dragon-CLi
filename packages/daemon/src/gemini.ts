import { nanoid } from "nanoid/non-secure";
import type { JsonStreamEvent } from "@google/gemini-cli-core";
import { IDaemonRuntime } from "./runtime";
import { ClaudeMessage } from "./shared";

const PROMPT_FLAG_DEPRECATION_WARNING =
  "The --prompt (-p) flag has been deprecated and will be removed in a future version";

/**
 * Create a command to run the Gemini CLI with the given prompt.
 *
 * @param runtime - The daemon runtime
 * @param prompt - The prompt to send to Gemini
 * @returns The shell command to execute
 */
export function geminiCommand({
  runtime,
  prompt,
  model,
  sessionId,
}: {
  runtime: IDaemonRuntime;
  prompt: string;
  model: string;
  sessionId: string | null;
}): string {
  // Write prompt to a temporary file
  const tmpFileName = `/tmp/gemini-prompt-${nanoid()}.txt`;
  runtime.writeFileSync(tmpFileName, prompt);
  // Build the command pipeline
  const parts = [
    "cat",
    tmpFileName,
    "|",
    "gemini",
    "--model",
    model,
    // Allow gemini to read files outside the repo, for images, attachments etc.
    "--include-directories",
    "/",
    "--yolo", // Skip confirmation prompts
    "--output-format",
    "stream-json",
    // Resume the latest session if sessionId is provided
    ...(sessionId ? ["--resume", "--prompt", "' '"] : []),
  ];
  return parts.join(" ");
}

/**
 * State for accumulating delta messages
 */
export interface GeminiParserState {
  accumulatedContent: string;
  lastMessageType: string | null;
}

/**
 * Create a new parser state
 */
export function createGeminiParserState(): GeminiParserState {
  return {
    accumulatedContent: "",
    lastMessageType: null,
  };
}

/**
 * Parse a single line of Gemini JSON output into ClaudeMessage format
 *
 * @param line - A single line of JSON output from Gemini CLI
 * @param runtime - The daemon runtime
 * @param state - Parser state for accumulating deltas
 * @returns An array of ClaudeMessages (empty if the line should be skipped)
 */
export function parseGeminiLine({
  line,
  runtime,
  state,
}: {
  line: string;
  runtime: IDaemonRuntime;
  state: GeminiParserState;
}): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];

  // Try to parse as JSON
  let geminiMsg: JsonStreamEvent;
  try {
    geminiMsg = JSON.parse(line);
  } catch (e) {
    // Not JSON, treat as regular assistant text
    messages.push({
      type: "assistant",
      message: { role: "assistant", content: line },
      parent_tool_use_id: null,
      session_id: "",
    });
    return messages;
  }

  const msgType = geminiMsg.type;

  // Check if we're transitioning from one message type to another
  if (state.lastMessageType && state.lastMessageType !== msgType) {
    // Flush accumulated content if we have any
    if (state.accumulatedContent && state.lastMessageType === "message") {
      messages.push({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: state.accumulatedContent }],
        },
        parent_tool_use_id: null,
        session_id: "",
      });
      state.accumulatedContent = "";
    }
  }

  switch (msgType) {
    case "init": {
      state.lastMessageType = msgType;
      messages.push({
        type: "system",
        subtype: "init",
        session_id: geminiMsg.session_id || "",
        tools: [],
        mcp_servers: [],
      });
      return messages;
    }
    case "message": {
      state.lastMessageType = msgType;
      if (geminiMsg.role === "assistant") {
        // Ignore deprecation warning
        if (geminiMsg.content.startsWith(PROMPT_FLAG_DEPRECATION_WARNING)) {
          return messages;
        }
        // Accumulate content from deltas
        if (geminiMsg.delta) {
          state.accumulatedContent += geminiMsg.content;
        } else {
          // Non-delta message - send immediately
          messages.push({
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "text", text: geminiMsg.content }],
            },
            parent_tool_use_id: null,
            session_id: "",
          });
        }
      }
      return messages;
    }
    case "tool_use": {
      state.lastMessageType = msgType;
      messages.push({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: geminiMsg.tool_name,
              input: geminiMsg.parameters,
              id: geminiMsg.tool_id,
            },
          ],
        },
        parent_tool_use_id: null,
        session_id: "",
      });
      return messages;
    }
    case "tool_result": {
      state.lastMessageType = msgType;
      const isError = geminiMsg.status === "error";
      const content = isError
        ? geminiMsg.error
          ? `${geminiMsg.error.type}: ${geminiMsg.error.message}`
          : "Tool execution failed"
        : geminiMsg.output || "Tool execution completed";

      messages.push({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: geminiMsg.tool_id,
              content,
              is_error: isError,
            },
          ],
        },
        parent_tool_use_id: null,
        session_id: "",
      });
      return messages;
    }
    case "error": {
      state.lastMessageType = msgType;
      runtime.logger.warn("Gemini error event", {
        severity: geminiMsg.severity,
        message: geminiMsg.message,
      });

      // Only create error result for actual errors, not warnings
      if (geminiMsg.severity === "error") {
        messages.push({
          type: "result",
          subtype: "error_during_execution",
          session_id: "",
          error: geminiMsg.message,
          is_error: true,
          num_turns: 0,
          duration_ms: 0,
        });
      }
      return messages;
    }
    case "result": {
      state.lastMessageType = msgType;
      if (geminiMsg.status === "error" && geminiMsg.error) {
        messages.push({
          type: "result",
          subtype: "error_during_execution",
          session_id: "",
          error: `${geminiMsg.error.type}: ${geminiMsg.error.message}`,
          is_error: true,
          num_turns: 0,
          duration_ms: geminiMsg.stats?.duration_ms || 0,
        });
      } else if (geminiMsg.status === "success") {
        messages.push({
          type: "result",
          subtype: "success",
          session_id: "",
          is_error: false,
          num_turns: 1,
          duration_ms: geminiMsg.stats?.duration_ms || 0,
          duration_api_ms: geminiMsg.stats?.duration_ms || 0,
          total_cost_usd: 0,
          result: "Task completed successfully",
        });
        if (geminiMsg.stats) {
          runtime.logger.debug("Gemini token usage", {
            input_tokens: geminiMsg.stats.input_tokens,
            output_tokens: geminiMsg.stats.output_tokens,
            total_tokens: geminiMsg.stats.total_tokens,
            duration_ms: geminiMsg.stats.duration_ms,
            tool_calls: geminiMsg.stats.tool_calls,
          });
        }
      }
      return messages;
    }
    default: {
      runtime.logger.warn("Unknown Gemini message type", {
        type: msgType,
        msg: geminiMsg,
      });
      return messages;
    }
  }
}
