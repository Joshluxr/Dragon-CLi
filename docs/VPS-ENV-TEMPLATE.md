# VPS Production Environment Template

Copy these to `apps/www/.env.development.local` (Dragon uses .env.development.local for dev config; for VPS we reuse it with production values).

## Generate Secrets

```bash
# BETTER_AUTH_SECRET
openssl rand -base64 32

# ENCRYPTION_MASTER_KEY (32+ chars)
openssl rand -base64 32

# INTERNAL_SHARED_SECRET
openssl rand -hex 32

# GITHUB_WEBHOOK_SECRET
openssl rand -hex 32
```

## Minimal VPS Config (IP-only access)

Replace `65.75.200.136` with your VPS IP:

```env
# Database (Docker default)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dragon
REDIS_URL=redis://localhost:6379

# Auth - use your public URL
BETTER_AUTH_URL=http://65.75.200.136:3000
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-32>

# Sandbox communication (daemon needs to reach your server)
LOCALHOST_PUBLIC_DOMAIN=http://65.75.200.136:3000

# Encryption
ENCRYPTION_MASTER_KEY=<32-char-key>
INTERNAL_SHARED_SECRET=<generate-with-openssl-rand-hex-32>

# AI Providers (required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=...
E2B_API_KEY=e2b_...

# GitHub App (required for auth)
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=<generate-with-openssl-rand-hex-32>
NEXT_PUBLIC_GITHUB_APP_NAME=your-app-name

# R2 Storage (required for uploads)
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_ACCOUNT_ID=xxx
R2_BUCKET_NAME=dragon-uploads
R2_PRIVATE_BUCKET_NAME=dragon-uploads-private
R2_PUBLIC_URL=https://your-r2-bucket.r2.dev

# Broadcast - set after: cd apps/broadcast && pnpm partykit deploy
NEXT_PUBLIC_BROADCAST_HOST=broadcast-xxx.partykit.dev
NEXT_PUBLIC_BROADCAST_URL=https://broadcast-xxx.partykit.dev

# Email (optional but recommended)
RESEND_API_KEY=re_...
```

## With Domain + SSL

```env
BETTER_AUTH_URL=https://dragon.yourdomain.com
LOCALHOST_PUBLIC_DOMAIN=https://dragon.yourdomain.com
```

## Broadcast (apps/broadcast/.env)

```env
NODE_ENV=production
BETTER_AUTH_URL=http://65.75.200.136:3000
INTERNAL_SHARED_SECRET=<same-as-www>
E2B_API_KEY=e2b_...
```
