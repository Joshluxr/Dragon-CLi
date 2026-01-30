# Phase 3: Hooks Implementation

## Priority

High

## Status

Pending

## Description

Implement the four Claude Code hooks that power the memory system:

1. **SessionStart** (context-hook): Inject relevant memories at session start
2. **UserPromptSubmit** (prompt-hook): Capture user prompts
3. **PostToolUse** (observation-hook): Capture tool outputs
4. **Stop** (summary-hook): Persist session summary on exit

## Context Links

- [Phase 2: Core Implementation](./phase-02-core-implementation.md)
- [Claude Code Hooks Documentation](https://docs.anthropic.com/claude-code/hooks)

## Key Insights

- Hooks must be bundled as standalone CommonJS files
- Each hook has a timeout (15-30 seconds)
- Hooks receive input via stdin and output via stdout
- Hooks should return `{ continue: true }` to allow session to proceed
- PostToolUse only triggers for specific tools

## Requirements

### Functional

- Context hook injects relevant memories on session start
- Prompt hook captures user input for future recall
- Observation hook captures tool outputs (Edit, Write, Bash, Task)
- Summary hook persists session conversation on exit

### Non-Functional

- Hooks execute within timeout limits
- Graceful degradation if API unavailable
- No blocking of user workflow
- Minimal performance overhead

## Architecture

```
Session Lifecycle:
┌──────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐
│  START   │ ──► │  USER INPUT  │ ──► │ TOOL USE   │ ──► │   STOP   │
│          │     │              │     │            │     │          │
│ context- │     │  prompt-     │     │observation-│     │ summary- │
│   hook   │     │    hook      │     │   hook     │     │   hook   │
└──────────┘     └──────────────┘     └────────────┘     └──────────┘
     │                  │                   │                  │
     └──────────────────┴───────────────────┴──────────────────┘
                              │
                    Supermemory API
```

## Related Code Files

### Files to Create

- `packages/supermemory/src/hooks/context-hook.ts`
- `packages/supermemory/src/hooks/prompt-hook.ts`
- `packages/supermemory/src/hooks/observation-hook.ts`
- `packages/supermemory/src/hooks/summary-hook.ts`
- `packages/supermemory/src/hooks/types.ts`

### Files to Modify

- `packages/supermemory/scripts/build-hooks.ts`

## Implementation Steps

### Step 1: Hook Types (`hooks/types.ts`)

```typescript
export interface HookInput {
  workingDirectory?: string;
  sessionId?: string;
  transcript?: string;
  transcriptPath?: string;
  toolName?: string;
  toolResult?: string;
  userPrompt?: string;
}

export interface HookOutput {
  continue: boolean;
  context?: string;
  error?: string;
}

export async function readStdin(): Promise<HookInput> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

export function writeOutput(output: HookOutput): void {
  console.log(JSON.stringify(output));
}
```

### Step 2: Context Hook (`hooks/context-hook.ts`)

```typescript
import { SupermemoryClient } from "../client";
import { readStdin, writeOutput, HookOutput } from "./types";
import { isDebugEnabled } from "../utils/settings";

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const client = new SupermemoryClient(input.workingDirectory);

    const context = await client.getContext();

    const output: HookOutput = {
      continue: true,
    };

    if (context.itemCount > 0) {
      output.context = `
<system-reminder>
## Supermemory - Previous Context

The following memories from previous sessions may be relevant to this conversation:

${context.xml}

Use this context to maintain continuity and recall past work when relevant.
</system-reminder>
`;
    }

    writeOutput(output);
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[context-hook] Error:", error);
    }
    // Always allow session to continue
    writeOutput({ continue: true });
  }
}

main();
```

### Step 3: Prompt Hook (`hooks/prompt-hook.ts`)

```typescript
import { SupermemoryClient } from "../client";
import { readStdin, writeOutput } from "./types";
import { isDebugEnabled, loadSettings } from "../utils/settings";

async function main(): Promise<void> {
  try {
    const input = await readStdin();

    // Skip if no prompt provided
    if (!input.userPrompt) {
      writeOutput({ continue: true });
      return;
    }

    const client = new SupermemoryClient(input.workingDirectory);

    // Store the prompt as a memory entry
    await client.addMemory(`User prompt: ${input.userPrompt}`, "user-prompt");

    writeOutput({ continue: true });
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[prompt-hook] Error:", error);
    }
    writeOutput({ continue: true });
  }
}

main();
```

### Step 4: Observation Hook (`hooks/observation-hook.ts`)

```typescript
import { SupermemoryClient } from "../client";
import { readStdin, writeOutput } from "./types";
import { isDebugEnabled, loadSettings } from "../utils/settings";

const DEFAULT_CAPTURE_TOOLS = ["Edit", "Write", "Bash", "Task"];

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const settings = loadSettings();

    // Check if this tool should be captured
    const captureTools =
      settings.captureTools.length > 0
        ? settings.captureTools
        : DEFAULT_CAPTURE_TOOLS;

    const skipTools = settings.skipTools || [];

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
```

### Step 5: Summary Hook (`hooks/summary-hook.ts`)

```typescript
import { SupermemoryClient } from "../client";
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

    const client = new SupermemoryClient(input.workingDirectory);

    // Extract summary from transcript
    const summary = extractSummary(transcript);

    if (summary) {
      await client.addMemory(summary, "session-summary");
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
```

### Step 6: Build Script (`scripts/build-hooks.ts`)

```typescript
import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";

const HOOKS = [
  "context-hook",
  "prompt-hook",
  "observation-hook",
  "summary-hook",
];

async function build(): Promise<void> {
  const srcDir = path.join(__dirname, "../src/hooks");
  const outDir = path.join(__dirname, "../dist/hooks");

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const hook of HOOKS) {
    const entryPoint = path.join(srcDir, `${hook}.ts`);

    if (!fs.existsSync(entryPoint)) {
      console.warn(`Warning: ${hook}.ts not found, skipping`);
      continue;
    }

    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      outfile: path.join(outDir, `${hook}.cjs`),
      external: [], // Bundle everything
      minify: false, // Keep readable for debugging
    });

    console.log(`Built: ${hook}.cjs`);
  }

  console.log("All hooks built successfully");
}

build().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
```

### Step 7: Hooks Configuration (`plugin/hooks/hooks.json`)

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/context-hook.cjs\"",
      "timeout": 30000
    },
    {
      "event": "UserPromptSubmit",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/prompt-hook.cjs\"",
      "timeout": 15000
    },
    {
      "event": "PostToolUse",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/observation-hook.cjs\"",
      "timeout": 15000,
      "tools": ["Edit", "Write", "Bash", "Task"]
    },
    {
      "event": "Stop",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/summary-hook.cjs\"",
      "timeout": 30000
    }
  ]
}
```

## Todo List

- [ ] Create hooks/types.ts
- [ ] Create hooks/context-hook.ts
- [ ] Create hooks/prompt-hook.ts
- [ ] Create hooks/observation-hook.ts
- [ ] Create hooks/summary-hook.ts
- [ ] Create scripts/build-hooks.ts
- [ ] Create plugin/hooks/hooks.json
- [ ] Test each hook in isolation
- [ ] Test hook bundling with esbuild
- [ ] Verify hooks work with Claude Code

## Success Criteria

- All hooks build successfully to CJS format
- Context hook injects memories on session start
- Prompt hook captures user input
- Observation hook captures tool results
- Summary hook persists session on exit
- All hooks respect timeout limits
- No blocking of user workflow

## Risk Assessment

- **Medium**: Hook timeout could cause session issues
- **Mitigation**: Implement aggressive timeout handling, always return `{ continue: true }`

## Security Considerations

- Sanitize content before storing
- Respect user's skipTools settings
- Don't capture sensitive data (passwords, API keys)

## Next Steps

After completing this phase:

- Phase 4: Skills & Commands Implementation
