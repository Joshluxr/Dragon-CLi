/**
 * GitHub Handler
 *
 * Handles GitHub-related MCP tool calls for repository management,
 * pull requests, issues, and other GitHub operations.
 */

import type {
  ToolResult,
  CreatePullRequestArgs,
  GetPullRequestArgs,
  ListPullRequestsArgs,
  CreateIssueArgs,
} from "../types/index.js";

// Simulated GitHub state for standalone mode
const pullRequests = new Map<
  string,
  {
    number: number;
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    state: "open" | "closed" | "merged";
    draft: boolean;
    createdAt: Date;
    updatedAt: Date;
    user: string;
  }
>();

const issues = new Map<
  string,
  {
    number: number;
    owner: string;
    repo: string;
    title: string;
    body: string;
    state: "open" | "closed";
    labels: string[];
    assignees: string[];
    createdAt: Date;
    updatedAt: Date;
    user: string;
  }
>();

let prCounter = 1;
let issueCounter = 1;

/**
 * Get PR key
 */
function getPrKey(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`;
}

/**
 * Get issue key
 */
function getIssueKey(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`;
}

/**
 * Create a pull request
 */
export async function handleCreatePullRequest(
  args: CreatePullRequestArgs,
): Promise<ToolResult> {
  const {
    owner,
    repo,
    title,
    body = "",
    head,
    base = "main",
    draft = false,
    // maintainerCanModify available for production use
  } = args as unknown as CreatePullRequestArgs & {
    maintainerCanModify?: boolean;
  };

  // Validate required fields
  if (!title || title.trim().length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "PR title is required and cannot be empty.",
          }),
        },
      ],
      isError: true,
    };
  }

  if (!head) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Source branch (head) is required.",
          }),
        },
      ],
      isError: true,
    };
  }

  const prNumber = prCounter++;
  const now = new Date();

  // Store PR
  const prKey = getPrKey(owner, repo, prNumber);
  pullRequests.set(prKey, {
    number: prNumber,
    owner,
    repo,
    title,
    body,
    head,
    base,
    state: "open",
    draft,
    createdAt: now,
    updatedAt: now,
    user: "dragon-bot",
  });

  // In production:
  // const octokit = await getOctokit();
  // const { data } = await octokit.pulls.create({ owner, repo, title, body, head, base, draft });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          prNumber,
          url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          title,
          head,
          base,
          state: "open",
          draft,
          message: `Pull request #${prNumber} created successfully.`,
        }),
      },
    ],
  };
}

/**
 * Get pull request details
 */
export async function handleGetPullRequest(
  args: GetPullRequestArgs,
): Promise<ToolResult> {
  const {
    owner,
    repo,
    prNumber,
    includeFiles = true,
    includeReviews = true,
  } = args as unknown as GetPullRequestArgs & {
    includeFiles?: boolean;
    includeReviews?: boolean;
  };

  const prKey = getPrKey(owner, repo, prNumber);
  const pr = pullRequests.get(prKey);

  if (!pr) {
    // Return simulated data for real GitHub PRs
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            prNumber,
            owner,
            repo,
            title: `PR #${prNumber}`,
            body: "This is a simulated PR response. In production, this would fetch from GitHub API.",
            head: "feature-branch",
            base: "main",
            state: "open",
            draft: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            user: "github-user",
            mergeable: true,
            reviews: includeReviews
              ? [
                  {
                    user: "reviewer",
                    state: "approved",
                    body: "LGTM!",
                  },
                ]
              : undefined,
            files: includeFiles
              ? [
                  {
                    filename: "src/index.ts",
                    status: "modified",
                    additions: 10,
                    deletions: 2,
                  },
                  {
                    filename: "src/utils.ts",
                    status: "added",
                    additions: 50,
                    deletions: 0,
                  },
                ]
              : undefined,
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ...pr,
          url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          createdAt: pr.createdAt.toISOString(),
          updatedAt: pr.updatedAt.toISOString(),
          mergeable: true,
          reviews: includeReviews ? [] : undefined,
          files: includeFiles
            ? [
                {
                  filename: "src/index.ts",
                  status: "modified",
                  additions: 10,
                  deletions: 2,
                },
              ]
            : undefined,
        }),
      },
    ],
  };
}

/**
 * List pull requests
 */
export async function handleListPullRequests(
  args: ListPullRequestsArgs,
): Promise<ToolResult> {
  const { owner, repo, state = "open", limit = 30 } = args;

  // Filter PRs
  let prs = Array.from(pullRequests.values())
    .filter((pr) => pr.owner === owner && pr.repo === repo)
    .filter((pr) => state === "all" || pr.state === state);

  // Sort by creation date (newest first)
  prs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Limit
  prs = prs.slice(0, limit);

  // If no local PRs, return simulated data
  if (prs.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            owner,
            repo,
            state,
            count: 2,
            pullRequests: [
              {
                number: 123,
                title: "Add new feature",
                state: "open",
                user: "contributor",
                head: "feature-branch",
                base: "main",
                createdAt: new Date().toISOString(),
              },
              {
                number: 122,
                title: "Fix bug in handler",
                state: "open",
                user: "developer",
                head: "bugfix-branch",
                base: "main",
                createdAt: new Date(Date.now() - 86400000).toISOString(),
              },
            ],
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          owner,
          repo,
          state,
          count: prs.length,
          pullRequests: prs.map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            draft: pr.draft,
            user: pr.user,
            head: pr.head,
            base: pr.base,
            createdAt: pr.createdAt.toISOString(),
            updatedAt: pr.updatedAt.toISOString(),
          })),
        }),
      },
    ],
  };
}

/**
 * Merge pull request
 */
export async function handleMergePullRequest(args: {
  owner: string;
  repo: string;
  prNumber: number;
  commitTitle?: string;
  commitMessage?: string;
  mergeMethod?: "merge" | "squash" | "rebase";
  sha?: string;
}): Promise<ToolResult> {
  const {
    owner,
    repo,
    prNumber,
    commitTitle,
    // commitMessage available for production use
    mergeMethod = "merge",
  } = args;

  const prKey = getPrKey(owner, repo, prNumber);
  const pr = pullRequests.get(prKey);

  if (pr) {
    if (pr.state !== "open") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Cannot merge PR with state: ${pr.state}`,
            }),
          },
        ],
        isError: true,
      };
    }

    pr.state = "merged";
    pr.updatedAt = new Date();
  }

  // In production:
  // await octokit.pulls.merge({ owner, repo, pull_number: prNumber, ... });

  const sha = `abc${Math.random().toString(36).substring(2, 8)}`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          merged: true,
          sha,
          prNumber,
          mergeMethod,
          message: commitTitle || `Merge pull request #${prNumber}`,
        }),
      },
    ],
  };
}

/**
 * Create an issue
 */
export async function handleCreateIssue(
  args: CreateIssueArgs,
): Promise<ToolResult> {
  const { owner, repo, title, body = "", labels = [], assignees = [] } = args;

  if (!title || title.trim().length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Issue title is required and cannot be empty.",
          }),
        },
      ],
      isError: true,
    };
  }

  const issueNumber = issueCounter++;
  const now = new Date();

  // Store issue
  const issueKey = getIssueKey(owner, repo, issueNumber);
  issues.set(issueKey, {
    number: issueNumber,
    owner,
    repo,
    title,
    body,
    state: "open",
    labels,
    assignees,
    createdAt: now,
    updatedAt: now,
    user: "dragon-bot",
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          issueNumber,
          url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
          title,
          state: "open",
          labels,
          assignees,
          message: `Issue #${issueNumber} created successfully.`,
        }),
      },
    ],
  };
}

/**
 * Get issue details
 */
export async function handleGetIssue(args: {
  owner: string;
  repo: string;
  issueNumber: number;
  includeComments?: boolean;
}): Promise<ToolResult> {
  const { owner, repo, issueNumber, includeComments = true } = args;

  const issueKey = getIssueKey(owner, repo, issueNumber);
  const issue = issues.get(issueKey);

  if (!issue) {
    // Simulated response
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            issueNumber,
            owner,
            repo,
            title: `Issue #${issueNumber}`,
            body: "This is a simulated issue response.",
            state: "open",
            labels: ["bug"],
            assignees: [],
            createdAt: new Date().toISOString(),
            user: "github-user",
            comments: includeComments
              ? [
                  {
                    user: "maintainer",
                    body: "Looking into this.",
                    createdAt: new Date().toISOString(),
                  },
                ]
              : undefined,
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ...issue,
          url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
          createdAt: issue.createdAt.toISOString(),
          updatedAt: issue.updatedAt.toISOString(),
          comments: includeComments ? [] : undefined,
        }),
      },
    ],
  };
}

/**
 * List issues
 */
export async function handleListIssues(args: {
  owner: string;
  repo: string;
  state?: string;
  labels?: string;
  assignee?: string;
  limit?: number;
}): Promise<ToolResult> {
  const { owner, repo, state = "open", labels, assignee, limit = 30 } = args;

  let filteredIssues = Array.from(issues.values())
    .filter((i) => i.owner === owner && i.repo === repo)
    .filter((i) => state === "all" || i.state === state);

  if (labels) {
    const labelList = labels.split(",").map((l) => l.trim());
    filteredIssues = filteredIssues.filter((i) =>
      labelList.some((label) => i.labels.includes(label)),
    );
  }

  if (assignee && assignee !== "*") {
    if (assignee === "none") {
      filteredIssues = filteredIssues.filter((i) => i.assignees.length === 0);
    } else {
      filteredIssues = filteredIssues.filter((i) =>
        i.assignees.includes(assignee),
      );
    }
  }

  filteredIssues.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  filteredIssues = filteredIssues.slice(0, limit);

  // If no local issues, return simulated data
  if (filteredIssues.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            owner,
            repo,
            state,
            count: 2,
            issues: [
              {
                number: 45,
                title: "Bug: Login not working",
                state: "open",
                labels: ["bug", "high-priority"],
                user: "reporter",
                createdAt: new Date().toISOString(),
              },
              {
                number: 44,
                title: "Feature: Add dark mode",
                state: "open",
                labels: ["enhancement"],
                user: "contributor",
                createdAt: new Date(Date.now() - 86400000).toISOString(),
              },
            ],
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          owner,
          repo,
          state,
          count: filteredIssues.length,
          issues: filteredIssues.map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            labels: i.labels,
            assignees: i.assignees,
            user: i.user,
            createdAt: i.createdAt.toISOString(),
          })),
        }),
      },
    ],
  };
}

/**
 * Create comment on issue or PR
 */
export async function handleCreateComment(args: {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}): Promise<ToolResult> {
  const { owner, repo, issueNumber, body } = args;

  if (!body || body.trim().length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Comment body is required and cannot be empty.",
          }),
        },
      ],
      isError: true,
    };
  }

  const commentId = Math.floor(Math.random() * 1000000);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          commentId,
          url: `https://github.com/${owner}/${repo}/issues/${issueNumber}#issuecomment-${commentId}`,
          issueNumber,
          body: body.substring(0, 100) + (body.length > 100 ? "..." : ""),
          message: "Comment created successfully.",
        }),
      },
    ],
  };
}

/**
 * Get repository info
 */
export async function handleGetRepository(args: {
  owner: string;
  repo: string;
}): Promise<ToolResult> {
  const { owner, repo } = args;

  // Simulated response
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          owner,
          name: repo,
          fullName: `${owner}/${repo}`,
          description: "A sample repository description",
          defaultBranch: "main",
          private: false,
          stars: 150,
          forks: 25,
          openIssues: 12,
          topics: ["typescript", "nodejs", "api"],
          language: "TypeScript",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: new Date().toISOString(),
          url: `https://github.com/${owner}/${repo}`,
        }),
      },
    ],
  };
}

/**
 * Route GitHub tool calls
 */
export async function handleGithubTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "CreatePullRequest":
      return handleCreatePullRequest(args as unknown as CreatePullRequestArgs);
    case "GetPullRequest":
      return handleGetPullRequest(args as unknown as GetPullRequestArgs);
    case "ListPullRequests":
      return handleListPullRequests(args as unknown as ListPullRequestsArgs);
    case "MergePullRequest":
      return handleMergePullRequest(
        args as {
          owner: string;
          repo: string;
          prNumber: number;
          commitTitle?: string;
          commitMessage?: string;
          mergeMethod?: "merge" | "squash" | "rebase";
          sha?: string;
        },
      );
    case "CreateIssue":
      return handleCreateIssue(args as unknown as CreateIssueArgs);
    case "GetIssue":
      return handleGetIssue(
        args as {
          owner: string;
          repo: string;
          issueNumber: number;
          includeComments?: boolean;
        },
      );
    case "ListIssues":
      return handleListIssues(
        args as {
          owner: string;
          repo: string;
          state?: string;
          labels?: string;
          assignee?: string;
          limit?: number;
        },
      );
    case "CreateComment":
      return handleCreateComment(
        args as {
          owner: string;
          repo: string;
          issueNumber: number;
          body: string;
        },
      );
    case "GetRepository":
      return handleGetRepository(args as { owner: string; repo: string });
    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown GitHub tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
}
