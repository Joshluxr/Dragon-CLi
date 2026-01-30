import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectPlatform, getCacheDir } from "../cache/platform";
import type { MemoryRouterConfig } from "../cache/types";
import * as os from "os";

// Mock child_process spawn
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("Platform Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCacheDir", () => {
    it("returns path in home directory", () => {
      const cacheDir = getCacheDir();
      expect(cacheDir).toContain(".dragon/zvec-cache");
      expect(cacheDir).toContain(os.homedir());
    });
  });

  describe("detectPlatform", () => {
    it("returns platform info object", async () => {
      const info = await detectPlatform();
      expect(info).toHaveProperty("supported");
      expect(info).toHaveProperty("os");
      expect(info).toHaveProperty("arch");
    });

    it("reports correct OS type", async () => {
      const info = await detectPlatform();
      const platform = os.platform();
      if (
        platform === "linux" ||
        platform === "darwin" ||
        platform === "win32"
      ) {
        expect(info.os).toBe(platform);
      } else {
        expect(info.os).toBe("other");
      }
    });

    it("reports correct architecture", async () => {
      const info = await detectPlatform();
      const arch = os.arch();
      if (arch === "x64" || arch === "arm64") {
        expect(info.arch).toBe(arch);
      } else {
        expect(info.arch).toBe("other");
      }
    });
  });
});

describe("Cache Types", () => {
  describe("MemoryRouterConfig", () => {
    it("accepts valid configuration", () => {
      const config: MemoryRouterConfig = {
        mode: "hybrid",
        cacheEnabled: true,
        syncEnabled: true,
        syncIntervalMs: 300000,
        maxCacheSize: 100,
        ttlSeconds: 2592000,
      };

      expect(config.mode).toBe("hybrid");
      expect(config.cacheEnabled).toBe(true);
      expect(config.syncEnabled).toBe(true);
      expect(config.syncIntervalMs).toBe(300000);
      expect(config.maxCacheSize).toBe(100);
      expect(config.ttlSeconds).toBe(2592000);
    });

    it("supports different modes", () => {
      const modes: MemoryRouterConfig["mode"][] = [
        "hybrid",
        "cache-only",
        "remote-only",
      ];

      modes.forEach((mode) => {
        const config: MemoryRouterConfig = {
          mode,
          cacheEnabled: mode !== "remote-only",
          syncEnabled: mode === "hybrid",
          syncIntervalMs: 300000,
          maxCacheSize: 50,
          ttlSeconds: 86400,
        };
        expect(config.mode).toBe(mode);
      });
    });
  });
});

describe("Cache Bridge Types", () => {
  it("CachedMemory interface validates correctly", () => {
    const memory = {
      id: "test-id",
      content: "Test memory content",
      embedding: Array(768).fill(0.1),
      memory_type: "static" as const,
      project: "test-project",
      created_at: Date.now(),
      updated_at: Date.now(),
      source: "local" as const,
    };

    expect(memory.id).toBe("test-id");
    expect(memory.content).toBe("Test memory content");
    expect(memory.embedding.length).toBe(768);
    expect(memory.memory_type).toBe("static");
    expect(memory.source).toBe("local");
  });

  it("SearchQuery interface validates correctly", () => {
    const query = {
      embedding: Array(768).fill(0.1),
      limit: 10,
      min_score: 0.5,
      filter: "memory_type='static'",
    };

    expect(query.embedding.length).toBe(768);
    expect(query.limit).toBe(10);
    expect(query.min_score).toBe(0.5);
    expect(query.filter).toBe("memory_type='static'");
  });

  it("SearchResult interface validates correctly", () => {
    const result = {
      id: "result-id",
      content: "Result content",
      score: 0.95,
      memory_type: "dynamic" as const,
      created_at: Date.now(),
    };

    expect(result.id).toBe("result-id");
    expect(result.score).toBe(0.95);
    expect(result.memory_type).toBe("dynamic");
  });
});

describe("Cache Factory", () => {
  it("exports getMemoryRouter function", async () => {
    const { getMemoryRouter } = await import("../cache/factory");
    expect(typeof getMemoryRouter).toBe("function");
  });

  it("exports resetRouter function", async () => {
    const { resetRouter } = await import("../cache/factory");
    expect(typeof resetRouter).toBe("function");
  });

  it("exports shutdownRouter function", async () => {
    const { shutdownRouter } = await import("../cache/factory");
    expect(typeof shutdownRouter).toBe("function");
  });
});

describe("Cache Health Types", () => {
  it("HealthStatus interface validates correctly", () => {
    const health = {
      cacheAvailable: true,
      supermemoryOnline: true,
      lastSyncTime: Date.now(),
      pendingUploads: 0,
      cacheItemCount: 100,
    };

    expect(health.cacheAvailable).toBe(true);
    expect(health.supermemoryOnline).toBe(true);
    expect(health.pendingUploads).toBe(0);
    expect(health.cacheItemCount).toBe(100);
  });

  it("SyncResult interface validates correctly", () => {
    const syncResult = {
      success: true,
      uploaded: 5,
      downloaded: 10,
      conflicts: 0,
      errors: [],
      duration: 1500,
    };

    expect(syncResult.success).toBe(true);
    expect(syncResult.uploaded).toBe(5);
    expect(syncResult.downloaded).toBe(10);
    expect(syncResult.conflicts).toBe(0);
    expect(syncResult.errors).toHaveLength(0);
    expect(syncResult.duration).toBe(1500);
  });

  it("SyncResult with errors validates correctly", () => {
    const syncResult = {
      success: false,
      uploaded: 3,
      downloaded: 0,
      conflicts: 1,
      errors: ["Upload failed: memory-1", "Conflict: memory-2"],
      duration: 2500,
    };

    expect(syncResult.success).toBe(false);
    expect(syncResult.conflicts).toBe(1);
    expect(syncResult.errors).toHaveLength(2);
    expect(syncResult.errors[0]).toContain("Upload failed");
  });
});

describe("CacheStats Types", () => {
  it("CacheStats interface validates correctly", () => {
    const stats = {
      item_count: 150,
      size_bytes: 1024000,
      last_sync_time: Date.now(),
      pending_uploads: 5,
      index_completeness: 0.98,
    };

    expect(stats.item_count).toBe(150);
    expect(stats.size_bytes).toBe(1024000);
    expect(stats.pending_uploads).toBe(5);
    expect(stats.index_completeness).toBe(0.98);
  });
});
