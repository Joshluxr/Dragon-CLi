import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";

// Mock fs and os modules
vi.mock("fs");
vi.mock("os");

// Import after mocking
import {
  loadSettings,
  getApiKey,
  isDebugEnabled,
  getSkipToolsFromEnv,
} from "../utils/settings";

describe("settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/mock/home");
    // Reset environment variables
    delete process.env.SUPERMEMORY_CC_API_KEY;
    delete process.env.SUPERMEMORY_DEBUG;
    delete process.env.SUPERMEMORY_SKIP_TOOLS;
  });

  afterEach(() => {
    delete process.env.SUPERMEMORY_CC_API_KEY;
    delete process.env.SUPERMEMORY_DEBUG;
    delete process.env.SUPERMEMORY_SKIP_TOOLS;
  });

  describe("loadSettings", () => {
    it("should return default settings when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings = loadSettings();

      expect(settings.skipTools).toEqual([]);
      expect(settings.captureTools).toEqual(["Edit", "Write", "Bash", "Task"]);
      expect(settings.maxProfileItems).toBe(50);
      expect(settings.debug).toBe(false);
    });

    it("should merge saved settings with defaults", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          skipTools: ["Read"],
          maxProfileItems: 100,
        }),
      );

      const settings = loadSettings();

      expect(settings.skipTools).toEqual(["Read"]);
      expect(settings.maxProfileItems).toBe(100);
      expect(settings.captureTools).toEqual(["Edit", "Write", "Bash", "Task"]);
    });

    it("should handle corrupted settings file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json");

      const settings = loadSettings();

      expect(settings).toEqual({
        skipTools: [],
        captureTools: ["Edit", "Write", "Bash", "Task"],
        maxProfileItems: 50,
        debug: false,
        progressiveDisclosure: true,
        treeNavigation: true,
        privacyFilter: true,
        embeddingEngine: "none",
      });
    });
  });

  describe("getApiKey", () => {
    it("should return API key from environment", () => {
      process.env.SUPERMEMORY_CC_API_KEY = "sm_test_key";

      expect(getApiKey()).toBe("sm_test_key");
    });

    it("should return undefined when not set", () => {
      expect(getApiKey()).toBeUndefined();
    });
  });

  describe("isDebugEnabled", () => {
    it("should return true when env var is set to true", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      process.env.SUPERMEMORY_DEBUG = "true";

      expect(isDebugEnabled()).toBe(true);
    });

    it("should return false when env var is not set", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(isDebugEnabled()).toBe(false);
    });

    it("should return true when settings.debug is true", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ debug: true }),
      );

      expect(isDebugEnabled()).toBe(true);
    });
  });

  describe("getSkipToolsFromEnv", () => {
    it("should return empty array when env var not set", () => {
      expect(getSkipToolsFromEnv()).toEqual([]);
    });

    it("should parse comma-separated tools from env var", () => {
      process.env.SUPERMEMORY_SKIP_TOOLS = "Read, Glob, Grep";

      expect(getSkipToolsFromEnv()).toEqual(["Read", "Glob", "Grep"]);
    });
  });
});
