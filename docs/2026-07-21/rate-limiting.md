# Rate Limiting for Auth

Sliding-window rate limiting on all authentication endpoints, backed by Upstash Redis (HTTP-based — serverless-safe on Vercel). Stops brute force, credential stuffing, and abuse of the email-sending flows.

## What's protected

| Endpoint | Limit | Window | Key |
| --- | --- | --- | --- |
| `POST /api/auth/sign-in/email` (login) | 5 | 15 min | IP + email |
| `POST /api/auth/register` | 3 | 1 h | IP |
| `POST /api/auth/request-password-reset` | 3 | 1 h | IP |
| `POST /api/auth/reset-password` | 5 | 15 min | IP |
| `POST /api/auth/send-verification-email` | 3 | 15 min | IP + email |

Over the limit → **429** with a `Retry-After` header (seconds) and a JSON body: `{ "code": "RATE_LIMITED", "message": "Too many attempts. Please try again in X minutes." }` (the register route uses its `{ success: false, error: "rate_limited", message }` shape instead).

## How it works

**`src/lib/rate-limit.ts`** — the reusable utility (`server-only`):

- One `Ratelimit` instance per action, `Ratelimit.slidingWindow(...)`, each with its own Redis key prefix (`ratelimit:login`, `ratelimit:register`, …) so the same IP never shares a window across actions.
- `checkRateLimit(action, identifier)` → `{ success, remaining, reset }`.
- `clientIp(headers)` — first hop of `x-forwarded-for` (Vercel sets it; `"unknown"` fallback).
- `retryAfterSeconds(reset)` — for the `Retry-After` header.
- **Fails open**: missing env vars or an Upstash outage returns `success: true`. Locking every admin out of auth is worse than briefly losing the limiter. This also means the failure is silent — if limiting matters in an incident, check the env vars first.

**`src/lib/auth/index.ts`** — four of the five endpoints are virtual paths inside BetterAuth's `/api/auth/[...all]` catch-all, so they're limited in a single `hooks.before` (`createAuthMiddleware`) keyed on `ctx.path` via the `RATE_LIMIT_RULES` map. Over-limit throws `APIError("TOO_MANY_REQUESTS", body, { "Retry-After": … })`.

**`src/app/api/auth/register/route.ts`** — limits itself directly, *before* body parsing (malformed requests count too — no free probing). It can't use the hook: its server-side `auth.api.signUpEmail` call carries no client IP for a hook to read.

**Frontend** — all four auth forms (login, signup, forgot-password, reset-password) detect status 429 and toast the localized `errors.rateLimited` message (`auth.*.form.errors.rateLimited` in `messages/hr.json` + `en.json`).

## Adding a limit to a new endpoint

1. Add a limiter to the map in `src/lib/rate-limit.ts` (pick requests + window, give it a unique prefix).
2. BetterAuth path → add a row to `RATE_LIMIT_RULES` in `src/lib/auth/index.ts` (`withEmail: true` folds the target email into the key for per-account limits).
3. Own API route → call `checkRateLimit()` at the top of the handler and return 429 + `Retry-After` yourself.

## Environment

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Set in `.env.development` (done) **and `.env.production` / Vercel — without them the limiter silently no-ops** (fail-open). Upstash free tier (10k requests/day) is plenty for auth limiting.

## Notes & known ceilings

- `Retry-After` reflects the sliding-window reset, so "try again in X minutes" can be shorter than the full window — that's correct behavior, not a bug.
- Dev IPs resolve to `::1` (localhost) — everyone locally shares one bucket per action. If you rate-limit yourself while testing, delete the `ratelimit:*` keys in the Upstash console.
- The login limit also caps `sendOnSignIn` verification re-sends (each blocked unverified sign-in triggers an email) — max 5 per 15 min per IP+email.
- Not limited (deliberately, not in spec): `/change-password` (settings, session-gated), Google OAuth flows, sign-out.
- Client toasts say "a few minutes" rather than the exact wait — the precise seconds live in the `Retry-After` header if a future UI wants a countdown.
