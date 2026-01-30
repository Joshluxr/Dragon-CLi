/**
 * Custom MCP Tools Types
 *
 * Enables agents to dynamically create, register, and use custom MCP tools:
 * - Agent creates tool definition with schema and implementation
 * - Tool is validated for security and syntax
 * - Tool is registered and becomes available for use
 * - Users can review, approve, and manage custom tools
 */

/**
 * JSON Schema definition for tool parameters
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  enum?: unknown[];
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
}

/**
 * Tool category types
 */
export type ToolCategory =
  | "utility"
  | "integration"
  | "analysis"
  | "automation";

/**
 * Tool runtime environment
 */
export type ToolRuntime = "typescript" | "python";

/**
 * Tool approval status
 */
export type ToolStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "deprecated";

/**
 * Example for tool documentation
 */
export interface ToolExample {
  description: string;
  input: Record<string, unknown>;
  expectedOutput?: unknown;
}

/**
 * Tool definition from agent
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  implementation: string;
  runtime: ToolRuntime;
  examples?: ToolExample[];
  dependencies?: string[];
}

/**
 * Full custom tool record
 */
export interface CustomTool extends ToolDefinition {
  id: string;
  userId: string;
  environmentId?: string;
  version: number;
  status: ToolStatus;
  createdByAgentId?: string;
  createdInThreadId?: string;
  approvedAt?: Date;
  approvedBy?: string;
  usageCount: number;
  lastUsedAt?: Date;
  errorCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Context for tool execution
 */
export interface ToolExecutionContext {
  threadId: string;
  userId: string;
  environmentId?: string;
  workingDirectory?: string;
  timeout: number;
}

/**
 * Result from tool execution
 */
export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  logs?: string[];
  durationMs: number;
}

/**
 * Tool execution log entry
 */
export interface ToolExecutionLog {
  id: string;
  toolId: string;
  threadId: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  durationMs: number;
  executedAt: Date;
}

/**
 * Validation result for tool definitions
 */
export interface ToolValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Security check result for tool implementations
 */
export interface SecurityCheckResult {
  safe: boolean;
  issues: string[];
}

/**
 * Blocked patterns that indicate dangerous operations
 */
export const BLOCKED_PATTERNS: Record<ToolRuntime, RegExp[]> = {
  typescript: [
    /require\s*\(\s*['"]child_process['"]\s*\)/,
    /require\s*\(\s*['"]fs['"]\s*\)/,
    /import\s+.*from\s+['"]child_process['"]/,
    /import\s+.*from\s+['"]fs['"]/,
    /process\.env/,
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    /exec\s*\(/,
    /spawn\s*\(/,
    /__dirname/,
    /__filename/,
  ],
  python: [
    /import\s+os/,
    /import\s+subprocess/,
    /from\s+os\s+import/,
    /from\s+subprocess\s+import/,
    /exec\s*\(/,
    /eval\s*\(/,
    /open\s*\(/,
    /os\.system/,
    /os\.popen/,
    /subprocess\.run/,
    /subprocess\.Popen/,
  ],
};

/**
 * Maximum implementation size in bytes
 */
export const MAX_IMPLEMENTATION_SIZE = 50000;

/**
 * Maximum tool name length
 */
export const MAX_TOOL_NAME_LENGTH = 64;

/**
 * Available tool categories
 */
export const TOOL_CATEGORIES: ToolCategory[] = [
  "utility",
  "integration",
  "analysis",
  "automation",
];

/**
 * Available tool runtimes
 */
export const TOOL_RUNTIMES: ToolRuntime[] = ["typescript", "python"];

/**
 * Maximum description length
 */
export const MAX_DESCRIPTION_LENGTH = 1000;

/**
 * Default tool execution timeout in ms
 */
export const DEFAULT_TOOL_TIMEOUT = 30000;

/**
 * Validate a tool definition
 */
export function validateToolDefinition(
  definition: ToolDefinition,
): ToolValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate name
  if (!/^[a-z][a-z0-9_]*$/.test(definition.name)) {
    errors.push(
      "Tool name must be lowercase, start with letter, contain only letters/numbers/underscores",
    );
  }

  if (definition.name.length > MAX_TOOL_NAME_LENGTH) {
    errors.push(`Tool name must be ${MAX_TOOL_NAME_LENGTH} characters or less`);
  }

  // Validate description
  if (definition.description.length < 10) {
    errors.push("Description must be at least 10 characters");
  }

  if (definition.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`,
    );
  }

  // Validate schema
  if (!definition.inputSchema || typeof definition.inputSchema !== "object") {
    errors.push("Input schema is required and must be an object");
  }

  // Validate implementation length
  if (definition.implementation.length > MAX_IMPLEMENTATION_SIZE) {
    errors.push(
      `Implementation must be ${MAX_IMPLEMENTATION_SIZE / 1000}KB or less`,
    );
  }

  // Check for runtime compatibility
  if (!["typescript", "python"].includes(definition.runtime)) {
    errors.push("Runtime must be 'typescript' or 'python'");
  }

  // Check for empty implementation
  if (!definition.implementation.trim()) {
    errors.push("Implementation cannot be empty");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check tool implementation for security issues
 */
export function checkToolSecurity(
  implementation: string,
  runtime: ToolRuntime,
): SecurityCheckResult {
  const issues: string[] = [];
  const patterns = BLOCKED_PATTERNS[runtime];

  // Check for blocked patterns
  for (const pattern of patterns) {
    if (pattern.test(implementation)) {
      issues.push(`Blocked pattern detected: ${pattern.source}`);
    }
  }

  // Check for network access
  if (
    /fetch\s*\(/.test(implementation) ||
    /http[s]?:\/\//.test(implementation)
  ) {
    issues.push("Network access is not allowed in custom tools");
  }

  // Check for global access
  if (/globalThis|global\./.test(implementation)) {
    issues.push("Global object access is not allowed");
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}

/**
 * Build agent instructions for custom tool creation
 */
export function getToolCreationInstructions(): string {
  return `## Custom Tool Creation

You can create custom tools when you encounter repetitive tasks or need specialized functionality.

### When to Create a Custom Tool:
- A task requires processing that isn't covered by existing tools
- You find yourself doing the same complex operation multiple times
- You need to work with a specific data format or API

### How to Create a Tool:

1. Define clear input/output schemas
2. Write TypeScript or Python implementation
3. The implementation receives 'input' and should return a result
4. Keep implementations focused and single-purpose

### Example: Creating a JSON Path Extractor

\`\`\`
create_custom_tool({
  name: "extract_json_path",
  description: "Extract a value from JSON using a path expression",
  category: "utility",
  inputSchema: {
    type: "object",
    properties: {
      json: { type: "string", description: "JSON string to parse" },
      path: { type: "string", description: "Dot-notation path (e.g., 'user.name')" }
    },
    required: ["json", "path"]
  },
  implementation: \`
    const data = JSON.parse(input.json);
    const parts = input.path.split('.');
    let result = data;
    for (const part of parts) {
      result = result[part];
      if (result === undefined) return null;
    }
    return result;
  \`,
  runtime: "typescript"
})
\`\`\`

### Security Restrictions:
- No file system access
- No network requests
- No process spawning
- No eval or dynamic code execution
- Tools run in a sandboxed environment
`;
}

/**
 * Validate input against a JSON schema
 */
export function validateInputAgainstSchema(
  input: Record<string, unknown>,
  schema: JSONSchema,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schema.type !== "object" || !schema.properties) {
    return { valid: true, errors: [] };
  }

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in input)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check types for provided fields
  for (const [key, value] of Object.entries(input)) {
    const fieldSchema = schema.properties[key];
    if (fieldSchema) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (fieldSchema.type && actualType !== fieldSchema.type) {
        errors.push(
          `Field '${key}' expected type '${fieldSchema.type}', got '${actualType}'`,
        );
      }
    } else if (schema.additionalProperties === false) {
      errors.push(`Unknown field: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize tool name to valid identifier
 */
export function sanitizeToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[^a-z]/, "t")
    .replace(/_+/g, "_")
    .slice(0, MAX_TOOL_NAME_LENGTH);
}

/**
 * Build a formatted tool description for documentation
 */
export function buildToolDescription(tool: {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}): string {
  const parts = [
    `## ${tool.name}`,
    "",
    tool.description,
    "",
    `**Category:** ${tool.category}`,
  ];

  if (tool.inputSchema.properties) {
    parts.push("", "### Input Parameters:", "");
    for (const [name, prop] of Object.entries(tool.inputSchema.properties)) {
      const required = tool.inputSchema.required?.includes(name)
        ? " (required)"
        : "";
      const desc = prop.description || "";
      parts.push(
        `- \`${name}\`: ${prop.type}${required}${desc ? ` - ${desc}` : ""}`,
      );
    }
  }

  if (tool.outputSchema) {
    parts.push("", "### Output:", "");
    parts.push(`Type: ${tool.outputSchema.type}`);
    if (tool.outputSchema.description) {
      parts.push(tool.outputSchema.description);
    }
  }

  return parts.join("\n");
}
