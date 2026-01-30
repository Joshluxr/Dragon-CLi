# Phase 1: Infrastructure Setup

## Priority

High

## Status

Pending

## Description

Set up the package structure, dependencies, and basic infrastructure for the Supermemory integration.

## Context Links

- [claude-supermemory repo](https://github.com/supermemoryai/claude-supermemory)
- [supermemory npm package](https://www.npmjs.com/package/supermemory)

## Key Insights

- The official plugin uses CommonJS (`.cjs`) bundled scripts for hooks
- Uses `supermemory` v4.0.0 npm package for API communication
- Hooks are defined in `hooks.json` with timeout configurations
- Settings stored in `~/.supermemory-claude/settings.json`

## Requirements

### Functional

- Create new `@terragon/supermemory` package
- Install and configure `supermemory` SDK dependency
- Set up TypeScript configuration
- Create build scripts for hook bundling

### Non-Functional

- Maintain consistent code style with existing packages
- Support ESM and CommonJS exports
- Build hooks as standalone CJS bundles (Claude Code requirement)

## Architecture

```
packages/supermemory/
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript config
├── vitest.config.ts       # Test config
├── scripts/
│   └── build-hooks.ts     # Build script for hook bundles
└── src/
    └── index.ts           # Main exports
```

## Related Code Files

### Files to Create

- `packages/supermemory/package.json`
- `packages/supermemory/tsconfig.json`
- `packages/supermemory/vitest.config.ts`
- `packages/supermemory/src/index.ts`
- `packages/supermemory/scripts/build-hooks.ts`

### Files to Modify

- `pnpm-workspace.yaml` (add package to workspace)

## Implementation Steps

### Step 1: Create Package Directory

```bash
mkdir -p packages/supermemory/src
mkdir -p packages/supermemory/scripts
```

### Step 2: Create package.json

```json
{
  "name": "@terragon/supermemory",
  "version": "1.0.0",
  "description": "Supermemory integration for persistent memory across Claude sessions",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./hooks/*": "./src/hooks/*.ts",
    "./utils/*": "./src/utils/*.ts"
  },
  "scripts": {
    "build": "node scripts/build-hooks.ts",
    "build:hooks": "esbuild src/hooks/*.ts --bundle --platform=node --format=cjs --outdir=dist/hooks",
    "tsc-check": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "supermemory": "^4.0.0"
  },
  "devDependencies": {
    "@terragon/tsconfig": "workspace:*",
    "@types/node": "^22.15.29",
    "esbuild": "^0.25.0",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

### Step 3: Create TypeScript Configuration

```json
{
  "extends": "@terragon/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 4: Create Main Export File

```typescript
// src/index.ts
export * from "./client";
export * from "./utils/settings";
export * from "./utils/container";
export * from "./utils/formatter";
```

### Step 5: Add to Workspace

Verify `packages/supermemory` is included in `pnpm-workspace.yaml`.

### Step 6: Install Dependencies

```bash
pnpm install
```

## Todo List

- [ ] Create package directory structure
- [ ] Create package.json with dependencies
- [ ] Create tsconfig.json
- [ ] Create vitest.config.ts
- [ ] Create src/index.ts placeholder
- [ ] Add to pnpm workspace
- [ ] Run pnpm install
- [ ] Verify TypeScript compilation

## Success Criteria

- Package compiles without errors
- All dependencies resolve correctly
- Package is accessible from other workspace packages
- Build scripts execute successfully

## Risk Assessment

- **Low**: Standard package setup following existing patterns
- **Mitigation**: Follow existing package structure (`@terragon/utils`)

## Security Considerations

- API keys should never be committed
- Add `.env` patterns to `.gitignore`

## Next Steps

After completing this phase:

- Phase 2: Core Hook Implementation
