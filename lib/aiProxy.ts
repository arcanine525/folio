// Pure helpers for the /api/ai proxy route (P3.2). Kept side-effect free so they
// are unit-testable without spinning up the server. See docs/plan.md §3.2.

import type { AIMessage } from "@/types";

/** Anthropic Messages API endpoint (server-side only). */
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
/** Default model for `proxy` mode. */
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
/** Default output token ceiling. */
export const ANTHROPIC_MAX_TOKENS = 4096;
/** Anthropic API version header value. */
export const ANTHROPIC_VERSION = "2023-06-01";

/** Proxy rate limit: requests per window per IP. */
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Reject input above this many estimated tokens (payload guard). */
export const MAX_INPUT_TOKENS = 150_000;

// Approximate Claude Sonnet-family pricing (USD per 1M tokens). Used ONLY for the
// hard monthly spend cap — not billing. Verify against current Anthropic pricing.
export const COST_INPUT_PER_MTOK = 3;
export const COST_OUTPUT_PER_MTOK = 15;

/** Rough token estimate ≈ chars / 4, matching the P3.2.3 payload guard. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Best-effort USD cost of a request, given estimated input + output tokens. */
export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * COST_OUTPUT_PER_MTOK
  );
}

export type PayloadCheck =
  | { ok: true; messages: AIMessage[]; system: string; tokens: number }
  | { ok: false; status: number; error: string };

function isAIMessage(v: unknown): v is AIMessage {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
}

/**
 * Validate the proxy request shape and enforce the token cap. Never throws.
 * - 400 on malformed body / messages
 * - 413 when estimated tokens exceed {@link MAX_INPUT_TOKENS}
 */
export function checkPayload(body: unknown): PayloadCheck {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, error: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;

  if (b.system !== undefined && typeof b.system !== "string") {
    return { ok: false, status: 400, error: "`system` must be a string" };
  }
  const system = typeof b.system === "string" ? b.system : "";

  if (!Array.isArray(b.messages) || !b.messages.every(isAIMessage)) {
    return {
      ok: false,
      status: 400,
      error: "`messages` must be an array of { role: 'user'|'assistant', content: string }",
    };
  }

  const tokens = estimateTokens(JSON.stringify(b.messages));
  if (tokens > MAX_INPUT_TOKENS) {
    return {
      ok: false,
      status: 413,
      error: `Payload too large (${tokens} tokens > ${MAX_INPUT_TOKENS})`,
    };
  }

  return { ok: true, messages: b.messages as AIMessage[], system, tokens };
}

/** Body forwarded to the Anthropic Messages API (streaming). */
export function buildUpstreamBody(
  messages: AIMessage[],
  system: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    stream: true,
    messages,
  };
  // Anthropic accepts an empty system string, but omitting is cleaner.
  if (system) body.system = system;
  return body;
}

/** Current UTC month key, e.g. "2026-06", used for the monthly spend ledger. */
export function monthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** Extract the client IP for rate-limit keying (first hop of x-forwarded-for). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
