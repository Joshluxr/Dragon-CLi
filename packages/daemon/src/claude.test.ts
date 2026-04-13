import { describe, it, expect, vi, afterEach } from "vitest";
import { getAnthropicApiKeyOrNull } from "./claude";
import type { IDaemonRuntime } from "./runtime";

describe("getAnthropicApiKeyOrNull", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns empty string when ANTHROPIC_AUTH_TOKEN is set (avoid conflicting with MiniMax / proxy)", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "minimax-key";
    process.env.ANTHROPIC_API_KEY = "should-not-use";
    const runtime = {
      execSync: vi.fn(),
      readFileSync: vi.fn(),
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    } as unknown as IDaemonRuntime;
    expect(getAnthropicApiKeyOrNull(runtime)).toBe("");
    expect(runtime.execSync).not.toHaveBeenCalled();
  });
});
