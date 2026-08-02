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
    // OTP code-guessing guard (otp-implementation-auth-spec §6) — the rate
    // layer above the emailOTP plugin's per-code allowedAttempts; keyed
    // IP+email like the send limit.
    verifyOtp: make(redis, "verify-otp", 10, "15 m"),
    // Voter flow (voter-flow-spec): these deter junk load, not brute force —
    // tokens are 256-bit and single-use. The vote limit is per IP and must
    // survive a campus-NAT voting session (many voters, one public IP), hence
    // 30 not 10; resend is keyed IP+email so it stays tight.
    vote: make(redis, "vote", 30, "15 m"),
    resendVoteLink: make(redis, "resend-vote-link", 3, "15 m"),
    // PDF izvještaj (election-report-storage-spec §10): svaki render pokreće
    // preglednik, pa je petlja po 20 izbora pravi novac. Ključ je IP+korisnik.
    // I brzi put (posluživanje spremljenog objekta) troši kvotu — jednostavnije,
    // a 10 preuzimanja u 15 minuta je za čovjeka ionako široko.
    reportRender: make(redis, "report-render", 10, "15 m"),
    // Slanje potvrde o brisanju računa (profile-settings-phase-4-spec §5).
    // Isti prozor kao zaboravljena lozinka: jedan namjeran zahtjev po sesiji,
    // sve preko toga je bombardiranje sandučića. Poveznica u pošti nije
    // ograničena — token je nepogodiv i jednokratan, a limit bi rušio legitiman
    // ponovni klik na jedinom koraku koji brisanje uopće izvršava.
    deleteAccount: make(redis, "delete-account", 3, "1 h"),
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
