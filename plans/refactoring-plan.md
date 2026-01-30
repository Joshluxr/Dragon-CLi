# Refactoring Plan - Codebase Review Phase 3

## Overview

This plan addresses refactoring opportunities identified in the codebase review.

## HIGH Priority

### HIGH-1: Extract Batch Processing Utility

**Location**: `@dragon/utils/batch.ts` (new file)
**Used by**: `apps/www/src/app/api/internal/cron/queued-tasks/route.ts`

```typescript
// New utility function
export async function processBatchWithDelay<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>,
  delayMs?: number,
): Promise<PromiseSettledResult<void>[]>;
```

### HIGH-2: Replace Magic Numbers with Constants

**Location**: `apps/www/src/app/api/internal/cron/queued-tasks/route.ts`

```typescript
// Add constants at top of file
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
```

### HIGH-3: Extract Status Condition Builder

**Location**: `packages/shared/src/model/threads.ts`

```typescript
// Extract helper function
function buildRateLimitStatusConditions(
  table: typeof schema.thread | typeof schema.threadChat,
  now: Date,
);
```

## MEDIUM Priority

### MEDIUM-1: Extract getErrorMessage Utility

**Location**: `@dragon/utils/error.ts` (extend existing)

```typescript
// Add to existing error.ts
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

### MEDIUM-2: Refactor processThread Method

**Location**: `apps/www/src/server-lib/inactivity-cleanup.ts`

Extract into smaller methods:

- `processThread` - main orchestration
- `hibernateAndUpdateThread` - hibernate + DB update
- `handlePostHibernation` - cleanup + notify

### MEDIUM-3: Extract Error Logging Utility

**Location**: `packages/agent/src/tool-calls.ts`

```typescript
// Extract helper at top of file
function logTransformError(
  agentName: string,
  toolName: string,
  stage: "parameters" | "result",
  error: unknown,
): void;
```

## LOW Priority

### LOW-1: Rename Legacy Functions for Clarity

**Location**: `packages/shared/src/model/threads.ts`

- `createLegacyThreadChatFull` → Keep as-is (well-documented purpose)
- Focus on adding JSDoc comments for clarity

## Execution Order

1. HIGH-1 → HIGH-2 (batch utility then constants)
2. HIGH-3 (status conditions)
3. MEDIUM-1 → MEDIUM-3 (utilities)
4. MEDIUM-2 (processThread refactor)
5. LOW-1 (documentation)
6. Run tests
7. Commit
