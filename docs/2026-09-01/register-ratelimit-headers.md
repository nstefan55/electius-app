# Fix: registration rate-limit global-bucket DoS (v0.9.40)

**Branch:** `fix/register-ratelimit-headers` · **Severity:** HIGH · **Gate:** production-readiness Gate 1 (auth audit, 2026-09-01)

## The bug

`src/app/api/auth/register/route.ts` called `auth.api.signUpEmail()` **without forwarding the request `headers`**. Every `auth.api.X()` call runs through the same `hooks.before` pipeline as a real HTTP request (verified against `better-auth@1.7.2`), so the `/sign-up/email` rate-limit rule (`rate-limit-rules.ts`, `{ action: "register" }`) fired on this internal call — but with `ctx.headers` undefined, `clientIp(undefined)` returned the literal string `"unknown"`.

The result: the `register` limiter (3/hour) was keyed on a **single shared global bucket** (`ratelimit:register:unknown`). After 3 successful signups *anywhere on the platform* within a rolling hour, every subsequent registration returned 429 — for everyone. Trivially exploitable as a deliberate lockout by anyone completing 3 of their own signups.

The route's *own* pre-parse limiter (`checkRateLimit("register", clientIp(request.headers))`) was IP-correct and was **not** the bug — it existed precisely because the internal `signUpEmail` call "carries no client IP for the hook to read." That assumption is what this fix removes.

## The fix (single-limiter design)

1. **Forward the headers** into `signUpEmail` (`headers: request.headers`) so the hook reads `x-forwarded-for` and keys on the real IP — for both `/api/auth/register` *and* a direct POST to `/api/auth/sign-up/email`.
2. **Drop the route's own pre-parse `checkRateLimit("register", …)` block.** With headers forwarded, the hook now limits the same IP on the same `register` action; keeping the route's limiter too would consume **two** tokens per attempt against one key, halving the effective quota to ~1.5/h. One limiter (the hook), one key, correct 3/h.
3. Removed the now-unused imports (`checkRateLimit`, `clientIp`, `retryAfterSeconds`) and updated the stale comments in both the route and `rate-limit-rules.ts` that documented the old "the route self-limits because the hook can't see the IP" rationale.

**Design fork chosen (user-approved):** single hook limiter, not two limiters on split keys. The hook is the universal limiter for every BetterAuth path; the route's limiter was only ever a workaround for the missing IP.

**Accepted trade-off:** the route's pre-parse limiter counted malformed/mismatched-password requests too ("no free probing", 2026-07-21 audit). After this fix those return 400 before reaching `signUpEmail` and are not counted. Acceptable — a malformed body does no work (a JSON parse + a zod fail + a string compare, no send, no DB write); the real cost (email send, user creation) is behind `signUpEmail`, which is limited.

## Verification

- `npm run lint` — 0 errors (8 pre-existing `window.location.assign` warnings, none in touched files).
- `npx tsc --noEmit` — clean (removed imports left nothing unused).
- `npm run test` — **731 passing** (+1: new pin in `rate-limit-rules.test.ts` asserting `/sign-up/email` is registered as `{ action: "register" }`, so a future removal — which would reopen both the direct-POST bypass and this DoS — fails a named test).
- `npm run build` — clean.

The route handler itself has no unit test (invariant #8: tests cover `src/lib`/`src/actions` only; a route handler is neither), so the header-forwarding half is verified by build + the audit's source trace, and the rule-existence half is pinned by the new test.

**Not verified live:** a real 429 from the deployed app against a real IP — that is a Gate 10 deploy-side check (`UPSTASH_*` must be set in Vercel, or the limiter fails open and there is no limiting at all).

## Files

- `src/app/api/auth/register/route.ts` — forward headers, drop pre-parse limiter, drop unused imports.
- `src/lib/auth/rate-limit-rules.ts` — comment corrected to reflect the single-limiter design.
- `src/lib/auth/rate-limit-rules.test.ts` — new pin for the `/sign-up/email` rule.
