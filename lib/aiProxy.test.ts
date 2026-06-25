import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_MAX_TOKENS,
  ANTHROPIC_MODEL,
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildUpstreamBody,
  checkPayload,
  estimateCostUsd,
  estimateTokens,
  getClientIp,
  MAX_INPUT_TOKENS,
  monthKey,
} from "@/lib/aiProxy";
import type { AIMessage } from "@/types";

const msgs: AIMessage[] = [{ role: "user", content: "hello world" }];

describe("lib/aiProxy", () => {
  describe("estimateTokens", () => {
    it("estimates tokens as ceil(chars / 4)", () => {
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("ab")).toBe(1); // ceil(2/4)
      expect(estimateTokens("abcd")).toBe(1); // ceil(4/4)
      expect(estimateTokens("abcde")).toBe(2); // ceil(5/4)
    });
  });

  describe("estimateCostUsd", () => {
    it("sums input + output cost at the documented rates", () => {
      const cost = estimateCostUsd(1_000_000, 1_000_000);
      // 3/M input + 15/M output.
      expect(cost).toBeCloseTo(18, 5);
    });

    it("scales linearly with token counts", () => {
      const small = estimateCostUsd(1000, 0);
      expect(small).toBeCloseTo(0.003, 5);
    });
  });

  describe("checkPayload", () => {
    it("accepts a well-formed body and reports estimated message tokens", () => {
      const res = checkPayload({ messages: msgs, system: "be brief" });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.system).toBe("be brief");
        expect(res.messages).toEqual(msgs);
        expect(res.tokens).toBe(estimateTokens(JSON.stringify(msgs)));
      }
    });

    it("defaults system to '' when omitted", () => {
      const res = checkPayload({ messages: msgs });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.system).toBe("");
    });

    it("rejects a non-array messages field with 400", () => {
      const res = checkPayload({ messages: "nope" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(400);
    });

    it("rejects a message with an invalid role with 400", () => {
      const res = checkPayload({ messages: [{ role: "system", content: "x" }] });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(400);
    });

    it("rejects a non-string system with 400", () => {
      const res = checkPayload({ messages: msgs, system: 42 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(400);
    });

    it("rejects a non-object body with 400", () => {
      expect(checkPayload(null).ok).toBe(false);
      expect(checkPayload("string").ok).toBe(false);
    });

    it(`returns 413 when estimated tokens exceed ${MAX_INPUT_TOKENS}`, () => {
      // Need > 600k chars so chars/4 > 150k.
      const huge: AIMessage[] = [{ role: "user", content: "x".repeat(MAX_INPUT_TOKENS * 4 + 4) }];
      const res = checkPayload({ messages: huge });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(413);
    });
  });

  describe("buildUpstreamBody", () => {
    it("shapes the streaming Anthropic request", () => {
      const body = buildUpstreamBody(msgs, "sys");
      expect(body).toMatchObject({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        stream: true,
        system: "sys",
        messages: msgs,
      });
    });

    it("omits system when empty", () => {
      const body = buildUpstreamBody(msgs, "");
      expect(body).not.toHaveProperty("system");
      expect(body.stream).toBe(true);
    });
  });

  describe("monthKey", () => {
    it("returns a YYYY-MM UTC key", () => {
      expect(monthKey(new Date("2026-06-26T23:59:00Z"))).toBe("2026-06");
      expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    });
  });

  describe("getClientIp", () => {
    it("takes the first hop of x-forwarded-for", () => {
      const req = new Request("https://x/api/ai", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("falls back to x-real-ip", () => {
      const req = new Request("https://x/api/ai", {
        headers: { "x-real-ip": "9.9.9.9" },
      });
      expect(getClientIp(req)).toBe("9.9.9.9");
    });

    it("falls back to 'unknown'", () => {
      const req = new Request("https://x/api/ai");
      expect(getClientIp(req)).toBe("unknown");
    });
  });

  describe("constants", () => {
    it("targets the Anthropic Messages endpoint", () => {
      expect(ANTHROPIC_URL).toBe("https://api.anthropic.com/v1/messages");
      expect(ANTHROPIC_MODEL).toBe("claude-sonnet-4-6");
      expect(ANTHROPIC_MAX_TOKENS).toBe(4096);
      expect(ANTHROPIC_VERSION).toBe("2023-06-01");
    });
  });
});
