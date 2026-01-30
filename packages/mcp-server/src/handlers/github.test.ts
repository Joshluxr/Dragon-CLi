/**
 * GitHub Handler Tests
 */

import { describe, it, expect } from "vitest";
import { handleGithubTool } from "./github.js";

describe("GitHub Handler", () => {
  const testOwner = "test-org";
  const testRepo = "test-repo";

  describe("CreatePullRequest", () => {
    it("should create a pull request", async () => {
      const result = await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        title: "Add new feature",
        head: "feature-branch",
        base: "main",
        body: "This PR adds a new feature",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.prNumber).toBeDefined();
      expect(content.title).toBe("Add new feature");
      expect(content.head).toBe("feature-branch");
      expect(content.base).toBe("main");
      expect(content.state).toBe("open");
      expect(content.url).toContain("github.com");
    });

    it("should create a draft PR", async () => {
      const result = await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        title: "WIP: Draft feature",
        head: "draft-branch",
        base: "main",
        draft: true,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.draft).toBe(true);
    });

    it("should reject missing required fields", async () => {
      const result = await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        // Missing title, head, base
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("required");
    });
  });

  describe("GetPullRequest", () => {
    it("should get pull request details", async () => {
      // First create a PR
      const createResult = await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        title: "Test PR for get",
        head: "test-get-branch",
        base: "main",
      });
      const { prNumber } = JSON.parse(createResult.content[0].text);

      const result = await handleGithubTool("GetPullRequest", {
        owner: testOwner,
        repo: testRepo,
        prNumber: prNumber,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      // For existing PRs, the Map stores 'number', not 'prNumber'
      expect(content.number).toBe(prNumber);
      expect(content.owner).toBe(testOwner);
      expect(content.repo).toBe(testRepo);
    });
  });

  describe("ListPullRequests", () => {
    it("should list pull requests", async () => {
      const result = await handleGithubTool("ListPullRequests", {
        owner: testOwner,
        repo: testRepo,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.pullRequests).toBeDefined();
      expect(Array.isArray(content.pullRequests)).toBe(true);
    });

    it("should filter by state", async () => {
      // Create an open PR
      await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        title: "Filter test PR",
        head: "filter-test-branch",
        base: "main",
      });

      const result = await handleGithubTool("ListPullRequests", {
        owner: testOwner,
        repo: testRepo,
        state: "open",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(
        content.pullRequests.every(
          (pr: { state: string }) => pr.state === "open",
        ),
      ).toBe(true);
    });

    it("should filter by base branch", async () => {
      const result = await handleGithubTool("ListPullRequests", {
        owner: testOwner,
        repo: testRepo,
        base: "develop",
      });
      expect(result.isError).toBeUndefined();
    });

    it("should respect per_page limit", async () => {
      const result = await handleGithubTool("ListPullRequests", {
        owner: testOwner,
        repo: testRepo,
        per_page: 5,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.pullRequests.length).toBeLessThanOrEqual(5);
    });
  });

  describe("MergePullRequest", () => {
    it("should merge a pull request", async () => {
      // First create a PR
      const createResult = await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        title: "Test PR for merge",
        head: "test-merge-branch",
        base: "main",
      });
      const { prNumber } = JSON.parse(createResult.content[0].text);

      const result = await handleGithubTool("MergePullRequest", {
        owner: testOwner,
        repo: testRepo,
        prNumber: prNumber,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.merged).toBe(true);
      expect(content.sha).toBeDefined();
    });

    it("should support different merge methods", async () => {
      const createResult = await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        title: "Test PR for squash",
        head: "test-squash-branch",
        base: "main",
      });
      const { prNumber } = JSON.parse(createResult.content[0].text);

      const result = await handleGithubTool("MergePullRequest", {
        owner: testOwner,
        repo: testRepo,
        prNumber: prNumber,
        mergeMethod: "squash",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.merged).toBe(true);
    });

    it("should accept custom commit message", async () => {
      const createResult = await handleGithubTool("CreatePullRequest", {
        owner: testOwner,
        repo: testRepo,
        title: "Test PR for custom message",
        head: "test-custom-msg-branch",
        base: "main",
      });
      const { prNumber } = JSON.parse(createResult.content[0].text);

      const result = await handleGithubTool("MergePullRequest", {
        owner: testOwner,
        repo: testRepo,
        prNumber: prNumber,
        commitTitle: "feat: Add new feature (#3)",
        commitMessage: "Merged with custom message",
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("CreateIssue", () => {
    it("should create an issue", async () => {
      const result = await handleGithubTool("CreateIssue", {
        owner: testOwner,
        repo: testRepo,
        title: "Bug: Something is broken",
        body: "Description of the bug",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.issueNumber).toBeDefined();
      expect(content.title).toBe("Bug: Something is broken");
      expect(content.state).toBe("open");
      expect(content.url).toContain("github.com");
    });

    it("should create issue with labels", async () => {
      const result = await handleGithubTool("CreateIssue", {
        owner: testOwner,
        repo: testRepo,
        title: "Feature request",
        labels: ["enhancement", "help wanted"],
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.labels).toContain("enhancement");
      expect(content.labels).toContain("help wanted");
    });

    it("should create issue with assignees", async () => {
      const result = await handleGithubTool("CreateIssue", {
        owner: testOwner,
        repo: testRepo,
        title: "Assigned issue",
        assignees: ["user1", "user2"],
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.assignees).toBeDefined();
    });

    it("should reject missing title", async () => {
      const result = await handleGithubTool("CreateIssue", {
        owner: testOwner,
        repo: testRepo,
        // Missing title
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("required");
    });
  });

  describe("GetIssue", () => {
    it("should get issue details", async () => {
      // First create an issue
      const createResult = await handleGithubTool("CreateIssue", {
        owner: testOwner,
        repo: testRepo,
        title: "Test issue for get",
      });
      const { issueNumber } = JSON.parse(createResult.content[0].text);

      const result = await handleGithubTool("GetIssue", {
        owner: testOwner,
        repo: testRepo,
        issueNumber: issueNumber,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      // For existing issues, the Map stores 'number', not 'issueNumber'
      expect(content.number).toBe(issueNumber);
      expect(content.owner).toBe(testOwner);
      expect(content.repo).toBe(testRepo);
    });
  });

  describe("ListIssues", () => {
    it("should list issues", async () => {
      const result = await handleGithubTool("ListIssues", {
        owner: testOwner,
        repo: testRepo,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.issues).toBeDefined();
      expect(Array.isArray(content.issues)).toBe(true);
    });

    it("should filter by state", async () => {
      // Create an open issue
      await handleGithubTool("CreateIssue", {
        owner: testOwner,
        repo: testRepo,
        title: "Open issue for filter test",
      });

      const result = await handleGithubTool("ListIssues", {
        owner: testOwner,
        repo: testRepo,
        state: "open",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(
        content.issues.every(
          (issue: { state: string }) => issue.state === "open",
        ),
      ).toBe(true);
    });

    it("should filter by labels", async () => {
      const result = await handleGithubTool("ListIssues", {
        owner: testOwner,
        repo: testRepo,
        labels: "bug",
      });
      expect(result.isError).toBeUndefined();
    });

    it("should sort by created date", async () => {
      const result = await handleGithubTool("ListIssues", {
        owner: testOwner,
        repo: testRepo,
        sort: "created",
        direction: "asc",
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("CreateComment", () => {
    it("should create a comment on an issue", async () => {
      // First create an issue
      const createResult = await handleGithubTool("CreateIssue", {
        owner: testOwner,
        repo: testRepo,
        title: "Issue for comment test",
      });
      const { issueNumber } = JSON.parse(createResult.content[0].text);

      const result = await handleGithubTool("CreateComment", {
        owner: testOwner,
        repo: testRepo,
        issueNumber: issueNumber,
        body: "This is a comment",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.commentId).toBeDefined();
      expect(content.body).toBe("This is a comment");
      expect(content.url).toContain("github.com");
    });

    it("should reject empty comment body", async () => {
      const result = await handleGithubTool("CreateComment", {
        owner: testOwner,
        repo: testRepo,
        issueNumber: 1,
        body: "",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("required");
    });
  });

  describe("GetRepository", () => {
    it("should get repository details", async () => {
      const result = await handleGithubTool("GetRepository", {
        owner: testOwner,
        repo: testRepo,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.owner).toBe(testOwner);
      expect(content.name).toBe(testRepo);
      expect(content.fullName).toBe(`${testOwner}/${testRepo}`);
      expect(content.url).toContain("github.com");
    });
  });

  describe("Unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await handleGithubTool("UnknownTool", {});
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Unknown GitHub tool");
    });
  });
});
