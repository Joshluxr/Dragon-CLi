import { vi, describe, it, expect, beforeEach } from "vitest";
import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { getAdminUserOrThrow } from "@/lib/auth-server";

// Recursively find all page.tsx files
function findPageFiles(dir: string) {
  const pageFiles: string[] = [];
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && file !== "node_modules") {
      pageFiles.push(...findPageFiles(fullPath));
    } else if (file === "page.tsx") {
      pageFiles.push(fullPath);
    }
  }
  return pageFiles;
}

vi.mock("@/lib/auth-server", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getAdminUserOrThrow: vi.fn().mockRejectedValue(new Error("Unauthorized")),
  };
});

describe("Admin pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminDir = __dirname;
  const pageFiles = findPageFiles(adminDir);
  for (const pageFile of pageFiles) {
    it(`should ensure ${relative(adminDir, pageFile)} calls getAdminUserOrThrow`, async () => {
      const page = await import(pageFile);
      expect(getAdminUserOrThrow).not.toHaveBeenCalled();
      try {
        await page.default({});
      } catch (error) {
        expect((error as Error).message).toContain("Unauthorized");
      }
      expect(getAdminUserOrThrow).toHaveBeenCalled();
    });
  }
});
