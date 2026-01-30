import { describe, it, expect } from "vitest";
import { parseMultiFileDiff, isImageFile } from "./git-diff";

describe("parseMultiFileDiff", () => {
  it("should parse a single file diff with additions", () => {
    const diff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("file.ts");
    expect(result[0]?.additions).toBe(1);
    expect(result[0]?.deletions).toBe(0);
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should parse a single file diff with deletions", () => {
    const diff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,4 +1,3 @@
 export function hello() {
-  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("file.ts");
    expect(result[0]?.additions).toBe(0);
    expect(result[0]?.deletions).toBe(1);
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should parse a new file diff", () => {
    const diff = `diff --git a/newfile.ts b/newfile.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return "new";
+}`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("newfile.ts");
    expect(result[0]?.additions).toBe(3);
    expect(result[0]?.deletions).toBe(0);
    expect(result[0]?.changeType).toBe("added");
  });

  it("should parse a deleted file diff", () => {
    const diff = `diff --git a/oldfile.ts b/oldfile.ts
deleted file mode 100644
index 1234567..0000000
--- a/oldfile.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunc() {
-  return "old";
-}`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("oldfile.ts");
    expect(result[0]?.additions).toBe(0);
    expect(result[0]?.deletions).toBe(3);
    expect(result[0]?.changeType).toBe("deleted");
  });

  it("should parse multiple file diffs", () => {
    const diff = `diff --git a/file1.ts b/file1.ts
index 1234567..abcdefg 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }
diff --git a/file2.ts b/file2.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/file2.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return "new";
+}
diff --git a/file3.ts b/file3.ts
index 1234567..abcdefg 100644
--- a/file3.ts
+++ b/file3.ts
@@ -1,4 +1,3 @@
 export function bye() {
-  console.log("Bye");
   return "goodbye";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(3);

    // File 1: modified with addition
    expect(result[0]?.fileName).toBe("file1.ts");
    expect(result[0]?.additions).toBe(1);
    expect(result[0]?.deletions).toBe(0);
    expect(result[0]?.changeType).toBe("modified");

    // File 2: new file
    expect(result[1]?.fileName).toBe("file2.ts");
    expect(result[1]?.additions).toBe(3);
    expect(result[1]?.deletions).toBe(0);
    expect(result[1]?.changeType).toBe("added");

    // File 3: modified with deletion
    expect(result[2]?.fileName).toBe("file3.ts");
    expect(result[2]?.additions).toBe(0);
    expect(result[2]?.deletions).toBe(1);
    expect(result[2]?.changeType).toBe("modified");
  });

  it("should handle files with nested paths", () => {
    const diff = `diff --git a/src/components/ui/button.tsx b/src/components/ui/button.tsx
index 1234567..abcdefg 100644
--- a/src/components/ui/button.tsx
+++ b/src/components/ui/button.tsx
@@ -1,3 +1,4 @@
 export function Button() {
+  console.log("Button");
   return null;
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("src/components/ui/button.tsx");
    expect(result[0]?.additions).toBe(1);
    expect(result[0]?.deletions).toBe(0);
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should handle empty diff", () => {
    const diff = "";
    const result = parseMultiFileDiff(diff);
    expect(result).toHaveLength(0);
  });

  it("should handle diff with no changes", () => {
    const diff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 export function hello() {
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("file.ts");
    expect(result[0]?.additions).toBe(0);
    expect(result[0]?.deletions).toBe(0);
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should not count diff metadata lines as additions/deletions", () => {
    const diff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    // Should have 1 addition, not counting the --- and +++ lines
    expect(result[0]?.additions).toBe(1);
    expect(result[0]?.deletions).toBe(0);
  });

  it("should handle files with special characters in names", () => {
    const diff = `diff --git a/file-with-dashes.ts b/file-with-dashes.ts
index 1234567..abcdefg 100644
--- a/file-with-dashes.ts
+++ b/file-with-dashes.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("file-with-dashes.ts");
  });

  it("should detect correct file language from extension", () => {
    const diff = `diff --git a/test.py b/test.py
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/test.py
@@ -0,0 +1,2 @@
+def hello():
+    return "world"`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("test.py");
    expect(result[0]?.fileLang).toBe("py");
    expect(result[0]?.fullDiff).toBeDefined();
  });

  it("should use txt as default language for files without extension", () => {
    const diff = `diff --git a/README b/README
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/README
@@ -0,0 +1,2 @@
+# README
+This is a readme`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("README");
    expect(result[0]?.fileLang).toBe("txt");
    expect(result[0]?.fullDiff).toBeDefined();
  });

  it("should handle malformed diffs gracefully", () => {
    const diff = `diff --git invalid line
some random content
+++ not a valid diff`;

    const result = parseMultiFileDiff(diff);

    // Should not throw, but may return empty array or skip invalid parts
    expect(result).toBeInstanceOf(Array);
  });

  it("should handle renamed files", () => {
    const diff = `diff --git a/old-name.ts b/new-name.ts
similarity index 95%
rename from old-name.ts
rename to new-name.ts
index 1234567..abcdefg 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    // Should use the new file name
    expect(result[0]?.fileName).toBe("new-name.ts");
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should handle file paths with spaces", () => {
    const diff = `diff --git a/my file.ts b/my file.ts
index 1234567..abcdefg 100644
--- a/my file.ts
+++ b/my file.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("my file.ts");
    expect(result[0]?.additions).toBe(1);
    expect(result[0]?.deletions).toBe(0);
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should handle file paths with multiple spaces", () => {
    const diff = `diff --git a/src/my awesome file.ts b/src/my awesome file.ts
index 1234567..abcdefg 100644
--- a/src/my awesome file.ts
+++ b/src/my awesome file.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("src/my awesome file.ts");
  });

  it("should handle renamed files with spaces", () => {
    const diff = `diff --git a/old name.ts b/new name.ts
similarity index 95%
rename from old name.ts
rename to new name.ts
index 1234567..abcdefg 100644
--- a/old name.ts
+++ b/new name.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("new name.ts");
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should handle tabs between file paths", () => {
    const diff = `diff --git a/file.ts\tb/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("file.ts");
  });

  it("should handle files with spaces in multi-file diff", () => {
    const diff = `diff --git a/file one.ts b/file one.ts
index 1234567..abcdefg 100644
--- a/file one.ts
+++ b/file one.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }
diff --git a/file two.py b/file two.py
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/file two.py
@@ -0,0 +1,2 @@
+def hello():
+    return "world"`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(2);
    expect(result[0]?.fileName).toBe("file one.ts");
    expect(result[1]?.fileName).toBe("file two.py");
  });

  it("should handle files with trailing whitespace in path", () => {
    const diff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("file.ts");
  });

  it("should detect binary files", () => {
    const diff = `diff --git a/public/logo.png b/public/logo.png
index 1234567..8901234 100644
Binary files a/public/logo.png and b/public/logo.png differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("public/logo.png");
    expect(result[0]?.isBinary).toBe(true);
    expect(result[0]?.isImage).toBe(true);
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should detect new binary image files", () => {
    const diff = `diff --git a/src/assets/background.jpg b/src/assets/background.jpg
new file mode 100644
index 0000000..5678901
Binary files /dev/null and b/src/assets/background.jpg differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("src/assets/background.jpg");
    expect(result[0]?.isBinary).toBe(true);
    expect(result[0]?.isImage).toBe(true);
    expect(result[0]?.changeType).toBe("added");
  });

  it("should not mark non-image binary files as images", () => {
    const diff = `diff --git a/data/file.bin b/data/file.bin
index 1234567..8901234 100644
Binary files a/data/file.bin and b/data/file.bin differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("data/file.bin");
    expect(result[0]?.isBinary).toBe(true);
    expect(result[0]?.isImage).toBe(false);
  });

  it("should not mark text files as binary", () => {
    const diff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello");
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.isBinary).toBe(false);
    expect(result[0]?.isImage).toBe(false);
  });
});

describe("isImageFile", () => {
  it("should return true for common image extensions", () => {
    expect(isImageFile("image.png")).toBe(true);
    expect(isImageFile("image.jpg")).toBe(true);
    expect(isImageFile("image.jpeg")).toBe(true);
    expect(isImageFile("image.gif")).toBe(true);
    expect(isImageFile("image.webp")).toBe(true);
    expect(isImageFile("image.svg")).toBe(true);
    expect(isImageFile("image.ico")).toBe(true);
    expect(isImageFile("image.bmp")).toBe(true);
    expect(isImageFile("image.avif")).toBe(true);
  });

  it("should return false for non-image extensions", () => {
    expect(isImageFile("file.ts")).toBe(false);
    expect(isImageFile("file.js")).toBe(false);
    expect(isImageFile("file.json")).toBe(false);
    expect(isImageFile("file.txt")).toBe(false);
    expect(isImageFile("file.bin")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isImageFile("image.PNG")).toBe(true);
    expect(isImageFile("image.JPG")).toBe(true);
    expect(isImageFile("image.Gif")).toBe(true);
  });

  it("should handle files with multiple dots in the name", () => {
    expect(isImageFile("my.image.file.png")).toBe(true);
    expect(isImageFile("archive.tar.gz")).toBe(false);
  });

  it("should handle files without extensions", () => {
    expect(isImageFile("README")).toBe(false);
    expect(isImageFile("Makefile")).toBe(false);
  });
});

describe("parseMultiFileDiff - file size parsing", () => {
  it("should parse file sizes from --stat output for new binary files", () => {
    const diff = ` logo.png | Bin 0 -> 5000 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)

diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/logo.png differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("logo.png");
    expect(result[0]?.isBinary).toBe(true);
    expect(result[0]?.isImage).toBe(true);
    expect(result[0]?.oldFileSize).toBe(0);
    expect(result[0]?.newFileSize).toBe(5000);
    expect(result[0]?.changeType).toBe("added");
  });

  it("should parse file sizes for deleted binary files", () => {
    const diff = ` logo.png | Bin 5000 -> 0 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)

diff --git a/logo.png b/logo.png
deleted file mode 100644
index 1234567..0000000
Binary files a/logo.png and /dev/null differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("logo.png");
    expect(result[0]?.isBinary).toBe(true);
    expect(result[0]?.isImage).toBe(true);
    expect(result[0]?.oldFileSize).toBe(5000);
    expect(result[0]?.newFileSize).toBe(0);
    expect(result[0]?.changeType).toBe("deleted");
  });

  it("should parse file sizes for modified binary files", () => {
    const diff = ` background.jpg | Bin 1234567 -> 2345678 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)

diff --git a/background.jpg b/background.jpg
index 1234567..8901234 100644
Binary files a/background.jpg and b/background.jpg differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("background.jpg");
    expect(result[0]?.isBinary).toBe(true);
    expect(result[0]?.isImage).toBe(true);
    expect(result[0]?.oldFileSize).toBe(1234567);
    expect(result[0]?.newFileSize).toBe(2345678);
    expect(result[0]?.changeType).toBe("modified");
  });

  it("should parse file sizes with nested paths", () => {
    const diff = ` src/assets/logo.png | Bin 0 -> 5000 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)

diff --git a/src/assets/logo.png b/src/assets/logo.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/src/assets/logo.png differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("src/assets/logo.png");
    expect(result[0]?.oldFileSize).toBe(0);
    expect(result[0]?.newFileSize).toBe(5000);
  });

  it("should handle multiple binary files with sizes in one diff", () => {
    const diff = ` logo.png       | Bin 0 -> 5000 bytes
 background.jpg | Bin 1000 -> 2000 bytes
 2 files changed, 0 insertions(+), 0 deletions(-)

diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/logo.png differ
diff --git a/background.jpg b/background.jpg
index 1234567..8901234 100644
Binary files a/background.jpg and b/background.jpg differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(2);

    // First file
    expect(result[0]?.fileName).toBe("logo.png");
    expect(result[0]?.oldFileSize).toBe(0);
    expect(result[0]?.newFileSize).toBe(5000);

    // Second file
    expect(result[1]?.fileName).toBe("background.jpg");
    expect(result[1]?.oldFileSize).toBe(1000);
    expect(result[1]?.newFileSize).toBe(2000);
  });

  it("should not parse sizes for non-binary files", () => {
    const diff = ` file.ts | 5 +++++
 1 file changed, 5 insertions(+)

diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,8 @@
+console.log("new");
+console.log("new");
+console.log("new");
+console.log("new");
+console.log("new");
 export function hello() {
   return "world";
 }`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("file.ts");
    expect(result[0]?.isBinary).toBe(false);
    expect(result[0]?.oldFileSize).toBeUndefined();
    expect(result[0]?.newFileSize).toBeUndefined();
  });

  it("should handle diff without stat section", () => {
    const diff = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/logo.png differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("logo.png");
    expect(result[0]?.isBinary).toBe(true);
    expect(result[0]?.oldFileSize).toBeUndefined();
    expect(result[0]?.newFileSize).toBeUndefined();
  });

  it("should handle files with special characters in stat line", () => {
    const diff = ` my-logo_v2.png | Bin 0 -> 5000 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)

diff --git a/my-logo_v2.png b/my-logo_v2.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/my-logo_v2.png differ`;

    const result = parseMultiFileDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe("my-logo_v2.png");
    expect(result[0]?.oldFileSize).toBe(0);
    expect(result[0]?.newFileSize).toBe(5000);
  });
});
