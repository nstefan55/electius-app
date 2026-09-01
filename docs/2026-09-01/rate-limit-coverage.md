# Fix: rate-limit coverage for exports + image uploads (v0.9.41)

**Branch:** `fix/rate-limit-coverage` · **Gate:** production-readiness Gate 9 (§10)

## The gaps

`checkRateLimit` was called from 6 files; the limiter table defined 12 actions. Four session-gated route handlers called it from nowhere:

| Route | Risk | Now |
| --- | --- | --- |
| `/api/elections/[id]/voters/export` | one request dumps the entire voter roster — every name + email in the election. Unlimited PII scraping. | `rosterExport` 10 / 15 min |
| `/api/elections/[id]/results/export` | low — small payload, cheap query | `resultsExport` 10 / 15 min |
| `/api/organization/logo` (POST) | each accepted upload is an R2 `PUT` — real money + unbounded object churn (validation caps size per request, not per minute) | `imageUpload` 20 / 15 min |
| `/api/profile/avatar` (POST) | same R2 `PUT` churn | shares the `imageUpload` window |

Session-gated is not enough: a session-holder could still scrape or churn without a rate cap.

## The fix

Three new limiters in `src/lib/rate-limit.ts` (sliding windows, one prefix each): `rosterExport` (10/15m), `resultsExport` (10/15m), `imageUpload` (20/15m). Windows straight from spec §10.

**Keyed on `user.email`, not the IP** — the established pattern (`/api/organization/export`): email is unique per user, the same identity as the id, and a shared campus/NAT IP must not let one admin lock out another. Each route follows the same shape as the existing export limiter: `checkRateLimit(action, user.email)` → on failure, `429 { code: "RATE_LIMITED" }` with a `Retry-After` header. Inlined per route (the codebase inlines this everywhere — org export, the auth hook — no shared helper introduced).

- `voters/export` and `logo` gained `user` from `requireSession()` (they previously destructured only `organizationId`); `results/export` and `avatar` already had it.
- The limiter runs **first**, before the DB reads / `formData()` parse, so a limited request does no work.
- **Uploads: POST only.** The `imageUpload` window is on the accepted-upload (R2 `PUT`) path. `DELETE` clears the current object — not churn — and is left unlimited.
- **Logo and avatar share one `imageUpload` window** keyed on the user, so one admin's combined logo+avatar uploads sit in a single 20/15m budget (matches §10's single "image upload" row).

## Verification

- `npm run lint` — 0 errors (8 pre-existing warnings).
- `npx tsc --noEmit` — clean.
- `npm run test` — **731 passing** (`rate-limit.test.ts` does not pin the exact action set, so the three additions need no test edit; route handlers carry no unit test per invariant #8).
- `npm run build` — clean, all 47 pages generated.

**Not verified live:** an actual 429 from a real request — Gate 10 deploy-side check. The limiter **fails open** when `UPSTASH_*` is unset in Vercel, so an unset variable means these routes (and every other limiter) have no limiting at all, silently. Prove with one deliberate 429 against the deployed app, not by reading the dashboard.

## Files

- `src/lib/rate-limit.ts` — three limiters added.
- `src/app/api/elections/[id]/voters/export/route.ts`
- `src/app/api/elections/[id]/results/export/route.ts`
- `src/app/api/organization/logo/route.ts` (POST)
- `src/app/api/profile/avatar/route.ts` (POST)
