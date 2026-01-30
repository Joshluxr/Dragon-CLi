import { AIAgent } from "./types";

type ToolCall = {
  name: string;
  parameters: Record<string, unknown>;
  result?: string;
};

/**
 * Configuration for transforming tool calls
 */
type ToolCallMapping = {
  /** The Claude tool name to use (if different from the source tool name) */
  claudeToolName?: string;
  /** Transform the input parameters */
  transformParams?: (
    params: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Transform the result/output */
  transformResult?: (result: string) => string;
};

/**
 * Log an error that occurred during tool call transformation.
 * Provides consistent error logging format across all agent transformations.
 */
function logTransformError(
  agentName: string,
  toolName: string,
  stage: "parameters" | "result",
  error: unknown,
): void {
  console.error(
    `[${agentName}] Error transforming ${stage} for ${toolName}:`,
    error,
  );
}

/**
 * Apply tool call transformations based on a mapping configuration
 */
function applyToolCallMapping<T extends ToolCall>(
  toolCall: T,
  mapping: ToolCallMapping,
  agentName: string,
): T {
  let parameters = toolCall.parameters;
  if (mapping.transformParams) {
    try {
      parameters = mapping.transformParams(parameters);
    } catch (error) {
      logTransformError(agentName, toolCall.name, "parameters", error);
    }
  }

  let result = toolCall.result;
  if (result && mapping.transformResult) {
    try {
      result = mapping.transformResult(result);
    } catch (error) {
      logTransformError(agentName, toolCall.name, "result", error);
    }
  }

  return {
    ...toolCall,
    name: mapping.claudeToolName ?? toolCall.name,
    parameters,
    result,
  };
}

export function normalizeToolCall<T extends ToolCall>(
  agent: AIAgent,
  toolCall: T,
): T {
  // Handle MCP tools (agent-agnostic)
  if (toolCall.name === "mcp__terry__SuggestFollowupTask") {
    return {
      ...toolCall,
      name: "SuggestFollowupTask",
      parameters: toolCall.parameters,
    };
  }

  // Apply agent-specific mappings
  switch (agent) {
    case "amp": {
      const mapping = AMP_TOOL_CALL_MAPPINGS[toolCall.name];
      if (mapping) {
        return applyToolCallMapping(toolCall, mapping, "amp");
      }
      break;
    }
    case "opencode": {
      const mapping = OPENCODE_TOOL_CALL_MAPPINGS[toolCall.name];
      if (mapping) {
        return applyToolCallMapping(toolCall, mapping, "opencode");
      }
      break;
    }
    case "gemini": {
      const mapping = GEMINI_TOOL_CALL_MAPPINGS[toolCall.name];
      if (mapping) {
        return applyToolCallMapping(toolCall, mapping, "gemini");
      }
      break;
    }
  }

  return toolCall;
}

/**
 * Tool call mapping configuration for Amp
 * Maps Amp tool names to Claude tool names and parameter transformations
 */
const AMP_TOOL_CALL_MAPPINGS: Record<string, ToolCallMapping> = {
  Read: {
    transformResult: (result: string) => {
      const parsed = JSON.parse(result) as { content?: string };
      return parsed.content ?? result;
    },
  },
  edit_file: {
    claudeToolName: "Edit",
    transformParams: (params: Record<string, unknown>) => ({
      file_path: params.path,
      new_string: params.new_str,
      old_string: params.old_str,
    }),
  },
  create_file: {
    claudeToolName: "Write",
    transformParams: (params: Record<string, unknown>) => ({
      file_path: params.path,
      content: params.content,
    }),
  },
  todo_write: {
    claudeToolName: "TodoWrite",
    transformParams: (params: Record<string, unknown>) => {
      return params;
    },
  },
  glob: {
    claudeToolName: "Glob",
    transformResult: (result: string) => {
      const parsed = JSON.parse(result) as unknown;
      if (Array.isArray(parsed)) {
        return (parsed as string[]).join("\n");
      }
      return result;
    },
  },
};

type GeminiTodo = {
  id?: string;
  description?: string;
  status?: string;
};

const GEMINI_TOOL_CALL_MAPPINGS: Record<string, ToolCallMapping> = {
  write_file: {
    claudeToolName: "Write",
  },
  run_shell_command: {
    claudeToolName: "Bash",
  },
  write_todos: {
    claudeToolName: "TodoWrite",
    transformParams: (params: Record<string, unknown>) => ({
      todos: (params.todos as GeminiTodo[]).map((item) => ({
        id: item.id,
        content: item.description,
        status: item.status,
      })),
    }),
  },
  replace: {
    claudeToolName: "Edit",
  },
};

/**
 * Tool call mapping configuration for Opencode
 * Maps Opencode tool names to Claude tool names
 * Opencode uses lowercase tool names that need to be normalized
 */
const OPENCODE_TOOL_CALL_MAPPINGS: Record<string, ToolCallMapping> = {
  // Opencode uses lowercase "todowrite" and "todoread"
  Todowrite: {
    claudeToolName: "TodoWrite",
  },
  Todoread: {
    claudeToolName: "TodoRead",
  },
  // Opencode uses "websearch" but Claude uses "WebSearch"
  Websearch: {
    claudeToolName: "WebSearch",
  },
  Edit: {
    transformParams: (params: Record<string, unknown>) => ({
      file_path: params.filePath,
      old_string: params.oldString,
      new_string: params.newString,
    }),
  },
  Read: {
    transformResult: (result: string) => {
      // Extract the file content between <file> and </file> tags and strip the line numbers
      // Eg. <file>\\n00001| export const add = (a: number, b: number): number => {\\n00002|   return a + b;\\n00003| };\\n00004| \\n</file>
      const match = result.match(/<file>\n([\s\S]*?)\n<\/file>/);
      if (match && match[1]) {
        const fileContent = match[1];
        const lines = fileContent.split("\n");
        let prefixLength: number | undefined;
        const strippedLines: string[] = [];
        for (const line of lines) {
          const match = line.match(/^(\d+\| ).*$/);
          if (match && match[1]) {
            if (prefixLength === undefined) {
              prefixLength = match[1].length;
            }
            if (match[1].length === prefixLength) {
              strippedLines.push(line.slice(prefixLength));
            }
            continue;
          }
          // Just return the original result
          return fileContent;
        }
        return strippedLines.join("\n");
      }
      return result;
    },
  },
  // Other tools (Bash, Edit, Glob, Grep, List, Read, Write) are already correctly capitalized
};
