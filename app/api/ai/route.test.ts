import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, __setDepsForTests } from "@/app/api/ai/route";
import { ANTHROPIC_MODEL, ANTHROPIC_URL } from "@/lib/aiProxy";
import type { RateLimiter } from "@/lib/rateLimit";
import type { SpendTracker } from "@/lib/spend";
import type { AIMessage } from "@/types";

const msgs: AIMessage[] = [{ role: "user", content: "summarize this" }];

const allowLimiter: RateLimiter = {
  limit: async () => ({ allowed: true, remaining: 9, resetMs: 60_000 }),
};
const denyLimiter: RateLimiter = {
  limit: async () => ({ allowed: false, remaining: 0, resetMs: 5_000 }),
};

function makeSpend(cap: number, current = 0): SpendTracker {
  let spent = current;
  return {
    currentSpend: async () => spent,
    charge: async (_month: string, usd: number) => {
      spent += usd;
    },
    capUsd: () => cap,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function buildReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("app/api/ai route", () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    __setDepsForTests({ rateLimiter: allowLimiter, spendTracker: makeSpend(0) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("streams a 200 SSE response and forwards the body to Anthropic", async () => {
    fetchMock.mockResolvedValue(
      new Response("event: message_start\ndata: {}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const res = await POST(buildReq({ messages: msgs, system: "be brief" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(await res.text()).toContain("message_start");

    // Forwarded request shape.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_URL);
    const fwd = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(fwd).toMatchObject({ model: ANTHROPIC_MODEL, stream: true, system: "be brief" });
    expect(fwd.messages).toEqual(msgs);
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await POST(buildReq("{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when messages is missing or malformed", async () => {
    const res = await POST(buildReq({ system: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when the payload exceeds the token cap", async () => {
    const huge: AIMessage[] = [{ role: "user", content: "x".repeat(600_005) }];
    const res = await POST(buildReq({ messages: huge }));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the rate limit is exceeded", async () => {
    __setDepsForTests({ rateLimiter: denyLimiter });
    const res = await POST(buildReq({ messages: msgs }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the projected spend exceeds the monthly cap", async () => {
    // Tiny cap so even a minimal request's worst-case projection trips it.
    __setDepsForTests({ spendTracker: makeSpend(0.0001) });
    const res = await POST(buildReq({ messages: msgs }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/spend cap/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when FOLIO_PROXY_TOKEN is set but the bearer is missing", async () => {
    vi.stubEnv("FOLIO_PROXY_TOKEN", "secret-token");
    const res = await POST(buildReq({ messages: msgs }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is wrong", async () => {
    vi.stubEnv("FOLIO_PROXY_TOKEN", "secret-token");
    const res = await POST(
      buildReq({ messages: msgs }, { authorization: "Bearer wrong" }),
    );
    expect(res.status).toBe(401);
  });

  it("lets a correct bearer through to the upstream", async () => {
    vi.stubEnv("FOLIO_PROXY_TOKEN", "secret-token");
    fetchMock.mockResolvedValue(new Response("data: {}\n\n", { status: 200 }));
    const res = await POST(
      buildReq({ messages: msgs }, { authorization: "Bearer secret-token" }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when ANTHROPIC_API_KEY is not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await POST(buildReq({ messages: msgs }));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a non-2xx upstream status through unchanged (P3.2.8)", async () => {
    fetchMock.mockResolvedValue(new Response("overloaded", { status: 529 }));
    const res = await POST(buildReq({ messages: msgs }));
    expect(res.status).toBe(529);
    expect(await res.text()).toBe("overloaded");
  });
});
