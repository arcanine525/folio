// Folio — provider-agnostic streaming AI client (P3.4).
//
// One async-generator interface, `streamAI`, hides the two-axis provider model
// (`mode` × `dialect`). Callers hand it messages + system prompt + a resolved
// ProviderConfig and consume plain-text deltas — they never see the wire format.
//
//   mode proxy   → POST /api/ai (Folio server → Claude). Key stays server-side.
//   mode byok    → call provider directly from the browser with the user's key.
//   mode local   → same as byok, but the auth header is omitted when keyless.
//
// dialect anthropic → /v1/messages, top-level `system`, SSE content_block_delta.
// dialect openai    → /chat/completions, system folded into a leading message,
//                     SSE choices[0].delta.content.
//
// See docs/ai-provider-design.md §2–§3 and docs/plan.md §3.4.

import type { AIMessage, ApiDialect, ProviderConfig } from "@/types";

/** Anthropic Messages API version header value. */
export const ANTHROPIC_VERSION = "2023-06-01";

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Strip a single trailing slash so `${baseUrl}/v1/messages` never doubles it. */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Build the fetch request for a provider. Branches on `mode` first, then
 * `dialect`. Pure & synchronous — exported so the 6 `mode × dialect` cells can
 * be unit-tested without any network.
 */
export function buildRequest(
  provider: ProviderConfig,
  apiKey: string | undefined,
  messages: AIMessage[],
  system: string,
): BuiltRequest {
  // Proxy mode: route through Folio's server. No key in the browser; the server
  // adds its own Anthropic key. Body is the raw { messages, system } the proxy
  // validates (see lib/aiProxy.checkPayload). Dialect is irrelevant here.
  if (provider.mode === "proxy") {
    return {
      url: "/api/ai",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, system }),
    };
  }

  // byok / local — speak the provider's dialect directly from the browser.
  if (provider.dialect === "anthropic") {
    const url = `${trimBase(provider.baseUrl)}/v1/messages`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      // Required to call Anthropic from a browser with a user-supplied key.
      "anthropic-dangerous-direct-browser-access": "true",
    };
    if (apiKey) headers["x-api-key"] = apiKey;

    const body: Record<string, unknown> = {
      model: provider.model,
      max_tokens: provider.maxTokens,
      stream: true,
      messages,
    };
    if (system) body.system = system;

    return { url, headers, body: JSON.stringify(body) };
  }

  // OpenAI dialect — fold the system prompt into a leading system message.
  const url = `${trimBase(provider.baseUrl)}/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;

  const withSystem: AIMessage[] = system
    ? [{ role: "user", content: system }, ...messages]
    : messages;
  const body = {
    model: provider.model,
    max_tokens: provider.maxTokens,
    stream: true,
    messages: withSystem,
  };
  return { url, headers, body: JSON.stringify(body) };
}

/** Pull the text delta out of one SSE `data:` payload, per dialect. */
function extractDelta(dialect: ApiDialect, data: string): string {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return ""; // skip malformed JSON lines (P3.4.7)
  }
  if (json == null || typeof json !== "object") return "";

  if (dialect === "anthropic") {
    const evt = json as { type?: string; delta?: { text?: string } };
    // content_block_delta carries the incremental text; other event types
    // (message_start, message_delta, …) carry no text.
    if (evt.type === "content_block_delta" && typeof evt.delta?.text === "string") {
      return evt.delta.text;
    }
    return "";
  }

  // OpenAI: choices[0].delta.content
  const evt = json as { choices?: Array<{ delta?: { content?: string } }> };
  return evt.choices?.[0]?.delta?.content ?? "";
}

/**
 * Shared SSE parser. Reads the stream, buffers partial lines (a chunk can split
 * a line mid-way), extracts `data:` payloads, stops on `[DONE]`, and yields
 * per-dialect text deltas. Malformed JSON payloads are skipped, never thrown.
 */
export async function* parseStream(
  dialect: ApiDialect,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  const processLine = function* (rawLine: string): Generator<string> {
    const line = rawLine.trim();
    if (!line || !line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    const delta = extractDelta(dialect, data);
    if (delta) yield delta;
  };

  // Returns true once a `[DONE]` sentinel has been processed (stop signal).
  const appendChunk = function* (chunk: string): Generator<string> {
    buffer += chunk;
    const lines = buffer.split("\n");
    // Keep the final (possibly partial) segment back in the buffer.
    buffer = lines.pop() ?? "";
    for (const line of lines) yield* processLine(line);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield* appendChunk(decoder.decode(value, { stream: true }));
  }
  // Flush any trailing line still in the buffer.
  if (buffer.trim()) yield* processLine(buffer);
}

/**
 * Stream text deltas from the active provider as an async generator.
 *
 * Throws on a non-ok response or missing body — the status code is embedded in
 * the message so callers (e.g. useAI) can surface it. Honours an AbortSignal so
 * the caller can cancel mid-stream.
 */
export async function* streamAI(
  messages: AIMessage[],
  system: string,
  provider: ProviderConfig,
  apiKey?: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const { url, headers, body } = buildRequest(provider, apiKey, messages, system);
  const res = await fetch(url, { method: "POST", headers, body, signal });

  if (!res.ok || !res.body) {
    throw new Error(`AI request failed (${res.status})`);
  }

  yield* parseStream(provider.dialect, res.body.getReader());
}
