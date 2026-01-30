---
description: Search your coding memory for past work and sessions
---

# Super Search

Search through Supermemory to find information from past work sessions.

## When to Use

Use this skill when the user:

- Asks about past work or previous sessions
- Wants to recall how something was implemented
- Asks "what did I work on" or similar
- Wants to find decisions or notes from earlier

## How to Search

Execute the search with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/search-memory.cjs" "QUERY"
```

Replace QUERY with the user's search terms.

## Examples

- "what did I work on yesterday"
- "how did I implement authentication"
- "database migration changes"
- "API endpoint for users"

## Response Guidelines

- Present results clearly with relevance scores
- Offer to search with different terms if results are insufficient
- Summarize key findings from the search results
