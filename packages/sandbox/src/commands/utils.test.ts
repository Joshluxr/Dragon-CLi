import { describe, it, expect, vi } from "vitest";
import type { ISandboxSession } from "../types";
import {
  validateBranchName,
  DANGEROUS_CHARS_REGEX,
  getEffectiveBaseBranch,
} from "./utils";

describe("validateBranchName", () => {
  it("should accept valid branch names", () => {
    const validNames = [
      "main",
      "develop",
      "feature-123",
      "feature_branch",
      "release-1.0.0",
      "hotfix.issue",
      "user@feature",
    ];

    validNames.forEach((name) => {
      expect(() => validateBranchName({ branchName: name })).not.toThrow();
    });
  });

  it("should reject branch names with dangerous characters", () => {
    const dangerousNames = [
      "branch; rm -rf /",
      "branch && echo 'hacked'",
      "branch | cat /etc/passwd",
      "branch$USER",
      "branch`whoami`",
      'branch"test"',
      "branch'test'",
      "branch\\test",
      "branch<script>",
      "branch>output",
      "branch(test)",
      "branch{test}",
      "branch[test]",
      "branch!test",
      "branch*test",
      "branch?test",
      "branch~test",
      "branch#test",
      "branch with spaces",
      "branch\nwith\nnewlines",
      "branch\twith\ttabs",
    ];

    dangerousNames.forEach((name) => {
      expect(() => validateBranchName({ branchName: name })).toThrow(
        /Invalid branch name/,
      );
    });
  });

  it("should use custom labels in error messages", () => {
    expect(() =>
      validateBranchName({
        branchName: "branch;test",
        label: "upstream branch",
      }),
    ).toThrow(/Invalid upstream branch/);
    expect(() =>
      validateBranchName({ branchName: "branch|test", label: "remote name" }),
    ).toThrow(/Invalid remote name/);
  });

  it("should reject control characters", () => {
    const controlCharNames = [
      "branch\x00", // null byte
      "branch\x1f", // unit separator
      "branch\x7f", // delete
    ];

    controlCharNames.forEach((name) => {
      expect(() => validateBranchName({ branchName: name })).toThrow(
        /Invalid branch name/,
      );
    });
  });
});

describe("getEffectiveBaseBranch", () => {
  const repoRoot = "/repo";
  const upstreamCommand =
    "git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true";

  it("prefers the upstream remote when the provided branch lacks remote prefix", async () => {
    const runCommand = vi
      .fn<ISandboxSession["runCommand"]>()
      .mockResolvedValueOnce("origin/feature-branch\n")
      .mockResolvedValueOnce("");

    const session = { runCommand } as unknown as ISandboxSession;

    const effectiveBranch = await getEffectiveBaseBranch({
      session,
      baseBranch: "feature/foo",
      repoRoot,
    });

    expect(effectiveBranch).toBe("origin/feature/foo");
    expect(runCommand).toHaveBeenNthCalledWith(1, upstreamCommand, {
      cwd: repoRoot,
    });
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      "git fetch origin feature/foo",
      {
        cwd: repoRoot,
      },
    );
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("retains the provided branch when it already uses the upstream remote", async () => {
    const runCommand = vi
      .fn<ISandboxSession["runCommand"]>()
      .mockResolvedValueOnce("origin/feature-branch\n")
      .mockResolvedValueOnce("");

    const session = { runCommand } as unknown as ISandboxSession;

    const effectiveBranch = await getEffectiveBaseBranch({
      session,
      baseBranch: "origin/main",
      repoRoot,
    });

    expect(effectiveBranch).toBe("origin/main");
    expect(runCommand).toHaveBeenNthCalledWith(1, upstreamCommand, {
      cwd: repoRoot,
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, "git fetch origin main", {
      cwd: repoRoot,
    });
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("falls back to the provided branch when no upstream exists", async () => {
    const runCommand = vi
      .fn<ISandboxSession["runCommand"]>()
      .mockRejectedValueOnce(new Error("no upstream"));

    const session = { runCommand } as unknown as ISandboxSession;

    const effectiveBranch = await getEffectiveBaseBranch({
      session,
      baseBranch: "main",
      repoRoot,
    });

    expect(effectiveBranch).toBe("main");
    expect(runCommand).toHaveBeenNthCalledWith(1, upstreamCommand, {
      cwd: repoRoot,
    });
    expect(runCommand).toHaveBeenCalledTimes(1);
  });
});

describe("DANGEROUS_CHARS_REGEX", () => {
  it("should match all dangerous characters", () => {
    const dangerousChars = [
      "$",
      "`",
      '"',
      "'",
      "\\",
      ";",
      "|",
      "&",
      "<",
      ">",
      "(",
      ")",
      "{",
      "}",
      "[",
      "]",
      "!",
      "*",
      "?",
      "~",
      "#",
      " ",
      "\n",
      "\t",
      "\r",
      "\x00",
      "\x1f",
      "\x7f",
    ];

    dangerousChars.forEach((char) => {
      expect(DANGEROUS_CHARS_REGEX.test(char)).toBe(true);
    });
  });

  it("should not match safe characters", () => {
    const safeChars = [
      "a",
      "z",
      "A",
      "Z",
      "0",
      "9",
      "-",
      "_",
      ".",
      "/",
      "@",
      "+",
      "=",
      ":",
    ];

    safeChars.forEach((char) => {
      expect(DANGEROUS_CHARS_REGEX.test(char)).toBe(false);
    });
  });
});
