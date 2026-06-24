/**
 * Simple in-memory sliding-window rate limiter for Next.js API routes.
 * Note: in-memory limits reset on server restart and do not coordinate across
 * multiple serverless instances. For production scaling, move to Redis or a
 * Vercel/edge-native store.
 */

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export class RateLimiter {
  private requests = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let timestamps = this.requests.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0];
      const retryAfter = Math.ceil((oldest + this.windowMs - now) / 1000);
      return { ok: false, retryAfter };
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);
    return { ok: true };
  }
}

export function getClientIp(req: { headers: Headers; ip?: string | null }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.ip ?? "unknown";
}
