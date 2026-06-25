// Monthly spend tracking for the /api/ai proxy route (P3.2.9 hard cap).
// Like the rate limiter, durability requires a backing store in production: an
// in-memory ledger resets on every serverless cold start. The factory picks
// Upstash when UPSTASH_* env vars are set, in-memory otherwise. See docs/plan.md §3.2.

import { Redis } from "@upstash/redis";

export interface SpendTracker {
  /** USD spent so far this month (0 when nothing charged yet). */
  currentSpend(monthKey: string): Promise<number>;
  /** Charge `usd` against this month's ledger. */
  charge(monthKey: string, usd: number): Promise<void>;
  /** Monthly cap in USD; 0 disables the cap. */
  capUsd(): number;
}

/** In-memory monthly ledger. NOT durable across cold starts (dev/tests). */
export class InMemorySpendTracker implements SpendTracker {
  private ledger = new Map<string, number>();

  constructor(private readonly cap = 0) {}

  async currentSpend(monthKey: string): Promise<number> {
    return this.ledger.get(monthKey) ?? 0;
  }

  async charge(monthKey: string, usd: number): Promise<void> {
    this.ledger.set(monthKey, (this.ledger.get(monthKey) ?? 0) + usd);
  }

  capUsd(): number {
    return this.cap;
  }
}

/** Durable monthly ledger backed by Upstash Redis. */
export class UpstashSpendTracker implements SpendTracker {
  private redis: Redis;

  constructor(url: string, token: string, private readonly cap = 0) {
    this.redis = new Redis({ url, token });
  }

  private key(monthKey: string): string {
    return `folio:spend:${monthKey}`;
  }

  async currentSpend(monthKey: string): Promise<number> {
    const v = await this.redis.get<number>(this.key(monthKey));
    return typeof v === "number" ? v : 0;
  }

  async charge(monthKey: string, usd: number): Promise<void> {
    await this.redis.incrbyfloat(this.key(monthKey), usd);
  }

  capUsd(): number {
    return this.cap;
  }
}

/**
 * Pick the spend tracker from env. Reads `FOLIO_MONTHLY_SPEND_CAP_USD` for the
 * cap (0/disabled when unset). Upstash-backed when `UPSTASH_*` are configured.
 */
export function createSpendTracker(): SpendTracker {
  const capRaw = process.env.FOLIO_MONTHLY_SPEND_CAP_USD;
  const parsed = capRaw ? Number(capRaw) : 0;
  const cap = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashSpendTracker(url, token, cap);
  return new InMemorySpendTracker(cap);
}
