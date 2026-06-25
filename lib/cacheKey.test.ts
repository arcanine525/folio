import { describe, expect, it } from "vitest";
import { computeCacheKey } from "@/lib/cacheKey";

describe("lib/cacheKey", () => {
  it("is deterministic for the same inputs", async () => {
    const a = await computeCacheKey("ctx", "sys", "user");
    const b = await computeCacheKey("ctx", "sys", "user");
    expect(a).toBe(b);
  });

  it("changes when any input changes", async () => {
    const base = await computeCacheKey("ctx", "sys", "user");
    expect(await computeCacheKey("ctx2", "sys", "user")).not.toBe(base);
    expect(await computeCacheKey("ctx", "sys2", "user")).not.toBe(base);
    expect(await computeCacheKey("ctx", "sys", "user2")).not.toBe(base);
  });

  it("returns a hex string", async () => {
    const key = await computeCacheKey("a", "b");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes inputs whose concatenation would otherwise collide", async () => {
    // "ab"+"c" vs "a"+"bc" — naive concatenation is "abc" for both.
    expect(await computeCacheKey("ab", "c")).not.toBe(await computeCacheKey("a", "bc"));
  });
});
