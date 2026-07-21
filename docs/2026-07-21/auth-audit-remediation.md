# Fix: Auth Audit Remediation (Rate-Limit Gaps + Register Hygiene)

**Date:** 2026-07-21 · **Branch:** `fix/auth-audit-remediation` · **Files:** `src/lib/auth/index.ts`, `src/app/api/auth/register/route.ts`

Remediates the findings of the 2026-07-21 auth security audit (`docs/audit-results/AUTH_SECURITY_REVIEW.md`, produced by the auth-auditor agent after the rate-limiting merge).

## HIGH — Registration rate limit was bypassable

The 3/hour registration limit lived only in the custom wrapper `POST /api/auth/register`. But BetterAuth mounts its own native registration endpoint at `POST /api/auth/sign-up/email` under the `[...all]` catch-all — same engine, same body shape, directly reachable, and **not** in the `RATE_LIMIT_RULES` map. A scripted client (no cookie, no `Origin` header — which also skips BetterAuth's CSRF check) could create unlimited accounts, burn Resend quota, and probe email existence unthrottled.

**Fix:** one entry in `RATE_LIMIT_RULES` (`src/lib/auth/index.ts`):

```ts
"/sign-up/email": { action: "register" },
```

The `hooks.before` middleware now covers the native path regardless of entry point. Both routes share the same `register` action → same `ratelimit:register:{ip}` key, so the 3/hour budget is unified: three attempts total per IP, whichever door they come through.

## LOW — `/change-password` throttled

Session-gated and current-password-verified by BetterAuth, but previously unthrottled — a hijacked session could brute-force the current password (to learn the plaintext for reuse elsewhere). Added:

```ts
"/change-password": { action: "resetPassword" },
```

Shares the reset-password window (5/15min, per-IP). Deliberately no new limiter action — a dedicated one is not worth the surface for a low-severity, precondition-heavy path.

## LOW — Register route input now zod-validated

`name` had no upper bound (Postgres `text`, rendered in sidebar/settings/topbar) and the route was the last holdout using plain type guards. Replaced with a module-level schema:

```ts
const registerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().max(255),
  password: z.string().max(128),
  confirmPassword: z.string().max(128),
  locale: z.unknown().optional(),
});
```

Length caps only — email format and password policy (8–128) remain BetterAuth's job downstream; don't duplicate policy in two places. Error codes are unchanged (`invalid_input`, `password_mismatch`), so `signup-form.tsx`'s toast mapping needed no edits. The stale "zod isn't installed yet" comment is gone.

## Not Changed (deliberate)

- **Duplicate-email 422 on signup** (enumeration LOW) — standard signup UX and BetterAuth's own default; the audit's recommended mitigation is the rate limit above. No masking added.
- **BetterAuth's generic built-in limiter with Upstash `secondaryStorage`** — audit-optional defense-in-depth; skipped, the explicit per-action rules cover the sensitive paths.

## Verification

All live against the dev server, with garbage payloads so no accounts were created and no emails sent (the rate-limit hook runs before endpoint validation, so invalid bodies still consume window slots):

- Register route with a 300-char `name` → `400 invalid_input`
- Direct `POST /api/auth/sign-up/email` → `400 VALIDATION_ERROR` while slots remained, then **`429 { code: "RATE_LIMITED" }` + `Retry-After`** once the shared register window filled
- `POST /api/auth/change-password` ×6, no session → `401` ×5, then **`429`**
- Test keys (`ratelimit:register:*`, `ratelimit:reset-password:*`) deleted from Upstash afterward
- `npm run build` passes

## Operational Reminder (from the audit, not code)

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` must be set in the Vercel **production** environment. The limiter fails open by design when they're absent — every rule in this file becomes a silent no-op.
