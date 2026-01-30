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
