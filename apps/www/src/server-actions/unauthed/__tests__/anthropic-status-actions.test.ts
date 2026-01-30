import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAnthropicStatusAction } from "../anthropic-status-actions";
import { redis } from "@/lib/redis";

// Mock Redis
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe.skip("getAnthropicStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cached result if available", async () => {
    const cachedResult = {
      hasClaudeCodeOutage: true,
      outageImpact: "major" as const,
      claudeCodeStatus: "major_outage",
    };

    vi.mocked(redis.get).mockResolvedValue(cachedResult);

    const result = await getAnthropicStatusAction();

    expect(result).toEqual(cachedResult);
    expect(redis.get).toHaveBeenCalledWith("anthropic-status:summary");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches from API when cache is empty", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          id: "1",
          name: "Anthropic",
          url: "https://status.anthropic.com",
        },
        status: {
          indicator: "major",
          description: "Major service outage",
        },
        components: [
          {
            id: "1",
            name: "Claude Code",
            status: "major_outage",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            position: 1,
            description: "Claude Code service",
            showcase: true,
            start_date: null,
            group_id: null,
            page_id: "1",
            group: false,
            only_show_if_degraded: false,
          },
        ],
      }),
    } as Response);

    const result = await getAnthropicStatusAction();

    expect(result?.hasClaudeCodeOutage).toBe(true);
    expect(result?.outageImpact).toBe("major");
    expect(result?.claudeCodeStatus).toBe("major_outage");
    expect(redis.set).toHaveBeenCalledWith(
      "anthropic-status:summary",
      expect.objectContaining({
        hasClaudeCodeOutage: true,
        outageImpact: "major",
        claudeCodeStatus: "major_outage",
      }),
      { ex: 60 },
    );
  });

  it("returns null on API error", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await getAnthropicStatusAction();

    expect(result).toBeNull();
  });

  it("returns no outage when Claude Code is operational", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          id: "1",
          name: "Anthropic",
          url: "https://status.anthropic.com",
        },
        status: {
          indicator: "none",
          description: "All Systems Operational",
        },
        components: [
          {
            id: "1",
            name: "Claude Code",
            status: "operational",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            position: 1,
            description: "Claude Code service",
            showcase: true,
            start_date: null,
            group_id: null,
            page_id: "1",
            group: false,
            only_show_if_degraded: false,
          },
        ],
      }),
    } as Response);

    const result = await getAnthropicStatusAction();

    expect(result?.hasClaudeCodeOutage).toBe(false);
    expect(result?.outageImpact).toBe("none");
    expect(result?.claudeCodeStatus).toBe("operational");
  });

  it("detects degraded performance as minor impact", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          id: "1",
          name: "Anthropic",
          url: "https://status.anthropic.com",
        },
        status: {
          indicator: "minor",
          description: "Minor service issues",
        },
        components: [
          {
            id: "1",
            name: "Claude Code",
            status: "degraded_performance",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            position: 1,
            description: "Claude Code service",
            showcase: true,
            start_date: null,
            group_id: null,
            page_id: "1",
            group: false,
            only_show_if_degraded: false,
          },
        ],
      }),
    } as Response);

    const result = await getAnthropicStatusAction();

    expect(result?.hasClaudeCodeOutage).toBe(true);
    expect(result?.outageImpact).toBe("minor");
    expect(result?.claudeCodeStatus).toBe("degraded_performance");
  });

  it("detects partial outage as minor impact", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          id: "1",
          name: "Anthropic",
          url: "https://status.anthropic.com",
        },
        status: {
          indicator: "minor",
          description: "Minor service issues",
        },
        components: [
          {
            id: "1",
            name: "Claude Code",
            status: "partial_outage",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            position: 1,
            description: "Claude Code service",
            showcase: true,
            start_date: null,
            group_id: null,
            page_id: "1",
            group: false,
            only_show_if_degraded: false,
          },
        ],
      }),
    } as Response);

    const result = await getAnthropicStatusAction();

    expect(result?.hasClaudeCodeOutage).toBe(true);
    expect(result?.outageImpact).toBe("minor");
    expect(result?.claudeCodeStatus).toBe("partial_outage");
  });

  it("returns no outage when Claude Code component is not found", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          id: "1",
          name: "Anthropic",
          url: "https://status.anthropic.com",
        },
        status: {
          indicator: "none",
          description: "All Systems Operational",
        },
        components: [
          {
            id: "1",
            name: "Other Service",
            status: "operational",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            position: 1,
            description: "Some other service",
            showcase: true,
            start_date: null,
            group_id: null,
            page_id: "1",
            group: false,
            only_show_if_degraded: false,
          },
        ],
      }),
    } as Response);

    const result = await getAnthropicStatusAction();

    expect(result?.hasClaudeCodeOutage).toBe(false);
    expect(result?.outageImpact).toBe("none");
    expect(result?.claudeCodeStatus).toBe("operational");
  });

  it("handles unknown status as minor impact", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          id: "1",
          name: "Anthropic",
          url: "https://status.anthropic.com",
        },
        status: {
          indicator: "minor",
          description: "Service issues",
        },
        components: [
          {
            id: "1",
            name: "Claude Code",
            status: "under_maintenance",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            position: 1,
            description: "Claude Code service",
            showcase: true,
            start_date: null,
            group_id: null,
            page_id: "1",
            group: false,
            only_show_if_degraded: false,
          },
        ],
      }),
    } as Response);

    const result = await getAnthropicStatusAction();

    expect(result?.hasClaudeCodeOutage).toBe(true);
    expect(result?.outageImpact).toBe("minor");
    expect(result?.claudeCodeStatus).toBe("under_maintenance");
  });
});
