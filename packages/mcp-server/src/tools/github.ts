/**
 * GitHub Tools
 *
 * These tools allow AI agents to interact with GitHub
 * for repository management, pull requests, and issues.
 */

import type { ToolDefinition } from "../types/index.js";

export const githubTools: ToolDefinition[] = [
  {
    name: "CreatePullRequest",
    description: `Create a GitHub Pull Request.

Use this when:
- Submitting code changes for review
- Proposing feature additions
- Submitting bug fixes

IMPORTANT: Ensure the head branch exists and has commits not in base.

Returns: prNumber, url, and status`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (user or organization)",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        title: {
          type: "string",
          description: "PR title (concise, descriptive)",
        },
        body: {
          type: "string",
          description: "PR description (markdown supported)",
        },
        head: {
          type: "string",
          description: "Source branch containing changes",
        },
        base: {
          type: "string",
          description: "Target branch to merge into. Default: main",
        },
        draft: {
          type: "boolean",
          description: "Create as draft PR. Default: false",
        },
        maintainerCanModify: {
          type: "boolean",
          description:
            "Allow maintainers to push to head branch. Default: true",
        },
      },
      required: ["owner", "repo", "title", "head"],
    },
  },
  {
    name: "GetPullRequest",
    description: `Get details of a Pull Request.

Use this when:
- Checking PR status and reviews
- Getting file changes
- Reading PR comments

Returns: title, body, status, reviews, files changed, and merge status`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        prNumber: {
          type: "number",
          description: "Pull request number",
        },
        includeFiles: {
          type: "boolean",
          description: "Include list of changed files. Default: true",
        },
        includeReviews: {
          type: "boolean",
          description: "Include review comments. Default: true",
        },
      },
      required: ["owner", "repo", "prNumber"],
    },
  },
  {
    name: "ListPullRequests",
    description: `List Pull Requests for a repository.

Use this when:
- Finding PRs to review
- Checking open PRs
- Monitoring PR activity

Returns: array of PRs with number, title, author, status, and timestamps`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        state: {
          type: "string",
          enum: ["open", "closed", "all"],
          description: "Filter by state. Default: 'open'",
        },
        head: {
          type: "string",
          description: "Filter by head branch (format: 'user:branch')",
        },
        base: {
          type: "string",
          description: "Filter by base branch",
        },
        sort: {
          type: "string",
          enum: ["created", "updated", "popularity", "long-running"],
          description: "Sort order. Default: 'created'",
        },
        direction: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction. Default: 'desc'",
        },
        limit: {
          type: "number",
          description: "Maximum PRs to return. Default: 30",
        },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "MergePullRequest",
    description: `Merge a Pull Request.

Use this when:
- PR has been approved and is ready
- All checks have passed
- Merging approved changes

IMPORTANT: Requires appropriate permissions.

Returns: merged status, sha, and message`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        prNumber: {
          type: "number",
          description: "Pull request number",
        },
        commitTitle: {
          type: "string",
          description: "Custom merge commit title",
        },
        commitMessage: {
          type: "string",
          description: "Custom merge commit message",
        },
        mergeMethod: {
          type: "string",
          enum: ["merge", "squash", "rebase"],
          description: "Merge method. Default: 'merge'",
        },
        sha: {
          type: "string",
          description: "Expected HEAD SHA for safety (optional)",
        },
      },
      required: ["owner", "repo", "prNumber"],
    },
  },
  {
    name: "CreateIssue",
    description: `Create a GitHub Issue.

Use this when:
- Reporting bugs
- Requesting features
- Creating tasks

Returns: issueNumber, url, and status`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        title: {
          type: "string",
          description: "Issue title",
        },
        body: {
          type: "string",
          description: "Issue description (markdown supported)",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Labels to apply (must exist in repo)",
        },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "GitHub usernames to assign",
        },
        milestone: {
          type: "number",
          description: "Milestone number to associate",
        },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    name: "GetIssue",
    description: `Get details of a GitHub Issue.

Returns: title, body, status, labels, assignees, and comments`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        issueNumber: {
          type: "number",
          description: "Issue number",
        },
        includeComments: {
          type: "boolean",
          description: "Include issue comments. Default: true",
        },
      },
      required: ["owner", "repo", "issueNumber"],
    },
  },
  {
    name: "ListIssues",
    description: `List issues for a repository.

Returns: array of issues with number, title, labels, assignees, and timestamps`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        state: {
          type: "string",
          enum: ["open", "closed", "all"],
          description: "Filter by state. Default: 'open'",
        },
        labels: {
          type: "string",
          description: "Comma-separated list of labels to filter by",
        },
        assignee: {
          type: "string",
          description:
            "Filter by assignee username. Use '*' for any, 'none' for unassigned.",
        },
        sort: {
          type: "string",
          enum: ["created", "updated", "comments"],
          description: "Sort order. Default: 'created'",
        },
        direction: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction. Default: 'desc'",
        },
        limit: {
          type: "number",
          description: "Maximum issues to return. Default: 30",
        },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "CreateComment",
    description: `Add a comment to an issue or pull request.

Use this when:
- Providing feedback
- Asking questions
- Adding notes

Returns: commentId and url`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        issueNumber: {
          type: "number",
          description: "Issue or PR number",
        },
        body: {
          type: "string",
          description: "Comment body (markdown supported)",
        },
      },
      required: ["owner", "repo", "issueNumber", "body"],
    },
  },
  {
    name: "GetRepository",
    description: `Get repository information.

Returns: name, description, stars, forks, default branch, and topics`,
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
      },
      required: ["owner", "repo"],
    },
  },
];

export const githubToolNames = githubTools.map((t) => t.name);
