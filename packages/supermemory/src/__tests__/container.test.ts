import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";

// Mock fs module
vi.mock("fs");

// Import after mocking
import { getProjectInfo } from "../utils/container";

describe("container", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getProjectInfo", () => {
    it("should use directory name when no package.json found", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getProjectInfo("/some/path/my-project");

      expect(result.projectName).toBe("my-project");
      expect(result.containerTag).toBe("project:my-project");
      expect(result.workingDir).toBe("/some/path/my-project");
    });

    it("should use package.json name when found", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).endsWith("package.json");
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ name: "@dragon/awesome-package" }),
      );

      const result = getProjectInfo("/some/path/my-project");

      expect(result.projectName).toBe("@dragon/awesome-package");
      expect(result.containerTag).toBe("project:-dragon-awesome-package");
    });

    it("should sanitize container tags", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getProjectInfo("/path/to/My Project With Spaces");

      expect(result.containerTag).toBe("project:my-project-with-spaces");
    });

    it("should handle invalid package.json gracefully", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).endsWith("package.json");
      });
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json");

      const result = getProjectInfo("/some/path/fallback-name");

      expect(result.projectName).toBe("fallback-name");
    });

    it("should use current directory when no workingDir provided", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const cwd = process.cwd();

      const result = getProjectInfo();

      expect(result.workingDir).toBe(cwd);
    });
  });
});
