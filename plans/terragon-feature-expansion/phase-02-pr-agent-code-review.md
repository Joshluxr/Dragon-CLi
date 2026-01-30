# Phase 2: PR-Agent Style Automated Code Review

**Status**: Pending
**Priority**: 2
**Effort**: Medium

---

## Overview

Automatically analyze and review pull requests when opened or updated, providing:

- Structured code review with categorized feedback
- Security vulnerability detection
- Best practices suggestions
- Automatic PR description generation
- Changelog update suggestions

---

## How It Works

```
1. PR opened/updated on GitHub
2. GitHub webhook fires → Terragon receives event
3. Terragon spawns review agent
4. Agent analyzes diff, files changed, and context
5. Agent posts structured review comment
6. Optional: Agent can suggest code improvements as review suggestions
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

Add PR review tracking:

```typescript
// New table for PR reviews
export const prReviewTable = pgTable("pr_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  prId: uuid("pr_id").references(() => githubPRTable.id),
  threadId: uuid("thread_id").references(() => threadTable.id),
  reviewType: text("review_type").$type<"auto" | "manual">(),
  status: text("status").$type<"pending" | "in_progress" | "completed" | "failed">(),
  summary: text("summary"),
  issuesFound: integer("issues_found").default(0),
  suggestionsCount: integer("suggestions_count").default(0),
  securityIssues: integer("security_issues").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Add to environmentTable
autoReviewEnabled: boolean("auto_review_enabled").default(false),
autoReviewConfig: jsonb("auto_review_config").$type<AutoReviewConfig>(),
```

### 2. Auto Review Config Type

```typescript
// packages/shared/src/model/auto-review.ts
export interface AutoReviewConfig {
  enabledTriggers: ("opened" | "synchronize" | "ready_for_review")[];
  skipDraftPRs: boolean;
  skipBots: boolean;
  maxFilesChanged: number; // Skip if PR too large
  focusAreas: ("security" | "performance" | "style" | "logic" | "tests")[];
  customRules: string[]; // User-defined review rules
}

export const defaultAutoReviewConfig: AutoReviewConfig = {
  enabledTriggers: ["opened", "ready_for_review"],
  skipDraftPRs: true,
  skipBots: true,
  maxFilesChanged: 50,
  focusAreas: ["security", "logic", "tests"],
  customRules: [],
};
```

### 3. GitHub Webhook Handler Enhancement

```typescript
// apps/www/src/app/api/webhooks/github/route.ts

webhooks.on("pull_request.opened", handlePRForAutoReview);
webhooks.on("pull_request.synchronize", handlePRForAutoReview);
webhooks.on("pull_request.ready_for_review", handlePRForAutoReview);

async function handlePRForAutoReview(event: PullRequestEvent) {
  const { pull_request, repository, action } = event.payload;

  // Find environment with auto-review enabled
  const environment = await findEnvironmentByRepo(repository.full_name);
  if (!environment?.autoReviewEnabled) return;

  const config = environment.autoReviewConfig || defaultAutoReviewConfig;

  // Check if this trigger is enabled
  if (!config.enabledTriggers.includes(action)) return;

  // Skip conditions
  if (config.skipDraftPRs && pull_request.draft) return;
  if (config.skipBots && pull_request.user.type === "Bot") return;
  if (pull_request.changed_files > config.maxFilesChanged) {
    await postPRComment(
      repository.full_name,
      pull_request.number,
      `⚠️ PR has ${pull_request.changed_files} files changed, exceeding the auto-review limit of ${config.maxFilesChanged}. Skipping automatic review.`,
    );
    return;
  }

  // Create review task
  await createAutoReviewTask({
    userId: environment.userId,
    repoFullName: repository.full_name,
    prNumber: pull_request.number,
    prTitle: pull_request.title,
    prBody: pull_request.body,
    baseBranch: pull_request.base.ref,
    headBranch: pull_request.head.ref,
    config,
  });
}
```

### 4. Review Agent (`apps/www/src/agent/pr-review-agent.ts`)

```typescript
export async function createAutoReviewTask({
  userId,
  repoFullName,
  prNumber,
  prTitle,
  prBody,
  baseBranch,
  headBranch,
  config,
}: AutoReviewArgs) {
  const focusAreasText = config.focusAreas
    .map((area) => {
      switch (area) {
        case "security":
          return "- **Security**: Check for vulnerabilities (OWASP Top 10, injection, XSS, auth issues)";
        case "performance":
          return "- **Performance**: Identify inefficient patterns, N+1 queries, memory leaks";
        case "style":
          return "- **Style**: Verify coding standards, naming conventions, documentation";
        case "logic":
          return "- **Logic**: Review business logic, edge cases, error handling";
        case "tests":
          return "- **Tests**: Assess test coverage, test quality, missing scenarios";
      }
    })
    .join("\n");

  const customRulesText =
    config.customRules.length > 0
      ? `\n\n**Custom Rules to Check:**\n${config.customRules.map((r) => `- ${r}`).join("\n")}`
      : "";

  const prompt = `
## Code Review Request: PR #${prNumber}

**Title:** ${prTitle}
**Base:** ${baseBranch} ← **Head:** ${headBranch}

${prBody ? `**Description:**\n${prBody}\n` : ""}

---

## Your Task: Perform a Comprehensive Code Review

### Focus Areas
${focusAreasText}
${customRulesText}

### Review Format

Provide your review in this exact format:

\`\`\`markdown
## Code Review Summary

**Overall Assessment:** [✅ Approve | ⚠️ Request Changes | ℹ️ Comment Only]

### 📊 Statistics
- Files Reviewed: X
- Issues Found: X (Y critical, Z minor)
- Suggestions: X

### 🔒 Security Analysis
[List any security concerns or "No security issues found"]

### 🐛 Issues Found
[List issues with file:line references]

### 💡 Suggestions
[List improvement suggestions]

### ✅ What's Good
[Positive feedback on well-written code]

### 📝 Summary
[2-3 sentence summary of the review]
\`\`\`

### Instructions

1. Fetch the PR diff using \`gh pr diff ${prNumber}\`
2. Review each file systematically
3. Check the focus areas listed above
4. Post your review as a PR comment when complete
5. If you find critical issues, request changes; otherwise approve or comment

Use this command to post your review:
\`gh pr review ${prNumber} --comment --body "YOUR_REVIEW_HERE"\`

Or to request changes:
\`gh pr review ${prNumber} --request-changes --body "YOUR_REVIEW_HERE"\`

Or to approve:
\`gh pr review ${prNumber} --approve --body "YOUR_REVIEW_HERE"\`
`;

  // Create review thread
  const thread = await createThread({
    userId,
    repoFullName,
    initialMessage: prompt,
    metadata: {
      type: "pr-review",
      prNumber,
      autoTriggered: true,
    },
  });

  // Track in pr_review table
  await db.insert(prReviewTable).values({
    prId: prId, // from githubPR lookup
    threadId: thread.id,
    reviewType: "auto",
    status: "pending",
  });

  return thread;
}
```

### 5. Review Completion Handler

Add to daemon event handler:

```typescript
// apps/www/src/server-lib/handle-daemon-event.ts

// After thread completion, check if it's a PR review
if (thread.metadata?.type === "pr-review" && status === "complete") {
  await updatePRReviewStatus(thread.id, "completed");

  // Extract review summary from messages
  const summary = extractReviewSummary(messages);
  await db
    .update(prReviewTable)
    .set({
      summary: summary.text,
      issuesFound: summary.issuesCount,
      suggestionsCount: summary.suggestionsCount,
      securityIssues: summary.securityCount,
      completedAt: new Date(),
    })
    .where(eq(prReviewTable.threadId, thread.id));
}
```

### 6. Settings UI Component

```typescript
// apps/www/src/components/settings/auto-review-settings.tsx
export function AutoReviewSettings({ environment }: Props) {
  const [config, setConfig] = useState<AutoReviewConfig>(
    environment.autoReviewConfig || defaultAutoReviewConfig
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic PR Reviews</CardTitle>
        <CardDescription>
          Configure automatic code reviews for pull requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Switch
          checked={environment.autoReviewEnabled}
          onCheckedChange={handleToggle}
          label="Enable automatic reviews"
        />

        {environment.autoReviewEnabled && (
          <>
            <MultiSelect
              label="Trigger on"
              options={[
                { value: "opened", label: "PR Opened" },
                { value: "synchronize", label: "New Commits" },
                { value: "ready_for_review", label: "Ready for Review" },
              ]}
              value={config.enabledTriggers}
              onChange={(v) => setConfig({ ...config, enabledTriggers: v })}
            />

            <MultiSelect
              label="Focus Areas"
              options={[
                { value: "security", label: "🔒 Security" },
                { value: "performance", label: "⚡ Performance" },
                { value: "style", label: "📝 Style" },
                { value: "logic", label: "🧠 Logic" },
                { value: "tests", label: "🧪 Tests" },
              ]}
              value={config.focusAreas}
              onChange={(v) => setConfig({ ...config, focusAreas: v })}
            />

            <Textarea
              label="Custom Rules (one per line)"
              value={config.customRules.join("\n")}
              onChange={(e) => setConfig({
                ...config,
                customRules: e.target.value.split("\n").filter(Boolean)
              })}
              placeholder="Check for console.log statements\nVerify error boundaries..."
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

### 7. PR Review History Component

```typescript
// apps/www/src/components/pr/pr-review-history.tsx
export function PRReviewHistory({ prId }: Props) {
  const reviews = usePRReviews(prId);

  return (
    <div className="space-y-4">
      <h3>Review History</h3>
      {reviews.map(review => (
        <Card key={review.id}>
          <div className="flex justify-between">
            <Badge variant={review.status === "completed" ? "success" : "pending"}>
              {review.reviewType === "auto" ? "🤖 Auto" : "👤 Manual"}
            </Badge>
            <span>{formatRelativeTime(review.createdAt)}</span>
          </div>
          {review.summary && (
            <p className="text-sm text-muted-foreground">{review.summary}</p>
          )}
          <div className="flex gap-4 text-xs">
            <span>Issues: {review.issuesFound}</span>
            <span>Suggestions: {review.suggestionsCount}</span>
            {review.securityIssues > 0 && (
              <span className="text-red-500">Security: {review.securityIssues}</span>
            )}
          </div>
          <Link href={`/thread/${review.threadId}`}>View Details →</Link>
        </Card>
      ))}
    </div>
  );
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe("PR Auto Review", () => {
  it("triggers review on PR opened", async () => {
    const event = mockPROpenedEvent();
    await handlePRForAutoReview(event);

    const review = await db.query.prReviewTable.findFirst();
    expect(review).toBeDefined();
    expect(review.status).toBe("pending");
  });

  it("skips draft PRs when configured", async () => {
    const event = mockPROpenedEvent({ draft: true });
    await handlePRForAutoReview(event);

    const review = await db.query.prReviewTable.findFirst();
    expect(review).toBeUndefined();
  });

  it("skips large PRs", async () => {
    const event = mockPROpenedEvent({ changed_files: 100 });
    await handlePRForAutoReview(event);

    const review = await db.query.prReviewTable.findFirst();
    expect(review).toBeUndefined();
  });

  it("extracts review summary from completion", async () => {
    const messages = mockReviewMessages();
    const summary = extractReviewSummary(messages);

    expect(summary.issuesCount).toBeGreaterThan(0);
    expect(summary.text).toContain("Code Review Summary");
  });
});
```

### Integration Tests

- Full webhook → review → comment flow
- Review cancellation on PR close
- Re-review on force push

---

## Security Considerations

- Rate limit reviews per repo (max 10/hour)
- Don't expose private code in review comments
- Validate PR belongs to authorized installation
- Sanitize review output before posting
