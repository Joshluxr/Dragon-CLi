import { describe, it, expect } from "vitest";
import { searchFilesLocally, type TreeFile } from "./file-search";

describe("searchFilesLocally", () => {
  const createFile = (
    path: string,
    type: "blob" | "tree" = "blob",
  ): TreeFile => ({
    path,
    type,
    sha: "test-sha",
    size: type === "blob" ? 100 : undefined,
  });

  describe("empty query handling", () => {
    it("should return empty array for empty query", () => {
      const files = [createFile("src/index.ts"), createFile("package.json")];

      expect(searchFilesLocally(files, "")).toEqual([]);
    });

    it("should return empty array for null-like query", () => {
      const files = [createFile("src/index.ts")];

      expect(searchFilesLocally(files, "")).toEqual([]);
    });
  });

  describe("exact filename matching", () => {
    it("should prioritize exact filename matches", () => {
      const files = [
        createFile("src/components/Button.tsx"),
        createFile("src/utils/button-helpers.ts"),
        createFile("Button.tsx"),
        createFile("docs/button.md"),
      ];

      const results = searchFilesLocally(files, "Button.tsx");
      expect(results[0]).toEqual(files[2]);
      expect(results[1]).toEqual(files[0]);
    });

    it("should prioritize folders with exact name match over files", () => {
      const files = [
        createFile("src/components/button.tsx", "blob"),
        createFile("button", "tree"),
        createFile("src/button", "tree"),
        createFile("button.tsx", "blob"),
      ];

      const results = searchFilesLocally(files, "button");
      expect(results[0]).toEqual(files[1]); // exact folder match
      expect(results[1]).toEqual(files[2]); // exact folder match (longer path)
    });
  });

  describe("prefix matching", () => {
    it("should match files that start with query", () => {
      const files = [
        createFile("src/index.ts"),
        createFile("src/indexer.ts"),
        createFile("src/components/IndexPage.tsx"),
        createFile("src/main.ts"),
      ];

      const results = searchFilesLocally(files, "index");
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(files[0]); // exact match
      expect(results[1]).toEqual(files[1]); // starts with
      expect(results[2]).toEqual(files[2]); // contains
    });

    it("should boost folders that start with query", () => {
      const files = [
        createFile("components", "tree"),
        createFile("comp.ts", "blob"),
        createFile("src/components", "tree"),
        createFile("compiler.ts", "blob"),
      ];

      const results = searchFilesLocally(files, "comp");
      expect(results[0]).toEqual(files[0]); // folder starts with
      expect(results[1]).toEqual(files[2]); // folder starts with (longer path)
      expect(results[2]).toEqual(files[1]); // file starts with
    });
  });

  describe("contains matching", () => {
    it("should match files containing the query", () => {
      const files = [
        createFile("src/userService.ts"),
        createFile("tests/user.test.ts"),
        createFile("api/routes/users.ts"),
        createFile("config.ts"),
      ];

      const results = searchFilesLocally(files, "user");
      expect(results).toHaveLength(3);
      expect(results).not.toContain(files[3]);
    });

    it("should prioritize filename contains over path contains", () => {
      const files = [
        createFile("user/config.ts"), // path contains
        createFile("src/userService.ts"), // filename contains
        createFile("user/profile/avatar.ts"), // path contains
        createFile("lib/auth-user.ts"), // filename contains
      ];

      const results = searchFilesLocally(files, "user");
      expect(results[0]).toEqual(files[1]); // filename contains
      expect(results[1]).toEqual(files[3]); // filename contains
    });
  });

  describe("fuzzy matching", () => {
    it("should match files with fuzzy search", () => {
      const files = [
        createFile("src/components/Button.tsx"),
        createFile("src/containers/BlogPost.tsx"),
        createFile("src/utils/helpers.ts"),
        createFile("package.json"),
      ];

      const results = searchFilesLocally(files, "sct");
      expect(results).toContain(files[0]); // s(r)c/(c)omponen(t)s
      expect(results).toContain(files[1]); // s(r)c/(c)on(t)ainers
      expect(results).not.toContain(files[3]);
    });

    it("should handle complex fuzzy patterns", () => {
      const files = [
        createFile("apps/www/src/components/chat/ChatMessage.tsx"),
        createFile("packages/shared/utils/string.ts"),
        createFile("docs/README.md"),
      ];

      const results = searchFilesLocally(files, "awsc");
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(files[0]); // (a)pps/(w)(w)w/(s)rc/(c)omponents
    });
  });

  describe("case sensitivity", () => {
    it("should perform case-insensitive search", () => {
      const files = [
        createFile("Button.tsx"),
        createFile("button.ts"),
        createFile("BUTTON.md"),
        createFile("BuTtOn.css"),
      ];

      const results = searchFilesLocally(files, "button");
      expect(results).toHaveLength(4);
    });

    it("should handle mixed case queries", () => {
      const files = [
        createFile("UserProfile.tsx"),
        createFile("userprofile.ts"),
        createFile("user_profile.py"),
      ];

      const results = searchFilesLocally(files, "UserProf");
      expect(results).toHaveLength(3);
    });
  });

  describe("sorting and ranking", () => {
    it("should sort by score then by path length", () => {
      const files = [
        createFile("src/components/forms/UserForm.tsx"), // longer path
        createFile("src/UserForm.tsx"), // shorter path
        createFile("forms/UserForm.tsx"), // medium path
        createFile("UserForm.tsx"), // shortest path
      ];

      const results = searchFilesLocally(files, "UserForm.tsx");

      // All have exact filename match, so sort by path length
      expect(results[0]).toEqual(files[3]); // shortest
      expect(results[1]).toEqual(files[1]); // src/UserForm.tsx
      expect(results[2]).toEqual(files[2]); // forms/UserForm.tsx
      expect(results[3]).toEqual(files[0]); // longest
    });

    it("should respect scoring hierarchy", () => {
      const files = [
        createFile("test.ts"), // exact match
        createFile("testing.ts"), // starts with
        createFile("src/test.ts"), // exact match (longer path)
        createFile("mytest.ts"), // contains
        createFile("src/components/test.ts"), // exact match (longest path)
        createFile("t/e/s/t.ts"), // fuzzy match
      ];

      const results = searchFilesLocally(files, "test");

      // Exact matches come first (sorted by path length)
      expect(results[0]).toEqual(files[0]);
      expect(results[1]).toEqual(files[1]); // testing.ts (starts with)
      expect(results[2]).toEqual(files[2]); // src/test.ts
      expect(results[3]).toEqual(files[4]); // src/components/test.ts
      // Then contains
      expect(results[4]).toEqual(files[3]);
      // Then fuzzy
      expect(results[5]).toEqual(files[5]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty file list", () => {
      expect(searchFilesLocally([], "test")).toEqual([]);
    });

    it("should handle files with no matches", () => {
      const files = [createFile("src/index.ts"), createFile("package.json")];

      expect(searchFilesLocally(files, "xyz")).toEqual([]);
    });

    it("should handle special characters in query", () => {
      const files = [
        createFile("test-file.ts"),
        createFile("test_file.ts"),
        createFile("test.file.ts"),
        createFile("testfile.ts"),
      ];

      const results = searchFilesLocally(files, "test-file");
      expect(results).toContain(files[0]); // exact match
      // Special characters in query may not match all variations
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle deeply nested paths", () => {
      const files = [
        createFile("a/b/c/d/e/f/g/test.ts"),
        createFile("test.ts"),
      ];

      const results = searchFilesLocally(files, "test.ts");
      expect(results[0]).toEqual(files[1]); // shorter path wins
      expect(results[1]).toEqual(files[0]);
    });

    it("should handle files with no filename", () => {
      const files = [
        createFile("src/"), // edge case: path ending with /
        createFile("test"),
        createFile(""),
      ];

      const results = searchFilesLocally(files, "test");
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(files[1]);
    });
  });

  describe("folder-specific behavior", () => {
    it("should boost folders consistently across all match types", () => {
      const files = [
        createFile("components", "tree"), // starts with comp
        createFile("components.ts", "blob"), // starts with comp
        createFile("comp", "tree"), // exact match
        createFile("comp.ts", "blob"), // exact match
        createFile("mycomponents", "tree"), // contains comp
        createFile("mycomponents.ts", "blob"), // contains comp
      ];

      const results = searchFilesLocally(files, "comp");

      // Check that we get all 6 results
      expect(results).toHaveLength(6);

      // Verify folders get a slight boost within the same score tier
      // Find exact matches (comp and comp.ts)
      const exactMatches = results.filter(
        (r) => r.path === "comp" || r.path === "comp.ts",
      );
      expect(exactMatches).toHaveLength(2);
      expect(exactMatches[0]?.type).toBe("tree"); // folder comes first

      // Find prefix matches (components and components.ts)
      const prefixMatches = results.filter(
        (r) => r.path === "components" || r.path === "components.ts",
      );
      expect(prefixMatches).toHaveLength(2);
      expect(prefixMatches[0]?.type).toBe("tree"); // folder comes first

      // Find contains matches (mycomponents and mycomponents.ts)
      const containsMatches = results.filter(
        (r) => r.path === "mycomponents" || r.path === "mycomponents.ts",
      );
      expect(containsMatches).toHaveLength(2);
      expect(containsMatches[0]?.type).toBe("tree"); // folder comes first
    });

    it("should handle mixed file and folder results", () => {
      const files = [
        createFile("src", "tree"),
        createFile("src/index.ts", "blob"),
        createFile("test/src", "tree"),
        createFile("source.ts", "blob"),
      ];

      const results = searchFilesLocally(files, "src");
      expect(results).toHaveLength(4);
      expect(results[0]).toEqual(files[0]); // exact folder match
    });
  });
});
