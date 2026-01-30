# Toothless CLI

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/@terragon-labs/cli)

[npm]: https://img.shields.io/npm/v/@terragon-labs/cli.svg?style=flat-square

The official CLI for Dragon Labs - your AI-powered coding assistant.

## Installation

```bash
# Using npm
npm install -g @terragon-labs/cli

# Using pnpm
pnpm add -g @terragon-labs/cli

# Using yarn
yarn global add @terragon-labs/cli
```

## Commands

### `toothless auth`

Authenticate with your Dragon account. This will:

1. Open your browser for authentication
2. Generate a secure token
3. Store credentials safely in `~/.toothless/config.json` (configurable via `TERRY_SETTINGS_DIR`)
4. Confirm successful connection

```bash
toothless auth
```

#### Configuration directory

By default, credentials are stored in `~/.toothless/config.json`. You can override the settings directory by setting the `TERRY_SETTINGS_DIR` environment variable:

```bash
# Example: use a custom settings directory
export TERRY_SETTINGS_DIR=~/.config/toothless
toothless auth
```

### `toothless create`

Create a new task in Dragon with a message:

```bash
# Create a task in the current repository and branch
toothless create "Fix the login bug"

# Specify a different repository
toothless create "Add new feature" --repo owner/repo

# Use a specific base branch
toothless create "Update documentation" --branch develop

# Use existing branch without creating a new one
toothless create "Quick fix" --no-new-branch

# Start in plan mode (no file writes until approval)
toothless create "Refactor the auth module" --mode plan

# Choose a specific model
toothless create "Investigate flaky tests" --model sonnet
toothless create "Run large codegen" --model gpt-5-high
> GPT-5.1 Codex Max variants require a ChatGPT subscription connected in Settings.
```

#### Options

- `-r, --repo <repo>`: GitHub repository (default: current repository)
- `-b, --branch <branch>`: Base branch name (default: current branch, falls back to main)
- `--no-new-branch`: Don't create a new branch (default: creates new branch)
- `-m, --mode <mode>`: Task mode: `plan` or `execute` (default: `execute`)
- `-M, --model <model>`: AI model to use: `opus`, `sonnet`, `haiku`, `amp`, `gpt-5-low`, `gpt-5-medium`, `gpt-5`, `gpt-5-high`, `gpt-5.2-low`, `gpt-5.2-medium`, `gpt-5.2`, `gpt-5.2-high`, `gpt-5.1-low`, `gpt-5.1-medium`, `gpt-5.1`, `gpt-5.1-high`, `gpt-5.1-codex-max-low`, `gpt-5.1-codex-max-medium`, `gpt-5.1-codex-max`, `gpt-5.1-codex-max-high`, `gpt-5.1-codex-max-xhigh`, `gpt-5-codex-low`, `gpt-5-codex-medium`, `gpt-5-codex-high`, `gpt-5.1-codex-low`, `gpt-5.1-codex-medium`, `gpt-5.1-codex-high`, `gemini-3-pro`, `gemini-2.5-pro`, `grok-code`, `qwen3-coder`, `kimi-k2`, `glm-4.6`, `opencode/gemini-2.5-pro` (optional)

### `toothless pull`

Pull tasks from Dragon to your local machine:

```bash
# Interactive mode - select from recent tasks
toothless pull

# Pull a specific task by ID
toothless pull <taskId>

# Pull and automatically launch Claude Code
toothless pull <taskId> --resume
```

**Getting the task ID**: You can find the task ID at the end of the URL when viewing a task in Dragon. For example, in `https://dragon-labz.vercel.app/tasks/abc123-def456`, the task ID is `abc123-def456`.

#### Options

- `-r, --resume`: Automatically launch Claude Code after pulling

### `toothless list`

List all tasks in a non-interactive format:

```bash
# List all tasks (automatically filters by current repo when inside a Git repository)
toothless list
```

#### Example Output

```
Task ID         abc123def456
Name            Fix login bug
Branch          dragon/fix-login
Repository      myorg/myrepo
PR Number       #123

Task ID         def789ghi012
Name            Add dark mode
Branch          dragon/dark-mode
Repository      myorg/myrepo
PR Number       N/A

Total: 2 tasks
```

### `toothless mcp`

Run an MCP (Model Context Protocol) server for the git repository:

```bash
# Run MCP server for current directory
toothless mcp
```

#### Claude Code Integration

You can add the Toothless MCP server to your local Claude Code instance to enable direct interaction with Dragon tasks from within Claude:

```bash
claude mcp add toothless -- toothless mcp
```

This integration provides Claude Code with the following capabilities:

- **`terry_list`**: List all your Dragon tasks directly from Claude
- **`terry_create`**: Create new tasks without leaving Claude Code
- **`terry_pull`**: Pull task session data to continue work

The MCP server acts as a bridge between Claude Code and Dragon, allowing you to manage tasks using natural language commands within your AI coding sessions.

## Support

- **Documentation**: [https://dragon-labz-docs.vercel.app](https://dragon-labz-docs.vercel.app)
- **Website**: [https://dragon-labz.vercel.app](https://dragon-labz.vercel.app)
