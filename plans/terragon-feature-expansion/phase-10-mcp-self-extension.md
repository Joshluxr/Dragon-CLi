# Phase 10: MCP Self-Extension

**Status**: Pending
**Priority**: 10
**Effort**: High

---

## Overview

Enable agents to dynamically create, register, and use custom MCP tools during execution:

1. Agent detects need for specialized capability
2. Agent writes tool specification and handler
3. Tool is validated and registered dynamically
4. Tool becomes available for current and future sessions
5. User can review, approve, and manage custom tools

---

## How It Works

```
1. Agent encounters a task requiring custom tooling
2. Agent creates MCP tool definition:
   - JSON schema for parameters
   - TypeScript/Python handler code
   - Documentation and examples
3. Tool is validated for:
   - Security (no shell access, sandboxed)
   - Proper schema
   - Working implementation
4. Tool is registered in MCP server
5. Tool becomes available to agent immediately
6. User notified and can review/approve for future use
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

```typescript
// Custom tools registry
export const customToolTable = pgTable("custom_tool", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => userTable.id),
  environmentId: uuid("environment_id").references(() => environmentTable.id),

  // Tool definition
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").$type<
    "utility" | "integration" | "analysis" | "automation"
  >(),

  // Schema and implementation
  inputSchema: jsonb("input_schema").$type<JSONSchema>(),
  outputSchema: jsonb("output_schema").$type<JSONSchema>(),
  implementation: text("implementation").notNull(), // TypeScript code
  runtime: text("runtime")
    .$type<"typescript" | "python">()
    .default("typescript"),

  // Metadata
  version: integer("version").default(1),
  createdByAgentId: uuid("created_by_agent_id"),
  createdInThreadId: uuid("created_in_thread_id").references(
    () => threadTable.id,
  ),

  // Status
  status: text("status").$type<
    "draft" | "pending_review" | "approved" | "rejected" | "deprecated"
  >(),
  approvedAt: timestamp("approved_at"),
  approvedBy: uuid("approved_by").references(() => userTable.id),

  // Usage tracking
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  errorCount: integer("error_count").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tool execution logs
export const toolExecutionLogTable = pgTable("tool_execution_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolId: uuid("tool_id").references(() => customToolTable.id),
  threadId: uuid("thread_id").references(() => threadTable.id),

  // Execution details
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  durationMs: integer("duration_ms"),

  executedAt: timestamp("executed_at").defaultNow(),
});
```

### 2. Tool Definition Types

```typescript
// packages/shared/src/model/custom-tools.ts

export interface ToolDefinition {
  name: string;
  description: string;
  category: "utility" | "integration" | "analysis" | "automation";
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  implementation: string;
  runtime: "typescript" | "python";
  examples?: ToolExample[];
  dependencies?: string[];
}

export interface ToolExample {
  description: string;
  input: Record<string, unknown>;
  expectedOutput?: unknown;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  enum?: unknown[];
  default?: unknown;
}

export interface ToolExecutionContext {
  threadId: string;
  userId: string;
  environmentId: string;
  workingDirectory: string;
  timeout: number;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  logs?: string[];
  durationMs: number;
}
```

### 3. Tool Creation Service (`packages/shared/src/services/custom-tools.ts`)

```typescript
import { db } from "../db";
import { customToolTable, toolExecutionLogTable } from "../db/schema";
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../model/custom-tools";
import { validateToolImplementation } from "./tool-validator";
import { executeToolSandboxed } from "./tool-executor";

export async function createCustomTool(
  userId: string,
  environmentId: string,
  definition: ToolDefinition,
  createdByContext?: { agentId: string; threadId: string },
): Promise<{ id: string; status: string }> {
  // Validate tool definition
  const validation = await validateToolDefinition(definition);
  if (!validation.valid) {
    throw new Error(`Invalid tool definition: ${validation.errors.join(", ")}`);
  }

  // Security validation of implementation
  const securityCheck = await validateToolImplementation(
    definition.implementation,
    definition.runtime,
  );
  if (!securityCheck.safe) {
    throw new Error(`Security violation: ${securityCheck.issues.join(", ")}`);
  }

  // Insert tool record
  const [tool] = await db
    .insert(customToolTable)
    .values({
      userId,
      environmentId,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      implementation: definition.implementation,
      runtime: definition.runtime,
      status: createdByContext ? "pending_review" : "draft",
      createdByAgentId: createdByContext?.agentId,
      createdInThreadId: createdByContext?.threadId,
    })
    .returning();

  // Notify user if created by agent
  if (createdByContext) {
    await notifyToolCreated(userId, tool.id, definition.name);
  }

  return { id: tool.id, status: tool.status };
}

export async function executeCustomTool(
  toolId: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const tool = await db.query.customToolTable.findFirst({
    where: eq(customToolTable.id, toolId),
  });

  if (!tool) {
    throw new Error(`Tool not found: ${toolId}`);
  }

  if (tool.status !== "approved" && tool.status !== "draft") {
    throw new Error(`Tool not available: ${tool.status}`);
  }

  // Validate input against schema
  const inputValidation = validateAgainstSchema(input, tool.inputSchema);
  if (!inputValidation.valid) {
    throw new Error(`Invalid input: ${inputValidation.errors.join(", ")}`);
  }

  const startTime = Date.now();
  let result: ToolExecutionResult;

  try {
    // Execute in sandbox
    result = await executeToolSandboxed(
      tool.implementation,
      tool.runtime,
      input,
      context,
    );

    // Update usage stats
    await db
      .update(customToolTable)
      .set({
        usageCount: sql`${customToolTable.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(customToolTable.id, toolId));
  } catch (error) {
    result = {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime,
    };

    // Track errors
    await db
      .update(customToolTable)
      .set({
        errorCount: sql`${customToolTable.errorCount} + 1`,
      })
      .where(eq(customToolTable.id, toolId));
  }

  // Log execution
  await db.insert(toolExecutionLogTable).values({
    toolId,
    threadId: context.threadId,
    input,
    output: result.output,
    error: result.error,
    durationMs: result.durationMs,
  });

  return result;
}

export async function approveCustomTool(
  toolId: string,
  userId: string,
): Promise<void> {
  await db
    .update(customToolTable)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy: userId,
    })
    .where(eq(customToolTable.id, toolId));
}

export async function getAvailableTools(
  environmentId: string,
): Promise<ToolDefinition[]> {
  const tools = await db.query.customToolTable.findMany({
    where: and(
      eq(customToolTable.environmentId, environmentId),
      inArray(customToolTable.status, ["approved", "draft"]),
    ),
  });

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    category: tool.category,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    implementation: tool.implementation,
    runtime: tool.runtime,
  }));
}
```

### 4. Tool Validator (`packages/shared/src/services/tool-validator.ts`)

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SecurityCheckResult {
  safe: boolean;
  issues: string[];
}

// Blocked patterns that indicate dangerous operations
const BLOCKED_PATTERNS = {
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

// Allowed imports for tools
const ALLOWED_IMPORTS = {
  typescript: [
    "lodash",
    "date-fns",
    "zod",
    "crypto", // crypto.randomUUID, etc.
  ],
  python: [
    "json",
    "re",
    "datetime",
    "typing",
    "dataclasses",
    "collections",
    "itertools",
    "functools",
    "math",
  ],
};

export async function validateToolDefinition(
  definition: ToolDefinition,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate name
  if (!/^[a-z][a-z0-9_]*$/.test(definition.name)) {
    errors.push(
      "Tool name must be lowercase, start with letter, contain only letters/numbers/underscores",
    );
  }

  if (definition.name.length > 64) {
    errors.push("Tool name must be 64 characters or less");
  }

  // Validate description
  if (definition.description.length < 10) {
    errors.push("Description must be at least 10 characters");
  }

  if (definition.description.length > 1000) {
    errors.push("Description must be 1000 characters or less");
  }

  // Validate schema
  if (!definition.inputSchema || typeof definition.inputSchema !== "object") {
    errors.push("Input schema is required and must be an object");
  }

  // Validate implementation length
  if (definition.implementation.length > 50000) {
    errors.push("Implementation must be 50KB or less");
  }

  // Check for runtime compatibility
  if (!["typescript", "python"].includes(definition.runtime)) {
    errors.push("Runtime must be 'typescript' or 'python'");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validateToolImplementation(
  implementation: string,
  runtime: "typescript" | "python",
): Promise<SecurityCheckResult> {
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

  // Syntax validation
  try {
    if (runtime === "typescript") {
      // Basic syntax check using acorn or similar
      await checkTypeScriptSyntax(implementation);
    } else {
      await checkPythonSyntax(implementation);
    }
  } catch (error) {
    issues.push(`Syntax error: ${error.message}`);
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}

async function checkTypeScriptSyntax(code: string): Promise<void> {
  // Wrap in function and check parsing
  const wrapped = `(async function tool(input: any): Promise<any> { ${code} })`;
  // Use esbuild or typescript compiler API
  const ts = await import("typescript");
  const result = ts.transpileModule(wrapped, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  if (result.diagnostics && result.diagnostics.length > 0) {
    throw new Error(result.diagnostics[0].messageText.toString());
  }
}

async function checkPythonSyntax(code: string): Promise<void> {
  // Use Python's ast module via subprocess
  const { execSync } = await import("child_process");
  try {
    execSync(
      `python3 -c "import ast; ast.parse('''${code.replace(/'/g, "\\'")}''')"`,
      {
        timeout: 5000,
      },
    );
  } catch (error) {
    throw new Error("Python syntax error");
  }
}
```

### 5. Sandboxed Tool Executor (`packages/shared/src/services/tool-executor.ts`)

```typescript
import { VM } from "vm2";
import {
  ToolExecutionContext,
  ToolExecutionResult,
} from "../model/custom-tools";

export async function executeToolSandboxed(
  implementation: string,
  runtime: "typescript" | "python",
  input: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const logs: string[] = [];

  try {
    let output: unknown;

    if (runtime === "typescript") {
      output = await executeTypeScriptTool(
        implementation,
        input,
        logs,
        context.timeout,
      );
    } else {
      output = await executePythonTool(
        implementation,
        input,
        logs,
        context.timeout,
      );
    }

    return {
      success: true,
      output,
      logs,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      logs,
      durationMs: Date.now() - startTime,
    };
  }
}

async function executeTypeScriptTool(
  implementation: string,
  input: Record<string, unknown>,
  logs: string[],
  timeout: number,
): Promise<unknown> {
  const vm = new VM({
    timeout,
    sandbox: {
      input,
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        error: (...args: unknown[]) =>
          logs.push(`[ERROR] ${args.map(String).join(" ")}`),
      },
      // Limited safe utilities
      JSON,
      Date,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
    },
    eval: false,
    wasm: false,
  });

  // Wrap implementation in async function
  const code = `
    (async () => {
      ${implementation}
    })()
  `;

  return await vm.run(code);
}

async function executePythonTool(
  implementation: string,
  input: Record<string, unknown>,
  logs: string[],
  timeout: number,
): Promise<unknown> {
  const { spawn } = await import("child_process");

  // Create Python script with sandboxing
  const script = `
import json
import sys
from io import StringIO

# Capture stdout
captured_output = StringIO()
old_stdout = sys.stdout
sys.stdout = captured_output

# Input from stdin
input_data = json.loads(input())

# User implementation
def run_tool(input):
    ${implementation
      .split("\n")
      .map((line) => "    " + line)
      .join("\n")}

# Execute and output result
try:
    result = run_tool(input_data)
    sys.stdout = old_stdout
    print(json.dumps({"success": True, "output": result, "logs": captured_output.getvalue().split("\\n")}))
except Exception as e:
    sys.stdout = old_stdout
    print(json.dumps({"success": False, "error": str(e), "logs": captured_output.getvalue().split("\\n")}))
`;

  return new Promise((resolve, reject) => {
    const process = spawn("python3", ["-c", script], {
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
    });

    process.stdin.write(JSON.stringify(input));
    process.stdin.end();

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          logs.push(...(result.logs || []));
          if (result.success) {
            resolve(result.output);
          } else {
            reject(new Error(result.error));
          }
        } catch {
          reject(new Error("Failed to parse tool output"));
        }
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    process.on("error", reject);
  });
}
```

### 6. MCP Tool Registration (`packages/daemon/src/tools/custom-tool-handler.ts`)

```typescript
import {
  createCustomTool,
  executeCustomTool,
  getAvailableTools,
} from "@terragon/shared/services/custom-tools";
import { ToolDefinition } from "@terragon/shared/model/custom-tools";

// Tool for creating new tools
export const createToolDefinition = {
  name: "create_custom_tool",
  description: `Create a new custom tool that can be used in future interactions.
The tool will be validated for security and syntax before being registered.
You should create tools when you need specialized functionality not provided by existing tools.`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Lowercase name with underscores (e.g., 'parse_csv')",
      },
      description: {
        type: "string",
        description: "Clear description of what the tool does",
      },
      category: {
        type: "string",
        enum: ["utility", "integration", "analysis", "automation"],
        description: "Category of the tool",
      },
      inputSchema: {
        type: "object",
        description: "JSON Schema for the tool's input parameters",
      },
      implementation: {
        type: "string",
        description:
          "TypeScript code that processes 'input' and returns a result",
      },
      runtime: {
        type: "string",
        enum: ["typescript", "python"],
        default: "typescript",
      },
    },
    required: [
      "name",
      "description",
      "category",
      "inputSchema",
      "implementation",
    ],
  },
};

export async function handleCreateCustomTool(
  args: ToolDefinition,
  context: {
    userId: string;
    environmentId: string;
    agentId: string;
    threadId: string;
  },
): Promise<string> {
  try {
    const result = await createCustomTool(
      context.userId,
      context.environmentId,
      args,
      { agentId: context.agentId, threadId: context.threadId },
    );

    return `Tool "${args.name}" created successfully (ID: ${result.id}).
Status: ${result.status}
${result.status === "pending_review" ? "\nThe tool is pending user review before it can be widely used." : ""}
You can now use this tool by calling it with the specified input schema.`;
  } catch (error) {
    return `Failed to create tool: ${error.message}`;
  }
}

// Dynamic tool registration
export async function registerCustomToolsForEnvironment(
  environmentId: string,
  mcpServer: MCPServer,
): Promise<void> {
  const tools = await getAvailableTools(environmentId);

  for (const tool of tools) {
    mcpServer.registerTool({
      name: `custom_${tool.name}`,
      description: `[Custom Tool] ${tool.description}`,
      inputSchema: tool.inputSchema,
      handler: async (input: Record<string, unknown>, context) => {
        return await executeCustomTool(tool.id, input, {
          threadId: context.threadId,
          userId: context.userId,
          environmentId,
          workingDirectory: context.workingDirectory,
          timeout: 30000,
        });
      },
    });
  }
}
```

### 7. Agent Instructions for Tool Creation

```typescript
const toolCreationInstructions = `
## Custom Tool Creation

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
```

### 8. UI: Tool Management (`apps/www/src/components/tools/custom-tools-manager.tsx`)

```typescript
export function CustomToolsManager({ environmentId }: Props) {
  const { data: tools, refetch } = useQuery({
    queryKey: ["custom-tools", environmentId],
    queryFn: () => fetchCustomTools(environmentId),
  });

  const approveMutation = useMutation({
    mutationFn: (toolId: string) => approveCustomTool(toolId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Custom Tools</h2>
        <Badge variant="outline">{tools?.length || 0} tools</Badge>
      </div>

      {/* Pending Review Section */}
      {tools?.filter(t => t.status === "pending_review").length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Tools Pending Review</AlertTitle>
          <AlertDescription>
            {tools.filter(t => t.status === "pending_review").length} tools created by agents need your approval.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="grid gap-4">
            {tools?.map(tool => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onApprove={() => approveMutation.mutate(tool.id)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToolCard({ tool, onApprove }: { tool: CustomTool; onApprove: () => void }) {
  const [showCode, setShowCode] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            <CardTitle className="text-base">{tool.name}</CardTitle>
            <Badge variant={tool.status === "approved" ? "default" : "secondary"}>
              {tool.status}
            </Badge>
          </div>
          <Badge variant="outline">{tool.category}</Badge>
        </div>
        <CardDescription>{tool.description}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Usage Stats */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Used:</span>
              <span className="ml-1 font-medium">{tool.usageCount} times</span>
            </div>
            <div>
              <span className="text-muted-foreground">Errors:</span>
              <span className="ml-1 font-medium">{tool.errorCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Runtime:</span>
              <span className="ml-1 font-medium">{tool.runtime}</span>
            </div>
          </div>

          {/* Input Schema */}
          <div>
            <h4 className="text-sm font-medium mb-2">Input Schema</h4>
            <pre className="bg-muted p-2 rounded text-xs overflow-auto">
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          </div>

          {/* Implementation */}
          <Collapsible open={showCode} onOpenChange={setShowCode}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm">
              <ChevronRight className={cn("h-4 w-4 transition", showCode && "rotate-90")} />
              View Implementation
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="bg-muted p-4 rounded text-xs overflow-auto mt-2">
                {tool.implementation}
              </pre>
            </CollapsibleContent>
          </Collapsible>

          {/* Created By */}
          {tool.createdInThreadId && (
            <div className="text-xs text-muted-foreground">
              Created by agent in{" "}
              <Link href={`/thread/${tool.createdInThreadId}`} className="underline">
                thread
              </Link>
            </div>
          )}
        </div>
      </CardContent>

      {tool.status === "pending_review" && (
        <CardFooter className="flex gap-2">
          <Button onClick={onApprove}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Approve
          </Button>
          <Button variant="destructive">
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
```

---

## Testing Strategy

```typescript
describe("MCP Self-Extension", () => {
  describe("Tool Creation", () => {
    it("creates a valid custom tool", async () => {
      const definition = {
        name: "test_tool",
        description: "A test tool for unit testing",
        category: "utility",
        inputSchema: {
          type: "object",
          properties: { value: { type: "string" } },
        },
        implementation: "return input.value.toUpperCase();",
        runtime: "typescript",
      };

      const result = await createCustomTool(userId, envId, definition);
      expect(result.id).toBeDefined();
      expect(result.status).toBe("draft");
    });

    it("rejects tools with blocked patterns", async () => {
      const definition = {
        name: "bad_tool",
        description: "A malicious tool",
        category: "utility",
        inputSchema: { type: "object", properties: {} },
        implementation: "require('child_process').execSync('rm -rf /')",
        runtime: "typescript",
      };

      await expect(createCustomTool(userId, envId, definition)).rejects.toThrow(
        "Security violation",
      );
    });

    it("rejects tools with network access", async () => {
      const definition = {
        name: "network_tool",
        description: "Tool that makes network requests",
        category: "utility",
        inputSchema: { type: "object", properties: {} },
        implementation: "return await fetch('https://example.com')",
        runtime: "typescript",
      };

      await expect(createCustomTool(userId, envId, definition)).rejects.toThrow(
        "Network access is not allowed",
      );
    });
  });

  describe("Tool Execution", () => {
    it("executes TypeScript tool in sandbox", async () => {
      const tool = await createToolFixture({
        implementation: "return input.a + input.b;",
      });

      const result = await executeCustomTool(tool.id, { a: 1, b: 2 }, context);
      expect(result.success).toBe(true);
      expect(result.output).toBe(3);
    });

    it("executes Python tool in sandbox", async () => {
      const tool = await createToolFixture({
        implementation: "return input['a'] + input['b']",
        runtime: "python",
      });

      const result = await executeCustomTool(tool.id, { a: 1, b: 2 }, context);
      expect(result.success).toBe(true);
      expect(result.output).toBe(3);
    });

    it("times out long-running tools", async () => {
      const tool = await createToolFixture({
        implementation: "while(true) {}",
      });

      const result = await executeCustomTool(
        tool.id,
        {},
        { ...context, timeout: 100 },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    });

    it("tracks usage statistics", async () => {
      const tool = await createToolFixture();

      await executeCustomTool(tool.id, { value: "test" }, context);
      await executeCustomTool(tool.id, { value: "test2" }, context);

      const updated = await getToolById(tool.id);
      expect(updated.usageCount).toBe(2);
    });
  });

  describe("Tool Approval", () => {
    it("sets status to pending when created by agent", async () => {
      const result = await createCustomTool(userId, envId, definition, {
        agentId: "agent-123",
        threadId: "thread-456",
      });

      expect(result.status).toBe("pending_review");
    });

    it("approves tool and sets approver", async () => {
      const tool = await createToolFixture({ status: "pending_review" });

      await approveCustomTool(tool.id, adminUserId);

      const updated = await getToolById(tool.id);
      expect(updated.status).toBe("approved");
      expect(updated.approvedBy).toBe(adminUserId);
    });
  });
});
```

---

## Security Considerations

- All custom tool implementations run in isolated VM sandbox
- Blocked patterns prevent shell access, file system, and network
- Python tools run in subprocess with limited imports
- User approval required for agent-created tools
- Execution logging for audit trail
- Rate limiting on tool creation and execution
- Maximum implementation size limits
- Timeout enforcement on all executions
