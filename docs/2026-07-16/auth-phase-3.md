# Auth Phase 3 — Scrypt, Registration & Real Sessions

> Branch `feature/auth-phase-3` (2026-07-16).
> Spec: `context/features/auth-phase-3-spec.md`.

The auth build-out completes its core: password hashing moves to **BetterAuth's
scrypt default** (bcrypt kept as a verify fallback for seeded accounts), a
**registration endpoint + minimal signup form** open the funnel, the dashboard
host stops serving voter ballots (**reverse-leak guard**), and — the big one —
`requireSession()` drops its mock and validates a **real BetterAuth session**,
so every admin page and server action now runs against the signed-in user's
actual organization.

## What was built

| File | Role |
| --- | --- |
| `src/lib/auth/index.ts` | scrypt default + bcrypt verify fallback (modified) |
| `src/app/api/auth/register/route.ts` | `POST /api/auth/register` (new) |
| `src/components/auth/signup-form.tsx` | Minimal functional signup form (new) |
| `src/app/[locale]/(auth)/signup/page.tsx` | Stub → functional signup page (modified) |
| `src/proxy.ts` | `/vote/*` reverse-leak guard on the dashboard host (modified) |
| `src/lib/auth/require-session.ts` | Mock seam → real session + org authz (modified) |
| `src/lib/mock-data.ts` | Comment-only: now feeds the seed exclusively (modified) |
| `messages/hr.json` · `messages/en.json` | New `auth.signup.form` namespace (modified) |
| `prisma.config.ts` | Loads `.env.{NODE_ENV}` for the Prisma CLI (no plain `.env` in this repo) |

No schema migration: credentials stay on `Account.password` (BetterAuth's
convention, already in the v2 schema) — the spec's `User.password` idea was
dropped deliberately to keep the convention.

## Password hashing: scrypt with bcrypt fallback

`src/lib/auth/index.ts` no longer supplies `password.hash`. BetterAuth fills
defaults **per-function** (`hash || hashPassword`, `verify || verifyPassword`
from `better-auth/crypto`), so omitting `hash` activates the scrypt default
(memory-hard, per-password random salt, `salt:key` hex format) while we
override only `verify`:

```ts
password: {
  verify: ({ hash, password }) =>
    hash.startsWith("$2")
      ? bcrypt.compare(password, hash)       // legacy seeded accounts
      : verifyPassword({ hash, password }),  // scrypt (BetterAuth default)
},
```

The hash string itself discriminates the algorithm — bcrypt always starts
`$2a$`/`$2b$`/`$2y$` (60 chars); scrypt is `<salt>:<key>` hex (161 chars) and
can never start with `$2`. This is the standard lazy-migration pattern: no
forced resets, old hashes verify forever, new/changed passwords get scrypt.
**bcryptjs stays installed** until the seeded bcrypt accounts are migrated.

Verified against the dev DB: the seeded admin's credential account still
verifies via the `$2b$` path; a freshly registered account stores scrypt and
round-trips sign-in (wrong password → 401).

## Registration: `POST /api/auth/register`

A thin wrapper over `auth.api.signUpEmail` so **one engine owns the flow** —
BetterAuth rejects existing users, enforces email format + password length
(8–128), scrypt-hashes, creates the user, and auto-signs-in. The route adds
only what BetterAuth doesn't check: field presence and the
`confirmPassword` match.

- Accepts `{ name, email, password, confirmPassword }` (JSON).
- Success: `201` + `{ success: true, data: { user } }`, and the autoSignIn
  session cookie is forwarded from BetterAuth's `returnHeaders: true` response
  (`headers.getSetCookie()` → appended to the `NextResponse`).
- Errors: `{ success: false, error: code }` — `invalid_input` /
  `password_mismatch` (400, ours) or BetterAuth's `APIError` codes passed
  through with their status (`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` 422,
  `PASSWORD_TOO_SHORT` 400, …). Note the v1.6.23 duplicate-user code carries
  the `_USE_ANOTHER_EMAIL` suffix.
- ponytail: field checks are plain guards — zod isn't installed yet; adopt it
  here when it lands per coding-standards.

## Signup form (`src/components/auth/signup-form.tsx`)

Mirrors the phase-1 login form (BetterAuth is headless): Google button +
name/email/password/confirm, localized inline errors (`auth.signup.form.errors.*`
— mismatch, exists, tooShort, generic), success → full navigation to
`/{locale}/setup` so the proxy re-runs with the new cookie. Google signups use
`callbackURL` to land on `/setup` too. `TODO(auth-ui-spec)` marks the full
design-system screen (OTP, terms).

## Reverse-leak guard (`src/proxy.ts`)

The dashboard host previously resolved `/vote/[token]` (behind the admin cookie
gate) — wrong on two counts: a voter's magic link on the wrong host hit the
admin **login**, and the admin surface served a voter-anonymity route. Now
`/vote/*` on the dashboard host 307s to `NEXT_PUBLIC_MARKETING_URL` (apex),
**before** the auth gate, locale + query preserved, fail-open if the env var is
unset (same decisions as the phase-2 apex guard).

Public `/results/[id]` intentionally **keeps serving** on the dashboard host
per spec — it's `resultsVisible`-gated and harmless. Token-lifetime
enforcement on the ballot itself (hash lookup, `used`/expiry) remains the
voter-flow spec's `TODO(seam)` in `(voter)/vote/[token]/page.tsx`.

## Real sessions (`src/lib/auth/require-session.ts`)

The mock seam is gone. The phase-2 design paid off exactly as intended — a
body swap, zero signature churn, so no consumer (layout, pages, server
actions) changed:

1. `auth.api.getSession({ headers: await headers() })` — validates the session
   against the DB (the proxy only checks cookie *presence*; this is the real
   choke point). The `headers()` read keeps every consumer dynamic (replaces
   the old `cookies()` trick).
2. No session → `redirect("/{locale}/login")` — covers present-but-expired/
   invalid cookies that pass the proxy.
3. One scoped Prisma read adds what BetterAuth's session doesn't carry:
   `isPro`, `organizationId`, org name.
4. **No organization → `redirect("/{locale}/setup")`** — fresh signups (email
   or Google) have no org until the setup spec ships org creation
   (`TODO(setup-spec)`). This is the current funnel dead-end: new accounts
   bounce dashboard → setup by design.
5. Locale for redirects via `getLocale()` with a `routing.defaultLocale`
   fallback (an expired-session Server Action may lack the i18n request
   context).

`cache()` still de-dupes everything per request. `mock-data.ts` now exists
solely for `prisma/seed.ts`.

## Post-registration funnel (verified, no code needed)

`signup → autoSignIn → /setup → /onboarding → dashboard` — the phase-1/2 gates
already enforce the rest: unauthenticated dashboard-host traffic → `/login`,
apex admin surfaces (`/dashboard`, `/elections`, bare `/results`, …) → 307 to
the app host, `/results/[id]` public behind `resultsVisible`. All
regression-tested this phase; zero changes.

## Verified (dev server, seeded dev DB)

- Seeded admin email sign-in 200 (bcrypt fallback); new registration 201 +
  session cookie; scrypt sign-in round-trip 200 / wrong password 401.
- Hash formats proven in the DB: seeded `$2b$…` (60), new `salt:key` (161).
- Register errors: duplicate 422, mismatch 400, short 400, garbage body 400.
- `/hr/dashboard` with a real session renders the admin's actual org name from
  the DB; an org-less user 307s to `/hr/setup` (which renders 200 with a session).
- Reverse leak: dashboard `/hr/vote/abc123` → apex, no cookie needed; bare
  `/vote/abc123?src=qr` → apex `/hr/vote/abc123?src=qr` (locale + query kept).
- Full phase-1/2 regression matrix in both locales (login gate, login bounce,
  apex funneling, `/results` exact-match, apex ballot/results serving).
- `npm run build` passes (TypeScript included); smoke-test user deleted after.

## Phase boundary → next

- `/setup` and `/onboarding` are still content stubs — profile + **org
  creation** is the missing piece that unblocks fresh accounts (see funnel
  note above).
- Logout wiring (sidebar button), OTP, forgot-password: still open.
- Seeded bcrypt hashes: migrate-or-keep decision deferred; the fallback makes
  it non-urgent.
- Voter token validation on the ballot: voter-flow spec.
