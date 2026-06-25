import { describe, expect, it } from "vitest";
import { InMemorySpendTracker } from "@/lib/spend";

describe("lib/spend — InMemorySpendTracker", () => {
  it("reports zero spend initially", async () => {
    const t = new InMemorySpendTracker(10);
    await expect(t.currentSpend("2026-06")).resolves.toBe(0);
  });

  it("accrues charges within a month", async () => {
    const t = new InMemorySpendTracker(10);
    await t.charge("2026-06", 0.05);
    await t.charge("2026-06", 0.03);
    await expect(t.currentSpend("2026-06")).resolves.toBeCloseTo(0.08, 5);
  });

  it("tracks months independently", async () => {
    const t = new InMemorySpendTracker(10);
    await t.charge("2026-06", 1);
    await t.charge("2026-07", 2);
    await expect(t.currentSpend("2026-06")).resolves.toBe(1);
    await expect(t.currentSpend("2026-07")).resolves.toBe(2);
  });

  it("exposes its configured cap (0 = disabled)", () => {
    expect(new InMemorySpendTracker(5).capUsd()).toBe(5);
    expect(new InMemorySpendTracker().capUsd()).toBe(0);
  });
});
