#!/bin/bash
# Generates minimal .env.development.local for Dragon www build
# Replace placeholder values with real credentials before running

cat > /opt/dragon/apps/www/.env.development.local << 'ENVFILE'
# Database (VPS uses 5433/6380 if 5432/6379 in use)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/dragon
# Use http:// for serverless-redis-http (port 8079); not redis://
REDIS_URL=http://localhost:8079
REDIS_TOKEN=redis_dev_token

# Auth - REPLACE with: openssl rand -base64 32
BETTER_AUTH_SECRET=REPLACE_WITH_openssl_rand_base64_32
BETTER_AUTH_URL=http://65.75.200.136:3000

# Internal
IS_ANTHROPIC_DOWN_URL=https://isanthropicdown.partykit.dev
IS_ANTHROPIC_DOWN_API_SECRET=dev
INTERNAL_SHARED_SECRET=REPLACE_WITH_openssl_rand_hex_32
CRON_SECRET=dev
ENCRYPTION_MASTER_KEY=REPLACE_WITH_32_character_key!!!!!!!

# AI - REPLACE with your keys
ANTHROPIC_API_KEY=sk-ant-placeholder
OPENAI_API_KEY=sk-placeholder
OPENROUTER_API_KEY=

# R2 - REPLACE with your Cloudflare R2 credentials
R2_ACCESS_KEY_ID=placeholder
R2_SECRET_ACCESS_KEY=placeholder
R2_ACCOUNT_ID=placeholder
R2_BUCKET_NAME=dragon-uploads
R2_PRIVATE_BUCKET_NAME=dragon-uploads-private
R2_PUBLIC_URL=https://placeholder.r2.dev

# Sandbox
E2B_API_KEY=e2b_placeholder

# GitHub App - REPLACE with your GitHub App credentials
GITHUB_CLIENT_ID=placeholder
GITHUB_CLIENT_SECRET=placeholder
NEXT_PUBLIC_GITHUB_APP_NAME=Dragon
GITHUB_WEBHOOK_SECRET=placeholder
GITHUB_APP_ID=0
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nplaceholder\n-----END RSA PRIVATE KEY-----"

# Public URL for sandbox communication
LOCALHOST_PUBLIC_DOMAIN=http://65.75.200.136:3000

# Broadcast - set after: cd apps/broadcast && pnpm partykit deploy
NEXT_PUBLIC_BROADCAST_HOST=placeholder.partykit.dev
NEXT_PUBLIC_BROADCAST_URL=https://placeholder.partykit.dev
ENVFILE

echo "Created .env.development.local - EDIT with real credentials before build/run"
