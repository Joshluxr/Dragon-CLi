-- Run against your Terragon/Dragon Postgres (e.g. database "terragon").
-- Invalidates all logged-in sessions and removes GitHub OAuth account rows
-- so users must sign in again and reconnect GitHub.
--
-- docker exec -i terragon_postgres_dev psql -U postgres -d terragon < scripts/self-hosted-clear-auth-and-github.sql
--
-- Better Auth tables: session, account, user (see packages/shared/src/db/schema.ts)

BEGIN;

-- End every browser session (cookies become invalid).
TRUNCATE TABLE session;

-- Remove linked OAuth accounts (GitHub sign-in / GitHub App OAuth).
-- provider_id is typically "github" for the social provider.
DELETE FROM account
WHERE provider_id ILIKE '%github%';

-- Show GitHub onboarding again (stored on user_flags, not user).
UPDATE user_flags SET has_seen_onboarding = false;

COMMIT;

-- Verify
SELECT 'sessions_remaining' AS label, COUNT(*)::text AS value FROM session
UNION ALL
SELECT 'github_accounts_remaining', COUNT(*)::text FROM account WHERE provider_id ILIKE '%github%';
