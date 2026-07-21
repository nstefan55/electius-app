import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Auth rate limiting (rate-limiting-spec): sliding window over Upstash Redis
// (HTTP-based — serverless-safe, no TCP connections to leak on Vercel).
// Fails OPEN by design: missing env or an Upstash outage lets requests through
// — locking every admin out of auth is worse than briefly losing the limiter.

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  /** Unix timestamp (ms) when the current window resets. */
  reset: number;
};

const configured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

function make(redis: Redis, prefix: string, requests: number, window: "15 m" | "1 h") {
  // Separate prefix per action — same identifier (IP) must not share a window
  // across actions.
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `ratelimit:${prefix}`,
  });
}

// One limiter per protected action — limits straight from the spec table.
const limiters = (() => {
  if (!configured) return null;
  const redis = Redis.fromEnv();
  return {
    login: make(redis, "login", 5, "15 m"),
    register: make(redis, "register", 3, "1 h"),
    forgotPassword: make(redis, "forgot-password", 3, "1 h"),
    resetPassword: make(redis, "reset-password", 5, "15 m"),
    resendVerification: make(redis, "resend-verification", 3, "15 m"),
  };
})();

export type RateLimitAction = keyof NonNullable<typeof limiters>;

const OPEN: RateLimitResult = { success: true, remaining: -1, reset: 0 };

/**
 * Check `identifier` (an IP, or "ip:email" for per-account limits) against the
 * action's sliding window. Fails open when Upstash is unconfigured or down.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  identifier: string,
): Promise<RateLimitResult> {
  if (!limiters) return OPEN;
  try {
    const { success, remaining, reset } = await limiters[action].limit(identifier);
    return { success, remaining, reset };
  } catch {
    return OPEN; // ponytail: fail open — an Upstash outage must not block auth
  }
}

/** First hop of x-forwarded-for (set by Vercel); "unknown" when absent (dev). */
export function clientIp(headers: Headers | undefined): string {
  return headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Whole seconds until the window resets — for the Retry-After header. */
export function retryAfterSeconds(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}
