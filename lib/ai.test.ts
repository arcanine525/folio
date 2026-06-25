import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, parseStream, streamAI, ANTHROPIC_VERSION } from "@/lib/ai";
import type { AIMessage, ProviderConfig } from "@/types";

const msgs: AIMessage[] = [{ role: "user", content: "hi" }];

function provider(partial: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: "test",
    label: "Test",
    mode: "byok",
    dialect: "anthropic",
    baseUrl: "https://example.com",
    model: "m",
    maxTokens: 1024,
    ...partial,
  };
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

/** Drain a generator to completion without binding its (unused) values. */
async function drain(gen: AsyncGenerator<string>): Promise<void> {
  for (;;) {
    const { done } = await gen.next();
    if (done) break;
  }
}

// ── buildRequest: all 6 mode × dialect cells ──────────────────────────────
describe("buildRequest", () => {
  it("proxy/anthropic → /api/ai, no auth header, body = {messages, system}", () => {
    const r = buildRequest(provider({ mode: "proxy", dialect: "anthropic" }), undefined, msgs, "sys");
    expect(r.url).toBe("/api/ai");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.headers).not.toHaveProperty("x-api-key");
    expect(r.headers).not.toHaveProperty("authorization");
    expect(JSON.parse(r.body)).toEqual({ messages: msgs, system: "sys" });
  });

  it("proxy ignores dialect entirely (openai dialect still routes to /api/ai)", () => {
    const r = buildRequest(provider({ mode: "proxy", dialect: "openai" }), "ignored-key", msgs, "");
    expect(r.url).toBe("/api/ai");
    // proxy never sends a key from the browser
    expect(r.headers).not.toHaveProperty("authorization");
    expect(r.headers).not.toHaveProperty("x-api-key");
  });

  it("byok/anthropic → /v1/messages with x-api-key, version, browser-access; top-level system", () => {
    const r = buildRequest(
      provider({ mode: "byok", dialect: "anthropic", baseUrl: "https://api.anthropic.com" }),
      "sk-1",
      msgs,
      "sys",
    );
    expect(r.url).toBe("https://api.anthropic.com/v1/messages");
    expect(r.headers["x-api-key"]).toBe("sk-1");
    expect(r.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(r.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(r.headers).not.toHaveProperty("authorization");
    const body = JSON.parse(r.body) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "m", max_tokens: 1024, stream: true, system: "sys" });
    expect(body.messages).toEqual(msgs);
  });

  it("byok/openai → /chat/completions with Bearer; system folded into a leading message", () => {
    const r = buildRequest(
      provider({ mode: "byok", dialect: "openai", baseUrl: "https://api.openai.com/v1" }),
      "sk-1",
      msgs,
      "sys",
    );
    expect(r.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(r.headers["authorization"]).toBe("Bearer sk-1");
    expect(r.headers).not.toHaveProperty("x-api-key");
    const body = JSON.parse(r.body) as { messages: AIMessage[] };
    expect(body.messages[0]).toEqual({ role: "user", content: "sys" });
    expect(body.messages.slice(1)).toEqual(msgs);
  });

  it("local/anthropic (keyless) → omits the auth header", () => {
    const r = buildRequest(
      provider({ mode: "local", dialect: "anthropic", baseUrl: "http://localhost:8080" }),
      undefined,
      msgs,
      "sys",
    );
    expect(r.url).toBe("http://localhost:8080/v1/messages");
    expect(r.headers).not.toHaveProperty("x-api-key");
    expect(r.headers).not.toHaveProperty("authorization");
  });

  it("local/openai (keyless, empty system) → no leading system message, no auth", () => {
    const r = buildRequest(
      provider({ mode: "local", dialect: "openai", baseUrl: "http://localhost:11434/v1" }),
      undefined,
      msgs,
      "",
    );
    expect(r.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(r.headers).not.toHaveProperty("authorization");
    expect((JSON.parse(r.body) as { messages: AIMessage[] }).messages).toEqual(msgs);
  });

  it("local with an optional key still sends it", () => {
    const r = buildRequest(
      provider({ mode: "local", dialect: "anthropic", baseUrl: "http://localhost:8080" }),
      "loc-key",
      msgs,
      "sys",
    );
    expect(r.headers["x-api-key"]).toBe("loc-key");
  });

  it("trims a trailing slash from baseUrl", () => {
    const r = buildRequest(
      provider({ mode: "byok", dialect: "openai", baseUrl: "https://api.openai.com/v1/" }),
      "k",
      msgs,
      "",
    );
    expect(r.url).toBe("https://api.openai.com/v1/chat/completions");
  });
});

// ── parseStream: shared SSE buffering across dialects ──────────────────────
describe("parseStream", () => {
  it("extracts anthropic content_block_delta text and stops on [DONE]", async () => {
    const sse = [
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"text":"Hello"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"text":" world"}}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join("\n");
    const out = await collect(parseStream("anthropic", streamFromChunks([sse]).getReader()));
    expect(out).toEqual(["Hello", " world"]);
  });

  it("extracts openai choices[0].delta.content", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":" there"}}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join("\n");
    const out = await collect(parseStream("openai", streamFromChunks([sse]).getReader()));
    expect(out).toEqual(["Hi", " there"]);
  });

  it("handles a line split across two chunks", async () => {
    const chunks = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"Hel',
      'lo"}}\n\ndata: [DONE]\n\n',
    ];
    const out = await collect(parseStream("anthropic", streamFromChunks(chunks).getReader()));
    expect(out).toEqual(["Hello"]);
  });

  it("skips malformed JSON data lines without throwing", async () => {
    const sse = [
      'data: {not valid json',
      'data: {"type":"content_block_delta","delta":{"text":"ok"}}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join("\n");
    const out = await collect(parseStream("anthropic", streamFromChunks([sse]).getReader()));
    expect(out).toEqual(["ok"]);
  });

  it("ignores anthropic non-text events (message_start etc.)", async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{}}',
      '',
      'data: {"type":"content_block_delta","delta":{"text":"x"}}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join("\n");
    const out = await collect(parseStream("anthropic", streamFromChunks([sse]).getReader()));
    expect(out).toEqual(["x"]);
  });

  it("ignores non-data lines (event: / comments)", async () => {
    const sse = ': keep-alive\n\nevent: ping\n\n';
    const out = await collect(parseStream("openai", streamFromChunks([sse]).getReader()));
    expect(out).toEqual([]);
  });
});

// ── streamAI: end-to-end through a mocked fetch ────────────────────────────
describe("streamAI", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams deltas from a byok/anthropic provider", async () => {
    const sse =
      'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\ndata: [DONE]\n\n';
    fetchMock.mockResolvedValue(new Response(streamFromChunks([sse]), { status: 200 }));

    const out: string[] = [];
    for await (const d of streamAI(msgs, "sys", provider({ mode: "byok", dialect: "anthropic" }), "k")) {
      out.push(d);
    }
    expect(out).toEqual(["Hi"]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
  });

  it("streams deltas from the proxy route (anthropic SSE)", async () => {
    const sse =
      'data: {"type":"content_block_delta","delta":{"text":"proxy"}}\n\ndata: [DONE]\n\n';
    fetchMock.mockResolvedValue(new Response(streamFromChunks([sse]), { status: 200 }));

    const out: string[] = [];
    for await (const d of streamAI(msgs, "sys", provider({ mode: "proxy", dialect: "anthropic" }))) {
      out.push(d);
    }
    expect(out).toEqual(["proxy"]);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/ai");
  });

  it("throws with the status code when the response is not ok", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      drain(streamAI(msgs, "", provider({ mode: "byok", dialect: "anthropic" }), "k")),
    ).rejects.toThrow(/500/);
  });

  it("throws when the response body is missing", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      drain(streamAI(msgs, "", provider({ mode: "byok", dialect: "anthropic" }), "k")),
    ).rejects.toThrow(/AI request failed/);
  });
});
