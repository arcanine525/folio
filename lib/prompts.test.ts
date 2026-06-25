import { describe, expect, it } from "vitest";
import { PROMPT_KEYS, PROMPTS, SYSTEM_BASE } from "@/lib/prompts";

describe("prompts", () => {
  it("exposes a non-empty shared base prompt", () => {
    expect(typeof SYSTEM_BASE).toBe("string");
    expect(SYSTEM_BASE.trim().length).toBeGreaterThan(0);
  });

  it("defines exactly the six task keys", () => {
    expect(PROMPT_KEYS).toEqual([
      "Action items",
      "Decisions",
      "Questions",
      "Timeline",
      "Summary",
      "Next steps",
    ]);
  });

  it("every prompt value is the base instruction extended with a task", () => {
    for (const key of PROMPT_KEYS) {
      const value = PROMPTS[key];
      expect(typeof value).toBe("string");
      // Each full prompt begins with the shared base, then a task instruction.
      expect(value.startsWith(SYSTEM_BASE)).toBe(true);
      // The task-specific tail must add non-whitespace content beyond the base.
      expect(value.trim().length).toBeGreaterThan(SYSTEM_BASE.trim().length);
    }
  });

  it("each key maps to a unique prompt (no two tasks share identical text)", () => {
    const values = PROMPT_KEYS.map((k) => PROMPTS[k]);
    expect(new Set(values).size).toBe(values.length);
  });

  it("lookups on unknown keys are undefined (no accidental collision)", () => {
    expect(PROMPTS["Action items"]).toBeDefined();
    expect(PROMPTS["nonexistent"]).toBeUndefined();
  });
});
