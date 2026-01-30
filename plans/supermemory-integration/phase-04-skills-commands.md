# Phase 4: Skills & Commands Implementation

## Priority

Medium

## Status

Pending

## Description

Implement the slash commands and skills that allow users to interact with Supermemory:

1. **`/supermemory:index`** - Index the current codebase
2. **`/supermemory:logout`** - Clear credentials
3. **`super-search` skill** - Search past memories

## Context Links

- [Phase 3: Hooks Implementation](./phase-03-hooks-implementation.md)
- [Claude Code Skills Documentation](https://docs.anthropic.com/claude-code/skills)

## Key Insights

- Skills are defined in SKILL.md files
- Commands are defined in .md files with execution instructions
- The index command performs ~20-50 tool calls to analyze codebase
- Search skill allows natural language queries

## Requirements

### Functional

- Index command analyzes codebase structure and patterns
- Logout command clears saved credentials
- Search skill queries memories with natural language

### Non-Functional

- Commands provide clear feedback
- Search returns relevant, ranked results
- Indexing excludes node_modules and build artifacts

## Architecture

```
plugin/
├── commands/
│   ├── index.md         # /supermemory:index
│   └── logout.md        # /supermemory:logout
└── skills/
    └── super-search/
        └── SKILL.md     # Memory search skill
```

## Related Code Files

### Files to Create

- `packages/supermemory/plugin/commands/index.md`
- `packages/supermemory/plugin/commands/logout.md`
- `packages/supermemory/plugin/skills/super-search/SKILL.md`
- `packages/supermemory/src/commands/index.ts` (support script)
- `packages/supermemory/src/commands/search-memory.ts` (support script)

## Implementation Steps

### Step 1: Index Command (`plugin/commands/index.md`)

````markdown
---
description: Index the current codebase into Supermemory for persistent memory
---

# Index Codebase

Analyze and index the current codebase architecture into Supermemory. This enables better context recall in future sessions.

## Process

Follow this structured approach to document the codebase:

### Phase 1: Configuration & Documentation

Examine configuration and documentation files:

- package.json, tsconfig.json, etc.
- README.md, CONTRIBUTING.md
- Gather: project name, purpose, tech stack, how to run/build/test

### Phase 2: Structure Exploration

Map the project structure:

- Use Glob to find key directories
- Identify architecture patterns (monorepo, microservices, etc.)
- Gather: architecture, key modules, data flow

### Phase 3: Pattern Analysis

Analyze coding patterns:

- Naming conventions (files, functions, variables)
- File organization
- Import patterns
- Git history for recent changes

### Phase 4: Implementation Details

Identify critical implementations:

- Authentication/authorization
- Database connections and models
- API endpoints
- Shared utilities

## Exclusions

Skip these directories/files:

- node_modules/
- dist/, build/, .next/
- \*.lock files
- Generated files

## Output

After completing analysis (aim for 20-50 tool calls), compile ONE comprehensive summary containing:

- Technical stack and dependencies
- Architecture patterns
- Coding conventions
- Key file locations
- Important implementation patterns

Save the summary using:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/add-memory.cjs" "SUMMARY_CONTENT"
```
````

````

### Step 2: Logout Command (`plugin/commands/logout.md`)

```markdown
---
description: Clear Supermemory credentials and disconnect
---

# Logout from Supermemory

Clear saved Supermemory credentials and settings.

## Steps

1. Remove the settings file:
```bash
rm -rf ~/.supermemory-claude
````

2. Remind the user to unset the environment variable if needed:

```
To fully disconnect, also unset the environment variable:
unset SUPERMEMORY_CC_API_KEY
```

3. Confirm logout was successful.

````

### Step 3: Super-Search Skill (`plugin/skills/super-search/SKILL.md`)

```markdown
---
description: Search your coding memory for past work and sessions
---

# Super Search

Search through Supermemory to find information from past work sessions.

## When to Use
Use this skill when the user:
- Asks about past work or previous sessions
- Wants to recall how something was implemented
- Asks "what did I work on" or similar
- Wants to find decisions or notes from earlier

## How to Search

Execute the search with:
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/search-memory.cjs" "QUERY"
````

Replace QUERY with the user's search terms.

## Examples

- "what did I work on yesterday"
- "how did I implement authentication"
- "database migration changes"
- "API endpoint for users"

## Response Guidelines

- Present results clearly with relevance scores
- Offer to search with different terms if results are insufficient
- Summarize key findings from the search results

````

### Step 4: Search Memory Script (`src/commands/search-memory.ts`)

```typescript
import { SupermemoryClient } from '../client';
import { formatSearchResults } from '../utils/formatter';
import { getApiKey, isDebugEnabled } from '../utils/settings';

async function main(): Promise<void> {
  const query = process.argv[2];

  if (!query) {
    console.log('No search query provided. Please specify what you want to search for.');
    process.exit(1);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('Supermemory not configured. Set SUPERMEMORY_CC_API_KEY environment variable.');
    process.exit(1);
  }

  try {
    const client = new SupermemoryClient();
    const results = await client.search(query, 10);

    if (results.length === 0) {
      console.log(`No memories found for: "${query}"`);
      console.log('\nTry searching with different terms or check if memories have been saved.');
      return;
    }

    console.log(formatSearchResults(results, query));
  } catch (error) {
    if (isDebugEnabled()) {
      console.error('Search error:', error);
    }
    console.log('Failed to search memories. Please try again.');
    process.exit(1);
  }
}

main();
````

### Step 5: Add Memory Script (`src/commands/add-memory.ts`)

```typescript
import { SupermemoryClient } from "../client";
import { getApiKey, isDebugEnabled } from "../utils/settings";

async function main(): Promise<void> {
  const content = process.argv[2];

  if (!content) {
    console.log('No content provided. Usage: add-memory "content to save"');
    process.exit(1);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(
      "Supermemory not configured. Set SUPERMEMORY_CC_API_KEY environment variable.",
    );
    process.exit(1);
  }

  try {
    const client = new SupermemoryClient();
    const projectInfo = client.getProjectInfo();

    const memoryId = await client.addMemory(content, "manual");

    if (memoryId) {
      console.log(`Memory saved to project: ${projectInfo.projectName}`);
      console.log(`Memory ID: ${memoryId}`);
    } else {
      console.log("Failed to save memory. Please try again.");
    }
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("Add memory error:", error);
    }
    console.log("Failed to save memory. Please try again.");
    process.exit(1);
  }
}

main();
```

### Step 6: Update Build Script

Add command scripts to the build process in `scripts/build-hooks.ts`:

```typescript
const COMMANDS = ["search-memory", "add-memory"];

// Add to build function:
for (const cmd of COMMANDS) {
  const entryPoint = path.join(__dirname, "../src/commands", `${cmd}.ts`);

  if (!fs.existsSync(entryPoint)) {
    console.warn(`Warning: ${cmd}.ts not found, skipping`);
    continue;
  }

  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: path.join(__dirname, "../dist/commands", `${cmd}.cjs`),
  });

  console.log(`Built: ${cmd}.cjs`);
}
```

## Todo List

- [ ] Create plugin/commands/index.md
- [ ] Create plugin/commands/logout.md
- [ ] Create plugin/skills/super-search/SKILL.md
- [ ] Create src/commands/search-memory.ts
- [ ] Create src/commands/add-memory.ts
- [ ] Update build script for commands
- [ ] Test index command workflow
- [ ] Test logout command
- [ ] Test search skill
- [ ] Verify commands bundle correctly

## Success Criteria

- Index command produces comprehensive codebase summary
- Logout command clears all credentials
- Search skill returns relevant results
- All scripts bundle and execute correctly
- Commands integrate with Claude Code

## Risk Assessment

- **Low**: Simple command implementations
- **Medium**: Index command quality depends on analysis thoroughness

## Security Considerations

- Logout fully clears sensitive data
- Index excludes sensitive files (.env, credentials)

## Next Steps

After completing this phase:

- Phase 5: Testing & Documentation
