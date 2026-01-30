/**
 * PR Auto-Review Handler
 *
 * Handles automatic code review for pull requests when enabled.
 */

import { db } from "@/lib/db";
import { createNewThread } from "./new-thread-shared";
import {
  getEnvironmentsWithAutoReview,
  createPRReview,
  updatePRReviewStatus,
  getPRReviewByThread,
} from "@dragon/shared/model/pr-review";
import {
  type AutoReviewConfig,
  defaultAutoReviewConfig,
  extractReviewSummary,
} from "@dragon/shared/model/auto-review";
import { parseRepoFullName, getOctokitForApp } from "@/lib/github";
import { DBUserMessage } from "@dragon/shared";
import type { PullRequestEvent } from "@/app/api/webhooks/github/handlers";

export interface CreateAutoReviewTaskArgs {
  userId: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  baseBranch: string;
  headBranch: string;
  config: AutoReviewConfig;
}

function buildReviewPrompt({
  prNumber,
  prTitle,
  prBody,
  baseBranch,
  headBranch,
  config,
}: Omit<CreateAutoReviewTaskArgs, "userId" | "repoFullName">): string {
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
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");

  const customRulesText =
    config.customRules.length > 0
      ? `\n\n**Custom Rules to Check:**\n${config.customRules.map((r) => `- ${r}`).join("\n")}`
      : "";

  return `## Code Review Request: PR #${prNumber}

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
}

export async function createAutoReviewTask({
  userId,
  repoFullName,
  prNumber,
  prTitle,
  prBody,
  baseBranch,
  headBranch,
  config,
}: CreateAutoReviewTaskArgs): Promise<{
  threadId: string;
  reviewId: string;
} | null> {
  try {
    const prompt = buildReviewPrompt({
      prNumber,
      prTitle,
      prBody,
      baseBranch,
      headBranch,
      config,
    });

    const message: DBUserMessage = {
      type: "user",
      model: null,
      parts: [
        {
          type: "text",
          text: prompt,
        },
      ],
    };

    // Create the review thread
    const { threadId } = await createNewThread({
      userId,
      message,
      githubRepoFullName: repoFullName,
      baseBranchName: baseBranch,
      headBranchName: headBranch,
      githubPRNumber: prNumber,
      sourceType: "automation",
    });

    // Create PR review record
    const review = await createPRReview({
      db,
      userId,
      repoFullName,
      prNumber,
      threadId,
      reviewType: "auto",
    });

    if (!review) {
      throw new Error("Failed to create PR review record");
    }

    console.log(
      `Created auto-review task for PR #${prNumber} in ${repoFullName}: thread=${threadId}, review=${review.id}`,
    );

    return { threadId, reviewId: review.id };
  } catch (error) {
    console.error(
      `Failed to create auto-review task for PR #${prNumber} in ${repoFullName}:`,
      error,
    );
    return null;
  }
}

export async function handlePRForAutoReview(
  event: PullRequestEvent,
): Promise<void> {
  const { pull_request, repository, action } = event;
  const repoFullName = repository.full_name;

  console.log(
    `Checking auto-review for PR #${pull_request.number} in ${repoFullName} (action: ${action})`,
  );

  // Find all environments with auto-review enabled for this repo
  const environments = await getEnvironmentsWithAutoReview({
    db,
    repoFullName,
  });

  if (environments.length === 0) {
    console.log(`No auto-review environments found for ${repoFullName}`);
    return;
  }

  for (const env of environments) {
    const config: AutoReviewConfig =
      (env.autoReviewConfig as AutoReviewConfig) || defaultAutoReviewConfig;

    // Check if this trigger is enabled
    const triggerAction = action as
      | "opened"
      | "synchronize"
      | "ready_for_review";
    if (!config.enabledTriggers.includes(triggerAction)) {
      console.log(
        `Auto-review for user ${env.userId} not triggered on ${action}`,
      );
      continue;
    }

    // Skip conditions
    if (config.skipDraftPRs && pull_request.draft) {
      console.log(
        `Skipping auto-review for draft PR #${pull_request.number} in ${repoFullName}`,
      );
      continue;
    }

    if (config.skipBots && pull_request.user?.type === "Bot") {
      console.log(
        `Skipping auto-review for bot PR #${pull_request.number} in ${repoFullName}`,
      );
      continue;
    }

    const changedFilesCount = pull_request.changed_files ?? 0;
    if (changedFilesCount > config.maxFilesChanged) {
      console.log(
        `PR #${pull_request.number} has ${changedFilesCount} files, exceeding limit of ${config.maxFilesChanged}`,
      );

      // Post a comment explaining why review was skipped
      try {
        const [owner, repo] = parseRepoFullName(repoFullName);
        const octokit = await getOctokitForApp({ owner, repo });
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pull_request.number,
          body: `⚠️ This PR has ${changedFilesCount} files changed, exceeding the auto-review limit of ${config.maxFilesChanged}. Skipping automatic review.`,
        });
      } catch (commentError) {
        console.error("Failed to post skip comment:", commentError);
      }
      continue;
    }

    // Create review task
    await createAutoReviewTask({
      userId: env.userId,
      repoFullName,
      prNumber: pull_request.number,
      prTitle: pull_request.title,
      prBody: pull_request.body,
      baseBranch: pull_request.base.ref,
      headBranch: pull_request.head.ref,
      config,
    });
  }
}

/**
 * Handle PR review completion - extract summary and update review record
 */
export async function handlePRReviewCompletion(
  threadId: string,
  messages: unknown[],
): Promise<void> {
  const review = await getPRReviewByThread({ db, threadId });

  if (!review) {
    return;
  }

  try {
    const summary = extractReviewSummary(messages);
    await updatePRReviewStatus({
      db,
      reviewId: review.id,
      status: "completed",
      summary,
    });

    console.log(
      `Updated PR review ${review.id} with summary: ${summary.overallAssessment}, issues: ${summary.issuesCount}`,
    );
  } catch (error) {
    console.error(`Failed to update PR review ${review.id}:`, error);
    await updatePRReviewStatus({
      db,
      reviewId: review.id,
      status: "failed",
    });
  }
}
