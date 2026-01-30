import { describe, it, expect } from "vitest";
import { parseGitShortstat } from "./git-diff-stats";

describe("parseGitShortstat", () => {
  it("should parse typical output with files, insertions, and deletions", () => {
    const output = " 2 files changed, 10 insertions(+), 3 deletions(-)";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 2,
      additions: 10,
      deletions: 3,
    });
  });

  it("should parse output with only insertions", () => {
    const output = " 5 files changed, 25 insertions(+)";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 5,
      additions: 25,
      deletions: 0,
    });
  });

  it("should parse output with only deletions", () => {
    const output = " 3 files changed, 15 deletions(-)";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 3,
      additions: 0,
      deletions: 15,
    });
  });

  it("should handle singular file", () => {
    const output = " 1 file changed, 1 insertion(+), 1 deletion(-)";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 1,
      additions: 1,
      deletions: 1,
    });
  });

  it("should handle empty output (no changes)", () => {
    const output = "";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it("should handle whitespace-only output", () => {
    const output = "   \n  \t  ";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it("should handle large numbers", () => {
    const output =
      " 1234 files changed, 56789 insertions(+), 9876 deletions(-)";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 1234,
      additions: 56789,
      deletions: 9876,
    });
  });

  it("should handle output with extra whitespace", () => {
    const output =
      "   5 files changed,   10 insertions(+),   2 deletions(-)   ";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 5,
      additions: 10,
      deletions: 2,
    });
  });

  it("should return zeros for malformed output", () => {
    const output = "This is not valid git diff --shortstat output";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it("should handle binary file changes", () => {
    // Git sometimes reports binary file changes differently
    const output = " 1 file changed, 0 insertions(+), 0 deletions(-)";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 1,
      additions: 0,
      deletions: 0,
    });
  });

  it("should handle edge case with only file changes", () => {
    // In some cases, git might report only files changed without insertions/deletions
    const output = " 2 files changed";
    const result = parseGitShortstat(output);
    expect(result).toEqual({
      files: 2,
      additions: 0,
      deletions: 0,
    });
  });
});
