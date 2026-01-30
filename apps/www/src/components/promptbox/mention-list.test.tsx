import { describe, it, expect } from "vitest";
import { formatFilePath } from "./mention-list";

describe("formatFilePath", () => {
  describe("default behavior (30 char limit)", () => {
    it("should return only filename for files in root directory", () => {
      const result = formatFilePath("file.txt");
      expect(result).toEqual({
        filename: "file.txt",
        directory: "",
      });
    });

    it("should show full directory path when under 30 chars", () => {
      const result = formatFilePath("src/components/file.txt");
      expect(result).toEqual({
        filename: "file.txt",
        directory: "src/components",
      });
    });

    it("should show full directory path for exactly 30 chars", () => {
      const result = formatFilePath("src/components/ui/buttons/file.tsx");
      expect(result).toEqual({
        filename: "file.tsx",
        directory: "src/components/ui/buttons",
      });
    });

    it("should truncate and add ellipsis when over 30 chars", () => {
      const result = formatFilePath(
        "packages/shared/src/db/abcdef/models/user.ts",
      );
      // "packages/shared/src/db/abcdef/models" is 36 chars
      // With 30 char limit, we have 27 chars after "..."
      // "shared/src/db/abcdef/models" is exactly 27 chars, so it will fit
      expect(result).toEqual({
        filename: "user.ts",
        directory: ".../shared/src/db/abcdef/models",
      });
    });

    it("should handle deeply nested paths", () => {
      const result = formatFilePath(
        "very/long/path/to/some/deeply/nested/folder/structure/file.ts",
      );
      expect(result).toEqual({
        filename: "file.ts",
        directory: ".../nested/folder/structure",
      });
    });

    it("should handle empty strings", () => {
      const result = formatFilePath("");
      expect(result).toEqual({
        filename: "",
        directory: "",
      });
    });
  });

  describe("custom character limits", () => {
    it("should respect custom maxChars parameter", () => {
      const result = formatFilePath("src/components/ui/file.tsx", 10);
      expect(result).toEqual({
        filename: "file.tsx",
        directory: ".../ui",
      });
    });

    it("should show more directories with larger limit", () => {
      const result = formatFilePath(
        "packages/shared/src/db/abcdef/models/user.ts",
        50,
      );
      expect(result).toEqual({
        filename: "user.ts",
        directory: "packages/shared/src/db/abcdef/models",
      });
    });

    it("should handle very small limits", () => {
      const result = formatFilePath("src/components/ui/buttons/file.tsx", 5);
      // With limit of 5, available chars = 5 - 3 = 2
      // Can't fit any directory parts
      expect(result).toEqual({
        filename: "file.tsx",
        directory: "...",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle paths with special characters", () => {
      const result = formatFilePath("src/@components/[id]/file-name.test.tsx");
      expect(result).toEqual({
        filename: "file-name.test.tsx",
        directory: "src/@components/[id]",
      });
    });

    it("should handle paths with dots in directory names", () => {
      const result = formatFilePath(
        "node_modules/.pnpm/pkg.v1.0.0/src/index.js",
      );
      // "node_modules/.pnpm/pkg.v1.0.0/src" is 34 chars
      // With 30 char limit, we have 27 chars after "..."
      // ".pnpm/pkg.v1.0.0/src" is 20 chars, so it will fit
      expect(result).toEqual({
        filename: "index.js",
        directory: ".../.pnpm/pkg.v1.0.0/src",
      });
    });

    it("should handle single directory paths", () => {
      const result = formatFilePath("src/file.txt");
      expect(result).toEqual({
        filename: "file.txt",
        directory: "src",
      });
    });

    it("should prioritize showing more recent directories", () => {
      const result = formatFilePath("a/b/c/d/e/f/g/h/i/file.txt", 15);
      // With limit of 15, available chars = 15 - 3 = 12
      // "i" = 1, "h/i" = 3, "g/h/i" = 5, "f/g/h/i" = 7, "e/f/g/h/i" = 9, "d/e/f/g/h/i" = 11
      // So "d/e/f/g/h/i" (11 chars) will fit
      expect(result).toEqual({
        filename: "file.txt",
        directory: ".../d/e/f/g/h/i",
      });
    });

    it("should handle exactly fitting directories without ellipsis", () => {
      const result = formatFilePath("app/components/ui/file.tsx", 20);
      expect(result).toEqual({
        filename: "file.tsx",
        directory: "app/components/ui",
      });
    });
  });
});
