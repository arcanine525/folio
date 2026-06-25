import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRateLimiter } from "@/lib/rateLimit";

describe("lib/rateLimit — InMemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit then denies with a positive resetMs", async () => {
    const limiter = new InMemoryRateLimiter(3, 60_000);

    const a = await limiter.limit("ip1");
    const b = await limiter.limit("ip1");
    const c = await limiter.limit("ip1");
    const d = await limiter.limit("ip1");

    expect(a).toMatchObject({ allowed: true, remaining: 2 });
    expect(b).toMatchObject({ allowed: true, remaining: 1 });
    expect(c).toMatchObject({ allowed: true, remaining: 0 });
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(d.resetMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000);
    expect((await limiter.limit("ip1")).allowed).toBe(true);
    expect((await limiter.limit("ip1")).allowed).toBe(false);
    // Different IP has its own bucket.
    expect((await limiter.limit("ip2")).allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000);

    expect((await limiter.limit("ip1")).allowed).toBe(true);
    expect((await limiter.limit("ip1")).allowed).toBe(false);

    // Advance past the window.
    vi.setSystemTime(new Date("2026-06-26T12:01:30Z"));
    expect((await limiter.limit("ip1")).allowed).toBe(true);
  });

  it("populates a Retry-After-friendly resetMs under the window", async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000);
    await limiter.limit("ip1");
    const denied = await limiter.limit("ip1");
    expect(denied.resetMs).toBeGreaterThan(0);
    expect(denied.resetMs).toBeLessThanOrEqual(60_000);
  });
});
