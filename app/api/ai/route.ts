// /api/ai — Folio's server-side Claude proxy, used only by `proxy` mode.
// BYOK/local modes bypass this route entirely and call the provider from the
// browser. Keys never reach the client; document content does pass through this
// server in proxy mode. See docs/plan.md §3.2 and docs/ai-provider-design.md §8.

import {
  ANTHROPIC_MAX_TOKENS,
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildUpstreamBody,
  checkPayload,
  estimateCostUsd,
  estimateTokens,
  getClientIp,
  monthKey,
} from "@/lib/aiProxy";
import { createRateLimiter, type RateLimiter } from "@/lib/rateLimit";
import { createSpendTracker, type SpendTracker } from "@/lib/spend";

// Streaming proxy → inherently dynamic, never prerendered/cached.
export const dynamic = "force-dynamic";
// Mirrors vercel.json; long enough for large-context first-token latency.
export const maxDuration = 60;

// Module-level singletons so rate-limit/spend state persists across requests
// within a warm instance (durable across cold starts only with Upstash configured).
let rateLimiter: RateLimiter = createRateLimiter();
let spendTracker: SpendTracker = createSpendTracker();

/** Test hook: inject fake limiters/trackers so the route is unit-testable. */
export function __setDepsForTests(deps: {
  rateLimiter?: RateLimiter;
  spendTracker?: SpendTracker;
}): void {
  if (deps.rateLimiter) rateLimiter = deps.rateLimiter;
  if (deps.spendTracker) spendTracker = deps.spendTracker;
}

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

export async function POST(req: Request): Promise<Response> {
  // P3.2.9 — minimal auth: optional shared bearer. Skipped in dev when unset.
  const proxyToken = process.env.FOLIO_PROXY_TOKEN;
  if (proxyToken) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${proxyToken}`) {
      return json(401, { error: "Unauthorized" });
    }
  }

  // P3.2.3 — parse + validate payload, guard on estimated tokens.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const payload = checkPayload(body);
  if (!payload.ok) return json(payload.status, { error: payload.error });

  // P3.2.2 — rate limit per client IP (10 req/min).
  const ip = getClientIp(req);
  const rl = await rateLimiter.limit(ip);
  if (!rl.allowed) {
    return json(429, { error: "Rate limit exceeded" }, {
      "retry-after": String(Math.max(1, Math.ceil(rl.resetMs / 1000))),
    });
  }

  // P3.2.9 — hard monthly spend cap (reserve worst-case cost up front so the
  // streaming pipe stays unbuffered; conservative by design).
  const cap = spendTracker.capUsd();
  if (cap > 0) {
    const month = monthKey();
    const inputTokens = payload.tokens + estimateTokens(payload.system);
    const projected = estimateCostUsd(inputTokens, ANTHROPIC_MAX_TOKENS);
    const current = await spendTracker.currentSpend(month);
    if (current + projected > cap) {
      return json(429, { error: "Monthly spend cap reached" });
    }
    await spendTracker.charge(month, projected);
  }

  // P3.2.4 — server-side key only; never echoed to the response or logs.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: "AI proxy not configured" });
  }

  // P3.2.5 — forward to Anthropic with streaming enabled.
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(buildUpstreamBody(payload.messages, payload.system)),
  });

  // P3.2.8 — non-2xx upstream response: pass the status + body through unchanged.
  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.body, { status: upstream.status });
  }

  // P3.2.6 + P3.2.7 — pipe the SSE stream straight through, no buffering.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
