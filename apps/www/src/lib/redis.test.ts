import { describe, expect, it } from "vitest";
import { redis } from "./redis";
import { nanoid } from "nanoid/non-secure";

describe("redis", () => {
  // This test is just to make sure that the redis and redis-http containers are
  // setup correctly in tests & CI.
  it("get and set works", async () => {
    const key = nanoid();
    const v1 = await redis.get(key);
    await redis.set(key, "value");
    const v2 = await redis.get(key);
    expect(v1).toBeNull();
    expect(v2).toBe("value");
  });
});
