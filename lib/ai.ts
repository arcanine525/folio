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

import type { AIMessage, AIScope, ApiDialect, FSNode, ProviderConfig } from "@/types";
import * as opfs from "@/lib/opfs";

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

// ── Scope context builder (P3.6) ───────────────────────────────────────────
// Gathers document text for a scope (file / folder / all) so the AI operates on
// the right amount of surrounding context. Kept in lib/ai.ts alongside the
// streaming engine; both are pure-ish libs over OPFS / fetch.

/** Above this many estimated tokens, callers should warn the user before sending. */
export const CONTEXT_TOKEN_WARNING = 100_000;

export interface BuiltContext {
  /** Joined document text fed to the model. */
  content: string;
  /** Rough token estimate (chars / 4). */
  tokens: number;
  /** Number of files actually included. */
  fileCount: number;
  /** True when `tokens` exceeds {@link CONTEXT_TOKEN_WARNING}. */
  overLimit: boolean;
}

/** Rough token estimate ≈ chars / 4, matching the proxy payload guard. */
export function estimateContextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Flatten a tree into a sorted list of `.md` file paths (depth-first). */
function collectMdPaths(nodes: FSNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push(...collectMdPaths(node.children ?? []));
    } else if (node.name.endsWith(".md")) {
      out.push(node.path);
    }
  }
  return out;
}

/** Parent folder path of a file path ("" for a root-level file). */
function parentDir(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Last path segment (the file name). */
function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** True if `path` lives under directory `dir` (a subtree match). */
function isUnder(path: string, dir: string): boolean {
  return dir === "" ? !path.includes("/") : path.startsWith(`${dir}/`);
}

/** Read a file, returning "" on any error so one missing file never aborts the build. */
async function safeRead(path: string): Promise<string> {
  try {
    return await opfs.readFile(path);
  } catch {
    return "";
  }
}

/**
 * Build the document context for a scope.
 *
 * - `file`   → the active file's raw contents (no heading/separator).
 * - `folder` → every `.md` file under the active file's parent folder. If the
 *   active file is at the root, only other root-level files are included (so
 *   `folder` never collapses to the whole vault).
 * - `all`    → every `.md` file in the vault.
 *
 * For multi-file scopes each file is prefixed with a `# filename` heading and
 * blocks are separated by `---`. Returns a token estimate + an `overLimit` flag
 * so the caller can warn the user before an oversized send (P3.6.5).
 */
export async function buildContext(
  scope: AIScope,
  activeFileId: string | null,
): Promise<BuiltContext> {
  if (scope === "file") {
    const content = activeFileId ? await safeRead(activeFileId) : "";
    const tokens = estimateContextTokens(content);
    return { content, tokens, fileCount: content ? 1 : 0, overLimit: tokens > CONTEXT_TOKEN_WARNING };
  }

  const paths = collectMdPaths(await opfs.listTree()).filter((p) =>
    scope === "all" ? true : activeFileId ? isUnder(p, parentDir(activeFileId)) : false,
  );

  const parts: string[] = [];
  for (const path of paths) {
    const body = await safeRead(path);
    if (body) parts.push(`# ${basename(path)}\n\n${body}`);
  }

  const content = parts.join("\n\n---\n\n");
  const tokens = estimateContextTokens(content);
  return { content, tokens, fileCount: parts.length, overLimit: tokens > CONTEXT_TOKEN_WARNING };
}
