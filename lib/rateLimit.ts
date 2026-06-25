// Rate limiting for the /api/ai proxy route (P3.2.2).
// A durable backing store (Upstash/Vercel KV) is required in production: an
// in-memory Map resets on every serverless cold start, which is effectively no
// limit. The factory picks Upstash when UPSTASH_* env vars are set and falls
// back to an in-memory limiter for dev/tests. See docs/plan.md §3.2.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "@/lib/aiProxy";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** ms until the limit resets (used for the Retry-After header). */
  resetMs: number;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

/** In-memory fixed-window limiter. NOT durable across cold starts (dev/tests). */
export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = RATE_LIMIT_MAX,
    private readonly windowMs = RATE_LIMIT_WINDOW_MS,
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    let bucket = this.hits.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, bucket);
    }
    if (bucket.count < this.max) {
      bucket.count++;
      return {
        allowed: true,
        remaining: this.max - bucket.count,
        resetMs: bucket.resetAt - now,
      };
    }
    return { allowed: false, remaining: 0, resetMs: bucket.resetAt - now };
  }
}

/** Durable sliding-window limiter backed by Upstash Redis. */
export class UpstashRateLimiter implements RateLimiter {
  private rl: Ratelimit;

  constructor(url: string, token: string, limit = RATE_LIMIT_MAX) {
    const redis = new Redis({ url, token });
    this.rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, "1 m"),
      prefix: "folio:rl",
      analytics: false,
    });
  }

  async limit(key: string): Promise<RateLimitResult> {
    const { success, remaining, reset } = await this.rl.limit(key);
    return {
      allowed: success,
      remaining,
      resetMs: Math.max(0, reset - Date.now()),
    };
  }
}

/**
 * Pick the rate limiter from env. Upstash when configured, in-memory otherwise.
 * Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in production.
 */
export function createRateLimiter(): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashRateLimiter(url, token);
  return new InMemoryRateLimiter();
}
