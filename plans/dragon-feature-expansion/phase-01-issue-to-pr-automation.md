# Phase 1: Issue-to-PR Automation

**Status**: ✅ Already Implemented
**Priority**: 1
**Effort**: Medium

> **Note**: Upon analysis, this feature is already fully implemented in the codebase:
>
> - `handleIssueEvent()` in `handlers.ts` processes `issues.opened` events
> - `runIssueAutomation()` in `automations.ts` executes the automation
> - Threads are created with `githubIssueNumber` set
> - Eyes reaction is added to acknowledge the issue
> - Automation trigger type `issue` with `on.open` configuration exists

---

## Overview

Enable GitHub issues labeled with a specific tag (e.g., `dragon`, `auto-fix`) to automatically trigger an agent that creates a PR resolving the issue.

---

## How It Works

```
1. User creates GitHub issue describing a bug/feature
2. User adds label "dragon" to the issue
3. GitHub webhook fires → Dragon receives event
4. Dragon creates a new thread/task from issue content
5. Agent executes in sandbox
6. Agent creates PR referencing the issue
7. PR is linked back to issue with "Fixes #123"
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

Add `issueTriggered` fields to track issue-originated tasks:

```typescript
// Add to threadTable
issueNumber: integer("issue_number"),
issueTitle: text("issue_title"),
issueBody: text("issue_body"),
issueTriggeredAt: timestamp("issue_triggered_at"),
issueAuthor: text("issue_author"),
```

### 2. GitHub Webhook Handler (`apps/www/src/app/api/webhooks/github/route.ts`)

Add issue label event handling:

```typescript
// Add to webhook router
webhooks.on("issues.labeled", handleIssueLabeledEvent);

async function handleIssueLabeledEvent(event: IssuesLabeledEvent) {
  const { issue, label, repository, sender } = event.payload;

  // Check if label matches trigger (configurable per environment)
  if (label.name !== DRAGON_TRIGGER_LABEL) return;

  // Find user who owns this repo integration
  const environment = await findEnvironmentByRepo(repository.full_name);
  if (!environment) return;

  // Create automatic task
  await createIssueTriggeredTask({
    userId: environment.userId,
    repoFullName: repository.full_name,
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueBody: issue.body,
    issueAuthor: sender.login,
  });
}
```

### 3. New Server Action (`apps/www/src/server-actions/issue-triggered-task.ts`)

```typescript
export async function createIssueTriggeredTask({
  userId,
  repoFullName,
  issueNumber,
  issueTitle,
  issueBody,
  issueAuthor,
}: IssueTriggeredTaskArgs) {
  // Compose prompt from issue
  const prompt = `
## GitHub Issue #${issueNumber}: ${issueTitle}

**Reported by:** @${issueAuthor}

**Description:**
${issueBody}

---

**Your Task:**
1. Analyze this issue and understand the problem
2. Implement a fix or the requested feature
3. Write appropriate tests
4. Create a PR that references this issue with "Fixes #${issueNumber}"
`;

  // Create thread with issue metadata
  const thread = await createThread({
    userId,
    repoFullName,
    initialMessage: prompt,
    metadata: {
      issueNumber,
      issueTitle,
      issueTriggeredAt: new Date(),
    },
  });

  // Post comment on issue
  await postIssueComment(
    repoFullName,
    issueNumber,
    `🤖 Dragon is working on this issue. [View progress](${DRAGON_URL}/thread/${thread.id})`,
  );

  return thread;
}
```

### 4. Issue Comment Updates (`apps/www/src/server-actions/github-issue-comment.ts`)

```typescript
export async function postIssueComment(
  repoFullName: string,
  issueNumber: number,
  body: string,
) {
  const octokit = await getInstallationOctokit(repoFullName);
  const [owner, repo] = repoFullName.split("/");

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

export async function updateIssueOnPRCreated(
  repoFullName: string,
  issueNumber: number,
  prNumber: number,
) {
  const body = `✅ PR #${prNumber} has been created to address this issue.`;
  await postIssueComment(repoFullName, issueNumber, body);
}
```

### 5. PR Creation Enhancement (`apps/www/src/server-actions/pull-request.ts`)

Modify to link PR to issue:

```typescript
// In createPullRequest function
if (thread.issueNumber) {
  prBody = `${prBody}\n\nFixes #${thread.issueNumber}`;

  // Update issue with PR link
  await updateIssueOnPRCreated(
    thread.githubRepoFullName,
    thread.issueNumber,
    prNumber,
  );
}
```

### 6. Environment Configuration

Add label configuration to environment table:

```typescript
// packages/shared/src/db/schema.ts
issueAutoTriggerLabel: text("issue_auto_trigger_label").default("dragon"),
issueAutoTriggerEnabled: boolean("issue_auto_trigger_enabled").default(false),
```

### 7. Settings UI (`apps/www/src/components/settings/`)

Add toggle and label configuration in environment settings.

---

## Testing Strategy

### Unit Tests

```typescript
// packages/shared/src/__tests__/issue-trigger.test.ts
describe("Issue-to-PR Automation", () => {
  it("creates thread from labeled issue", async () => {
    const event = mockIssueLabeledEvent({ label: "dragon" });
    await handleIssueLabeledEvent(event);

    const thread = await db.query.threadTable.findFirst({
      where: eq(threadTable.issueNumber, event.payload.issue.number),
    });

    expect(thread).toBeDefined();
    expect(thread.status).toBe("queued");
  });

  it("ignores issues without trigger label", async () => {
    const event = mockIssueLabeledEvent({ label: "bug" });
    await handleIssueLabeledEvent(event);

    const thread = await db.query.threadTable.findFirst({
      where: eq(threadTable.issueNumber, event.payload.issue.number),
    });

    expect(thread).toBeUndefined();
  });

  it("links PR to issue on completion", async () => {
    // ... test PR creation includes "Fixes #X"
  });
});
```

### Integration Tests

- Webhook signature validation
- Full flow: issue → task → PR → issue comment
- Rate limiting on issue triggers

---

## Rollout Plan

1. **Feature Flag**: `issueToprAutomation` - disabled by default
2. **Beta Users**: Enable for select users first
3. **Monitoring**: Track success/failure rates
4. **Full Rollout**: Enable after 1 week of stable beta

---

## Security Considerations

- Validate webhook signatures
- Limit to authenticated GitHub installations
- Rate limit to prevent abuse (max 5 issue triggers per hour per repo)
- Sanitize issue body content before using as prompt
