import { describe, it, expect } from "vitest";
import { parseGitDiffStats } from "./git-diff";

describe("parseGitDiffStats", () => {
  it("should return null for null input", () => {
    expect(parseGitDiffStats(null)).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseGitDiffStats("")).toBeNull();
  });

  it("should parse a simple diff with additions", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,5 @@
 line1
 line2
 line3
+line4
+line5`;

    const result = parseGitDiffStats(diff);
    expect(result).toEqual({
      additions: 2,
      deletions: 0,
      files: 1,
    });
  });

  it("should parse a simple diff with deletions", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,3 @@
 line1
 line2
 line3
-line4
-line5`;

    const result = parseGitDiffStats(diff);
    expect(result).toEqual({
      additions: 0,
      deletions: 2,
      files: 1,
    });
  });

  it("should parse a diff with both additions and deletions", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,4 @@
-old line
+new line
 unchanged line
-deleted line
 another unchanged line`;

    const result = parseGitDiffStats(diff);
    expect(result).toEqual({
      additions: 1,
      deletions: 2,
      files: 1,
    });
  });

  it("should parse multiple files in diff", () => {
    const diff = `diff --git a/file1.txt b/file1.txt
index 1234567..abcdefg 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1,3 +1,4 @@
 line1
+added line
 line2
 line3
diff --git a/file2.txt b/file2.txt
index 1234567..abcdefg 100644
--- a/file2.txt
+++ b/file2.txt
@@ -1,4 +1,3 @@
 line1
-removed line
 line2
 line3`;

    const result = parseGitDiffStats(diff);
    expect(result).toEqual({
      additions: 1,
      deletions: 1,
      files: 2,
    });
  });

  it("should handle new file creation", () => {
    const diff = `diff --git a/newfile.txt b/newfile.txt
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/newfile.txt
@@ -0,0 +1,3 @@
+line1
+line2
+line3`;

    const result = parseGitDiffStats(diff);
    expect(result).toEqual({
      additions: 3,
      deletions: 0,
      files: 1,
    });
  });

  it("should handle file deletion", () => {
    const diff = `diff --git a/deleted.txt b/deleted.txt
deleted file mode 100644
index 1234567..0000000
--- a/deleted.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2
-line3`;

    const result = parseGitDiffStats(diff);
    expect(result).toEqual({
      additions: 0,
      deletions: 3,
      files: 1,
    });
  });

  it("should handle invalid diff format gracefully", () => {
    const invalidDiff = "This is not a valid git diff format";
    const result = parseGitDiffStats(invalidDiff);
    expect(result).toEqual({
      additions: 0,
      deletions: 0,
      files: 0,
    });
  });

  it("should handle binary file changes", () => {
    const diff = `diff --git a/image.png b/image.png
index 1234567..abcdefg 100644
GIT binary patch
delta 123
...binary content...

delta 456
...binary content...`;

    const result = parseGitDiffStats(diff);
    expect(result).toEqual({
      additions: 0,
      deletions: 0,
      files: 1,
    });
  });
});
