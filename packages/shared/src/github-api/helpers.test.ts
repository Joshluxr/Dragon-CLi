import { describe, expect, it } from "vitest";
import { getGithubPRStatus } from "./helpers";

describe("getGithubPRStatus", () => {
  it("should return 'open' for open non-draft PR", () => {
    const pr = {
      draft: false,
      closed_at: null,
      merged_at: null,
    };
    expect(getGithubPRStatus(pr)).toBe("open");
  });

  it("should return 'draft' for open draft PR", () => {
    const pr = {
      draft: true,
      closed_at: null,
      merged_at: null,
    };
    expect(getGithubPRStatus(pr)).toBe("draft");
  });

  it("should return 'merged' for merged PR", () => {
    const pr = {
      draft: false,
      closed_at: "2024-01-01T00:00:00Z",
      merged_at: "2024-01-01T00:00:00Z",
    };
    expect(getGithubPRStatus(pr)).toBe("merged");
  });

  it("should return 'closed' for closed non-draft PR", () => {
    const pr = {
      draft: false,
      closed_at: "2024-01-01T00:00:00Z",
      merged_at: null,
    };
    expect(getGithubPRStatus(pr)).toBe("closed");
  });

  it("should return 'closed' for closed draft PR (not 'draft')", () => {
    const pr = {
      draft: true,
      closed_at: "2024-01-01T00:00:00Z",
      merged_at: null,
    };
    expect(getGithubPRStatus(pr)).toBe("closed");
  });

  it("should return 'merged' for merged draft PR (not 'draft')", () => {
    const pr = {
      draft: true,
      closed_at: "2024-01-01T00:00:00Z",
      merged_at: "2024-01-01T00:00:00Z",
    };
    expect(getGithubPRStatus(pr)).toBe("merged");
  });
});
