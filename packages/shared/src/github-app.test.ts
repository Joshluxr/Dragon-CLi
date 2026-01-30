import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getGitHubApp,
  isAppInstalledOnRepo,
  resetAppInstance,
} from "./github-app.js";

describe("GitHub App", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetAppInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    resetAppInstance();
  });

  describe("getGitHubApp", () => {
    it("should throw error when GITHUB_APP_ID is missing", () => {
      delete process.env.GITHUB_APP_ID;
      process.env.GITHUB_APP_PRIVATE_KEY = "fake-key";

      expect(() => getGitHubApp()).toThrow("GitHub App configuration missing");
    });

    it("should throw error when GITHUB_APP_PRIVATE_KEY is missing", () => {
      process.env.GITHUB_APP_ID = "123456";
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      expect(() => getGitHubApp()).toThrow("GitHub App configuration missing");
    });

    it("should create App instance when both env vars are present", () => {
      process.env.GITHUB_APP_ID = "123456";
      process.env.GITHUB_APP_PRIVATE_KEY = "fake-private-key";

      // The App constructor doesn't validate the private key format immediately
      // It only validates when trying to use it for signing JWTs
      // So we should test that it creates an App instance successfully
      const app = getGitHubApp();
      expect(app).toBeDefined();
      expect(app).toHaveProperty("octokit");
    });
  });

  describe("isAppInstalledOnRepo", () => {
    it("should handle missing app configuration gracefully", async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(isAppInstalledOnRepo("owner", "repo")).rejects.toThrow(
        "GitHub App configuration missing",
      );
    });
  });
});
