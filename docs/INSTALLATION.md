# Dragon Installation Guide

This guide provides detailed instructions for setting up Dragon for local development.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Detailed Setup](#detailed-setup)
4. [Environment Variables](#environment-variables)
5. [Database Setup](#database-setup)
6. [External Services](#external-services)
7. [Running the Application](#running-the-application)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version   | Purpose                      |
| -------- | --------- | ---------------------------- |
| Node.js  | v20+      | Runtime environment          |
| pnpm     | v10.14.0+ | Package manager              |
| Docker   | Latest    | PostgreSQL, Redis containers |
| Git      | Latest    | Version control              |

### Optional Software

| Software                | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| Stripe CLI              | Webhook forwarding (for billing features) |
| ngrok/Cloudflare Tunnel | Local tunnel for sandboxes                |

### Install Prerequisites

**macOS (with Homebrew):**

```bash
# Node.js
brew install node@20

# pnpm
npm install -g pnpm

# Docker
brew install --cask docker

# Stripe CLI (optional)
brew install stripe/stripe-cli/stripe
```

**Ubuntu/Debian:**

```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
npm install -g pnpm

# Docker
sudo apt-get install docker.io docker-compose
sudo usermod -aG docker $USER
```

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/dragonlabs/dragon.git
cd dragon

# Install dependencies
pnpm install

# Copy environment files
cp packages/dev-env/.env.example packages/dev-env/.env.development.local
cp apps/www/.env.example apps/www/.env.development.local
cp apps/broadcast/.env.example apps/broadcast/.env
cp packages/shared/.env.example packages/shared/.env.development.local

# Start infrastructure (PostgreSQL, Redis)
docker-compose up -d

# Push database schema
pnpm -C packages/shared drizzle-kit-push-dev

# Start development servers
pnpm dev
```

---

## Detailed Setup

### 1. Clone Repository

```bash
git clone https://github.com/dragonlabs/dragon.git
cd dragon
```

### 2. Install Dependencies

```bash
pnpm install
```

This installs all workspace dependencies across:

- `apps/www` - Main web application
- `apps/broadcast` - WebSocket service
- `apps/docs` - Documentation site
- `apps/cli` - CLI tool
- `packages/shared` - Shared utilities
- `packages/daemon` - Agent daemon
- `packages/agent` - Agent types
- And more...

### 3. Environment Configuration

Copy all example environment files:

```bash
# Development environment configuration
cp packages/dev-env/.env.example packages/dev-env/.env.development.local

# Main application
cp apps/www/.env.example apps/www/.env.development.local

# WebSocket service
cp apps/broadcast/.env.example apps/broadcast/.env

# Shared packages
cp packages/shared/.env.example packages/shared/.env.development.local
```

---

## Environment Variables

### Required Variables

#### Database

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dragon
REDIS_URL=redis://localhost:6379
```

#### Authentication

```env
NEXTAUTH_SECRET=your-random-secret-key
NEXTAUTH_URL=http://localhost:3000
```

#### AI Providers (at least one required)

```env
# Anthropic (for Claude)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (for Codex/GPT)
OPENAI_API_KEY=sk-...

# Google (for Gemini)
GOOGLE_AI_API_KEY=...
```

### Optional Variables

#### GitHub App (for OAuth & webhooks)

```env
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=xxx
```

#### Sandbox Provider

```env
SANDBOX_PROVIDER=e2b  # or "local"
E2B_API_KEY=e2b_...
```

#### R2/S3 Storage

```env
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=dragon-uploads
```

#### Slack Integration

```env
SLACK_CLIENT_ID=xxx
SLACK_CLIENT_SECRET=xxx
SLACK_SIGNING_SECRET=xxx
```

#### Local Tunnel

```env
LOCAL_TUNNEL_URL=https://your-tunnel.ngrok.io
```

---

## Database Setup

### Start PostgreSQL and Redis

Using Docker Compose:

```bash
docker-compose up -d
```

Or manually:

```bash
# PostgreSQL
docker run -d \
  --name dragon-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dragon \
  -p 5432:5432 \
  postgres:15

# Redis
docker run -d \
  --name dragon-redis \
  -p 6379:6379 \
  redis:7
```

### Push Schema

Push the database schema:

```bash
pnpm -C packages/shared drizzle-kit-push-dev
```

### Generate Migrations (optional)

If you make schema changes:

```bash
pnpm -C packages/shared drizzle-kit generate
```

### View Database

Open Drizzle Studio to browse the database:

```bash
pnpm -C packages/shared drizzle-kit studio
```

---

## External Services

### GitHub App Setup

1. Go to GitHub Developer Settings > GitHub Apps
2. Create a new GitHub App with:
   - **Callback URL**: `http://localhost:3000/api/auth/callback/github`
   - **Webhook URL**: `http://localhost:3000/api/webhooks/github`
   - **Permissions**:
     - Repository: Read & Write (Contents, Issues, Pull requests)
     - Account: Read (Email addresses)
3. Generate a private key
4. Add credentials to `.env.development.local`

### Stripe Setup (for billing)

1. Create a Stripe account
2. Get API keys from Dashboard
3. Install Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe
   ```
4. Forward webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

### Local Tunnel Setup

For sandboxes to communicate with your local environment:

**Using ngrok:**

```bash
ngrok http 3000
```

**Using Cloudflare Tunnel:**

```bash
cloudflared tunnel --url http://localhost:3000
```

Add the tunnel URL to your environment:

```env
LOCAL_TUNNEL_URL=https://your-tunnel.ngrok.io
```

---

## Running the Application

### Development Mode

Start all services:

```bash
pnpm dev
```

This starts:

- Main app at `http://localhost:3000`
- WebSocket service (broadcast)
- Docs site at `http://localhost:3001`

### Individual Services

```bash
# Main web app only
pnpm -C apps/www dev

# WebSocket service only
pnpm -C apps/broadcast dev

# Docs site only
pnpm -C apps/docs dev
```

### Build for Production

```bash
# Build all packages
pnpm build

# Build specific app
pnpm -C apps/www build
```

### Run Tests

```bash
# All tests
pnpm test

# Specific package
pnpm -C packages/daemon test

# With coverage
pnpm test -- --coverage
```

### Type Checking

```bash
# Check all packages
pnpm run tsc-check

# Check specific package
pnpm -C packages/shared tsc --noEmit
```

### Linting

```bash
# Lint all
pnpm lint

# Fix issues
pnpm lint --fix
```

---

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

#### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Restart container
docker restart dragon-postgres

# Check logs
docker logs dragon-postgres
```

#### pnpm Install Fails

```bash
# Clear cache
pnpm store prune

# Remove node_modules
rm -rf node_modules
rm -rf **/node_modules

# Reinstall
pnpm install
```

#### Schema Push Fails

```bash
# Check DATABASE_URL is correct
echo $DATABASE_URL

# Try direct connection
psql $DATABASE_URL -c "SELECT 1"

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
pnpm -C packages/shared drizzle-kit-push-dev
```

### Getting Help

- Check existing issues on GitHub
- Review the documentation in `docs/`
- Check application logs: `pnpm dev` outputs all service logs

---

## Project Structure

```
dragon/
├── apps/
│   ├── www/           # Main Next.js web application
│   ├── broadcast/     # WebSocket service
│   ├── cli/           # CLI tool (toothless)
│   └── docs/          # Documentation site
├── packages/
│   ├── shared/        # Shared utilities, DB schema
│   ├── daemon/        # Agent daemon
│   ├── agent/         # Agent type definitions
│   ├── sandbox/       # Sandbox utilities
│   └── mcp-server/    # MCP server
├── docs/
│   ├── FEATURES.md    # Feature documentation
│   └── INSTALLATION.md # This file
└── README.md
```

---

## Next Steps

After installation:

1. **Create an account**: Visit `http://localhost:3000` and sign up
2. **Connect GitHub**: Authorize the GitHub app
3. **Add a repository**: Select a repo to work with
4. **Create a task**: Start your first AI-assisted task
5. **Explore features**: Try Plan mode, autonomous execution, etc.

For feature documentation, see [docs/FEATURES.md](FEATURES.md).
