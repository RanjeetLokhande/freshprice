/**
 * Fixed-window rate limiter kept in process memory.
 * Enough for one server instance; for several instances swap the store for a
 * shared one (e.g. Upstash Redis) behind the same `hit()` signature.
 */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Records one hit; returns retry-after seconds when over the limit, else null. */
  hit(key: string, rule: RateLimitRule): number | null {
    const now = this.now();
    this.sweep(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return null;
    }
    bucket.count++;
    return bucket.count > rule.limit ? Math.ceil((bucket.resetAt - now) / 1000) : null;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

export const rateLimiter = new RateLimiter();

/** Default for every write request, per user */
export const WRITE_LIMIT: RateLimitRule = { limit: 120, windowMs: 60_000 };
