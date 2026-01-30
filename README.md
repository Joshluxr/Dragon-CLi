# Dragon

**Dragon** is an AI-powered coding assistant platform that enables users to run multiple coding agents in parallel within isolated cloud sandboxes. Delegate work to coding agents, track progress in real-time, and seamlessly integrate with your existing Git workflow.


## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Development](#development)
- [Testing](#testing)
- [Documentation](#documentation)
- [License](#license)

## Features

### Core Features

- **Multi-Agent Support**: Run multiple coding agents including [Claude Code](https://www.anthropic.com/products/claude-code), [OpenAI Codex](https://github.com/openai/codex), [Amp](https://ampcode.com/), [Gemini](https://github.com/google-gemini/gemini-cli), and OpenCode. Each agent supports multiple models with configurable quality tiers.

- **Sandbox Isolation**: Each agent runs in an isolated container (via E2B, Daytona, or Docker) with its own repository copy. Agents can read files, make changes, and run tests without affecting other concurrent tasks or your local environment.

- **Seamless Git Workflow**: Tasks are automatically assigned unique branches. Agent work is checkpointed and pushed to GitHub with AI-generated commits and Pull Requests. The git workflow can be disabled as needed.

- **Toothless CLI & MCP Server**: The `toothless` CLI tool enables local task takeover and continuation. Includes an MCP server for managing and creating tasks from MCP-compatible clients (Cursor, Claude Code).

- **BYO Subscription & API Keys**: Use your existing Claude or ChatGPT subscriptions to power coding agents, or configure with your own API keys.

- **Automations**: Create recurring tasks (cron-based) or event-triggered workflows (on new issues, PRs, or @mentions) to automate repetitive development tasks.

- **Real-time Management**: Task status and agent progress stream to your browser via WebSocket. Browser notifications keep you informed when tasks complete.

- **Integrations**: @-mention Dragon in Slack or GitHub to kick off tasks directly where context exists.

### Advanced Features

| Feature | Description |
|---------|-------------|
| **Issue-to-PR Automation** | Automatically convert GitHub issues into pull requests |
| **PR-Agent Code Review** | Automatic code review with configurable focus areas (security, performance, logic, tests) |
| **Plan and Act Modes** | Structured execution with planning, approval, and step-by-step execution |
| **TDD Guard Hooks** | Enforce code quality with automated type checking, linting, and testing |
| **Browser Automation** | Headless browser control for visual testing and UI verification |
| **Autonomous Exit Detection** | Intelligent completion detection with configurable safety limits |
| **Multi-Agent Orchestration** | Coordinate multiple agents with file locking, dependency graphs, and swarm/pipeline/parallel modes |
| **Usage Dashboard** | Track costs, tokens, and analytics with configurable daily/monthly limits |
| **Session Continuity** | Save/restore sessions and seamless agent handoffs between different AI providers |
| **MCP Self-Extension** | Agents can create custom MCP tools dynamically |

For detailed documentation of all features, see **[docs/FEATURES.md](docs/FEATURES.md)**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Dragon Platform                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   apps/www   │  │apps/broadcast│  │   apps/cli   │               │
│  │  (Next.js)   │  │  (PartyKit)  │  │    (Ink)     │               │
│  │   Frontend   │  │  WebSocket   │  │  Toothless CLI   │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│         └────────────┬────┴─────────────────┘                        │
│                      │                                               │
│  ┌───────────────────┴───────────────────────────────────────────┐  │
│  │                    Shared Packages                             │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │  │
│  │  │ shared  │ │ sandbox │ │ daemon  │ │  agent  │ │mcp-server│  │  │
│  │  │(DB/ORM) │ │(E2B/etc)│ │(runtime)│ │ (types) │ │ (tools) │  │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                      │                                               │
│  ┌───────────────────┴───────────────────────────────────────────┐  │
│  │                    Sandbox Providers                           │  │
│  │         ┌─────┐        ┌─────────┐        ┌────────┐          │  │
│  │         │ E2B │        │ Daytona │        │ Docker │          │  │
│  │         └─────┘        └─────────┘        └────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js**: v20 or higher
- **pnpm**: v10.14.0 or higher
- **Docker**: Required for local development (PostgreSQL, Redis containers)
- **Stripe CLI**: Required for local webhook forwarding (optional, for billing features)

Install Stripe CLI via Homebrew (macOS):

```bash
brew install stripe/stripe-cli/stripe
```

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Environment Configuration

Copy the example environment files and configure them with your credentials:

```bash
# Development environment
cp packages/dev-env/.env.example packages/dev-env/.env.development.local

# Main application
cp apps/www/.env.example apps/www/.env.development.local

# WebSocket service
cp apps/broadcast/.env.example apps/broadcast/.env

# Shared packages
cp packages/shared/.env.example packages/shared/.env.development.local
```

**Required credentials:**

| Service | Purpose |
|---------|---------|
| Local tunnel (ngrok/Cloudflare) | Sandbox-to-server communication |
| AI Provider API Keys | Task naming, commit messages |
| Sandbox Provider (E2B/Daytona) | Agent execution environment |
| GitHub App | Authentication |
| Cloudflare R2 | Image and attachment storage |
| Slack App (optional) | Slack integration |

### 3. Push database schema

```bash
pnpm -C packages/shared drizzle-kit-push-dev
```

Run this command whenever you make changes to the database schema.

### 4. Start development servers

```bash
pnpm dev
```

This starts all services:

| Service | Port | Description |
|---------|------|-------------|
| `apps/www` | 3000 | Main web application |
| `apps/docs` | 3001 | Documentation site |
| `apps/broadcast` | - | WebSocket service (PartyKit) |
| Docker | 5432, 6379 | PostgreSQL, Redis |
| ngrok tunnel | - | Local tunnel for sandbox communication |
| Cron jobs | - | Scheduled task processing |

## Project Structure

```
dragon/
├── apps/
│   ├── www/              # Main Next.js 15 web application
│   ├── broadcast/        # PartyKit WebSocket service
│   ├── cli/              # Toothless CLI tool (Ink-based)
│   └── docs/             # Fumadocs documentation site
│
├── packages/
│   ├── shared/           # Database schema (Drizzle), models, utilities
│   ├── sandbox/          # Multi-provider sandbox abstraction (E2B, Daytona, Docker)
│   ├── daemon/           # Node.js agent runtime for sandboxes
│   ├── agent/            # Agent type definitions and model mappings
│   ├── mcp-server/       # MCP tools (SuggestFollowupTask, etc.)
│   ├── bundled/          # Bundled scripts for deployment
│   ├── cli-api-contract/ # Type-safe ORPC contract for CLI
│   ├── env/              # Environment configuration
│   ├── r2/               # Cloudflare R2 storage integration
│   ├── transactional/    # React Email templates
│   ├── sandbox-image/    # Docker templates for sandbox images
│   ├── one-time-token-signin/ # Better Auth plugin
│   ├── debug-scripts/    # E2B debugging utilities
│   ├── types/            # Shared TypeScript types
│   ├── utils/            # Common utilities
│   └── tsconfig/         # Shared TypeScript config
│
├── docs/                 # Additional documentation
│   └── FEATURES.md       # Detailed feature documentation
│
└── scripts/              # Build and utility scripts
```

## Technology Stack

### Frontend
- **Framework**: Next.js 15.4.5 (App Router), React 19.1.0
- **Styling**: Tailwind CSS v4, Radix UI, shadcn/ui
- **State**: Jotai, TanStack Query (React Query)
- **Rich Text**: TipTap 2.14.0 (slash commands, mentions)
- **Terminal**: xterm 5.5.0
- **Charts**: Recharts 2.15.4

### Backend
- **Runtime**: Node.js 20+
- **Database**: PostgreSQL 16, Drizzle ORM 0.43.1
- **Cache**: Redis 7
- **Auth**: Better Auth (GitHub OAuth, Claude OAuth)
- **Rate Limiting**: Upstash

### AI & Agents
- **Claude**: @anthropic-ai/sdk (v0.52.0)
- **OpenAI**: OpenAI SDK
- **Gemini**: Google Gemini CLI
- **Amp**: Amp code assistant
- **MCP**: Model Context Protocol for tool extensions

### Infrastructure
- **Sandboxes**: E2B, Daytona, Docker
- **Real-time**: PartyKit WebSocket
- **Storage**: Cloudflare R2
- **Email**: React Email, Resend
- **Billing**: Stripe
- **Analytics**: PostHog

### Build & Deploy
- **Monorepo**: pnpm workspaces (v10.14.0)
- **Build**: Turborepo
- **Testing**: Vitest
- **CI/CD**: GitHub Actions
- **Deployment**: Vercel (frontend), PartyKit (WebSocket)

## Development

### Key Commands

```bash
# Development
pnpm dev                  # Start all services
pnpm tsc-watch           # TypeScript watch mode
pnpm tsc-check           # Type checking

# Database
pnpm -C packages/shared drizzle-kit-push-dev    # Push schema changes
pnpm -C packages/shared drizzle-kit-studio-dev  # Open Drizzle Studio

# CLI
pnpm install-cli:dev     # Install Toothless CLI locally
pnpm -C apps/cli install:dev
```

### Database Schema

The database uses Drizzle ORM with PostgreSQL. Key tables:

| Table | Purpose |
|-------|---------|
| `user` | Authentication, settings, roles |
| `thread` | Tasks with sandbox/PR references |
| `threadChat` | Messages and tool calls |
| `environment` | Repository configurations |
| `githubPR` | PR tracking and status |
| `automation` | Task scheduling and triggers |
| `featureFlag` | User and global feature flags |

### Feature Flags

Define flags in `packages/shared/src/model/feature-flags-definitions.ts`:

```typescript
export const featureFlagsDefinitions = {
  myNewFeature: {
    defaultValue: false,
    description: "Description of the feature",
  },
} satisfies Record<string, FeatureFlagDefinition>;
```

Use in components:

```typescript
import { useFeatureFlag } from "@/hooks/use-feature-flag";

const isEnabled = useFeatureFlag("myNewFeature");
```

## Testing

```bash
# Run all tests
pnpm -C apps/www test
pnpm -C packages/shared test
pnpm -C packages/daemon test
pnpm -C packages/sandbox test

# Type checking
pnpm tsc-check
```

### Test Databases

- Development: PostgreSQL on port 5432, Redis on port 6379
- Testing: PostgreSQL on port 15432, Redis on port 16379

## Documentation

- **[docs/FEATURES.md](docs/FEATURES.md)** - Detailed feature documentation
- **[apps/docs](apps/docs)** - Fumadocs documentation site (run `pnpm dev` to view at port 3001)
- **[AGENTS.md](AGENTS.md)** - Agent instructions and codebase context

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
