# Deprecated Tables Cleanup Migration

## Overview

The following tables in `packages/shared/src/db/schema.ts` are deprecated and should be dropped in a future migration:

1. `claudeOAuthTokens_DEPRECATED` (line 546)
2. `geminiAuth_DEPRECATED` (line 575)
3. `ampAuth_DEPRECATED` (line 593)
4. `openAIAuth_DEPRECATED` (line 610)

These tables have been replaced by the unified `agent_provider_credentials` table.

## Pre-Migration Checklist

Before running the migration:

- [ ] Verify no code references these tables
- [ ] Confirm all data has been migrated to `agent_provider_credentials`
- [ ] Create backup of affected tables
- [ ] Test migration in staging environment

## Migration SQL

```sql
-- Migration: Drop deprecated authentication tables
-- Description: Remove legacy auth tables replaced by agent_provider_credentials

-- Drop deprecated Claude OAuth tokens table
DROP TABLE IF EXISTS claude_oauth_tokens CASCADE;

-- Drop deprecated Gemini auth table
DROP TABLE IF EXISTS gemini_auth CASCADE;

-- Drop deprecated AMP auth table
DROP TABLE IF EXISTS amp_auth CASCADE;

-- Drop deprecated OpenAI auth table
DROP TABLE IF EXISTS openai_auth CASCADE;
```

## Rollback SQL

```sql
-- Rollback: Recreate deprecated authentication tables
-- Note: Data will be lost, use backup to restore

CREATE TABLE claude_oauth_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE UNIQUE,
  is_subscription BOOLEAN NOT NULL DEFAULT true,
  anthropic_api_key_encrypted TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_type TEXT NOT NULL,
  expires_at TIMESTAMP,
  refresh_token_encrypted TEXT,
  scope TEXT,
  is_max BOOLEAN NOT NULL DEFAULT false,
  organization_type TEXT,
  account_id TEXT,
  account_email TEXT,
  org_id TEXT,
  org_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE gemini_auth (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE UNIQUE,
  token_type TEXT NOT NULL,
  gemini_api_key_encrypted TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE amp_auth (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE UNIQUE,
  amp_api_key_encrypted TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE openai_auth (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE UNIQUE,
  openai_api_key_encrypted TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  id_token_encrypted TEXT,
  account_id TEXT,
  expires_at TIMESTAMP,
  last_refreshed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Post-Migration Steps

1. Remove the deprecated table definitions from `packages/shared/src/db/schema.ts`
2. Update any type definitions that reference these tables
3. Verify application functionality

## Timeline

- **Target Date**: TBD (after confirming no production usage)
- **Estimated Effort**: 1-2 hours
- **Risk Level**: Low (tables are marked deprecated and unused)
