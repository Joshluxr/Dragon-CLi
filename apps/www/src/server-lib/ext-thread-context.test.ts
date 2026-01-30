import { describe, expect, it } from "vitest";
import { formatThreadContext } from "@/server-lib/ext-thread-context";

describe("formatThreadContext", () => {
  it("returns empty string when no entries provided", () => {
    expect(formatThreadContext([])).toBe("");
  });

  it("formats entries with default bullet style", () => {
    const result = formatThreadContext([
      { author: "alice", body: "Investigating the issue" },
      {
        author: "@bob",
        body: "Found a fix\nNeeds review",
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      "> - @alice: Investigating the issue
      > - @bob: Found a fix
      >   Needs review"
    `);
  });
});
