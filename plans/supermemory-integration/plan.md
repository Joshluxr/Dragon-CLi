# Supermemory Integration Plan

## Overview

Integrate the [claude-supermemory](https://github.com/supermemoryai/claude-supermemory) plugin to enable persistent memory across sessions for Dragon. This will allow the system to remember context about users' work, preferences, and project patterns.

## Current Status

- **Phase**: Planning
- **Priority**: Medium
- **Estimated Phases**: 5

## Phase Summary

| Phase | Description             | Status  | Details                                         |
| ----- | ----------------------- | ------- | ----------------------------------------------- |
| 1     | Infrastructure Setup    | Pending | [phase-01](./phase-01-infrastructure-setup.md)  |
| 2     | Core Implementation     | Pending | [phase-02](./phase-02-core-implementation.md)   |
| 3     | Hooks Implementation    | Pending | [phase-03](./phase-03-hooks-implementation.md)  |
| 4     | Skills & Commands       | Pending | [phase-04](./phase-04-skills-commands.md)       |
| 5     | Testing & Documentation | Pending | [phase-05](./phase-05-testing-documentation.md) |

## Key Dependencies

- `supermemory` npm package (v4.0.0)
- Supermemory API key (`SUPERMEMORY_CC_API_KEY`)
- Node.js 18+

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Session                       │
├─────────────────────────────────────────────────────────────┤
│  SessionStart    │  UserPromptSubmit  │  PostToolUse  │ Stop│
│       ↓          │         ↓          │       ↓       │  ↓  │
│  context-hook    │    prompt-hook     │ observation   │summary│
│       ↓          │         ↓          │    -hook      │-hook │
├─────────────────────────────────────────────────────────────┤
│                   Supermemory SDK                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │getProfile│ │addMemory │ │ search   │ │containers│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│                   Supermemory API                            │
│              (console.supermemory.ai)                        │
└─────────────────────────────────────────────────────────────┘
```

## Files to Create

### Plugin Structure

```
packages/supermemory/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Main exports
│   ├── client.ts                # Supermemory client wrapper
│   ├── hooks/
│   │   ├── context-hook.ts      # Session start - inject context
│   │   ├── prompt-hook.ts       # User prompt submit - capture input
│   │   ├── observation-hook.ts  # Post tool use - capture actions
│   │   └── summary-hook.ts      # Session end - persist summary
│   ├── commands/
│   │   ├── index.ts             # Index codebase command
│   │   └── logout.ts            # Clear credentials
│   ├── skills/
│   │   └── super-search.ts      # Memory search skill
│   └── utils/
│       ├── settings.ts          # Settings management
│       ├── container.ts         # Project/container identification
│       ├── auth.ts              # Authentication flow
│       └── formatter.ts         # Context formatting
└── plugin/
    ├── .claude-plugin/
    │   └── manifest.json        # Plugin manifest
    ├── hooks/
    │   └── hooks.json           # Hook configuration
    ├── commands/
    │   ├── index.md             # Index command
    │   └── logout.md            # Logout command
    └── skills/
        └── super-search/
            └── SKILL.md         # Search skill definition
```

## Integration Points

### 1. Environment Variables

```bash
SUPERMEMORY_CC_API_KEY=sm_...     # Required - API key
SUPERMEMORY_SKIP_TOOLS=           # Optional - tools to skip
SUPERMEMORY_DEBUG=false           # Optional - debug logging
```

### 2. Settings File

Location: `~/.supermemory-claude/settings.json`

```json
{
  "skipTools": ["Read"],
  "captureTools": ["Edit", "Write", "Bash", "Task"],
  "maxProfileItems": 50,
  "debug": false
}
```

### 3. Existing Dragon Integration

The plugin will integrate with:

- **Thread system**: Store thread context for cross-session recall
- **Agent system**: Provide agent-specific memory contexts
- **User settings**: Store user preferences per project

## Risk Assessment

| Risk                 | Impact | Mitigation                           |
| -------------------- | ------ | ------------------------------------ |
| API rate limits      | Medium | Implement batching and caching       |
| Privacy concerns     | High   | Allow opt-out, clear documentation   |
| Performance overhead | Medium | Async processing, skip non-essential |
| API key security     | High   | Secure storage, never log keys       |

## Success Criteria

1. Context injection works on session start
2. Conversation turns are captured automatically
3. Search skill returns relevant past work
4. Codebase indexing captures architecture patterns
5. No performance degradation in normal operations
6. All tests pass
