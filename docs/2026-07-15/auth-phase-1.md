# Auth Phase 1 — BetterAuth + Google Provider

> Branch `feature/auth-phase-1`, merged to main `c6e1001` (2026-07-15).
> Spec: `context/features/auth-phase-1-spec.md`.

Real authentication lands: **better-auth 1.6.23** with the Prisma adapter, Google
OAuth + email/password sign-in, and proxy-level protection of every route on the
dashboard host. The mock `requireSession()` seam is deliberately untouched —
wiring the real session to the user's organization is auth phase 2.

## What was built

| File | Role |
| --- | --- |
| `src/lib/auth/index.ts` | BetterAuth server instance (`server-only`) |
| `src/lib/auth/client.ts` | Browser client (`createAuthClient`, same-origin) |
| `src/app/api/auth/[...all]/route.ts` | Route handler (`toNextJsHandler`) |
| `src/proxy.ts` | Session-cookie gate for the dashboard host (modified) |
| `src/components/auth/login-form.tsx` | Minimal functional login form (Google + email/password) |
| `src/app/[locale]/(auth)/login/page.tsx` | Placeholder → functional login page (modified) |
| `messages/hr.json` · `messages/en.json` | New `auth.login.form` namespace (modified) |

## Server instance (`src/lib/auth/index.ts`)

- **Prisma adapter** reuses the existing Neon-pooled singleton from `src/lib/prisma.ts`
  (`provider: "postgresql"`). The v2 schema's BetterAuth models matched the expected
  shape with **one** mapping: `verification: { modelName: "verificationToken" }`
  (BetterAuth's default model name is `verification`; ours is `VerificationToken`).
- **Email/password with bcrypt.** BetterAuth defaults to scrypt, but the seeded
  admin's credential `Account` is bcrypt-hashed (12 rounds, `prisma/seed.ts`), so the
  config supplies custom `password.hash/verify` via `bcryptjs`. bcrypt embeds a unique
  random salt per password inside the hash — "salt + hash" is satisfied without extra
  code. New sign-ups hash the same way, so one verify path covers both.
- **Google provider** from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **`trustedOrigins`** = `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_MARKETING_URL` — needed
  in dev where the auth `baseURL` is the plain-localhost origin while the login page
  lives on `dashboard.localhost` (see below).
- **`nextCookies()`** plugin (kept last) so future Server Actions can set auth cookies.
- **Typed session:** `export type AuthSession = typeof auth.$Infer.Session` —
  `user.id` is already typed; no `.d.ts` module augmentation.

## Route protection (`src/proxy.ts`)

Everything on the dashboard host requires a session cookie except the pre-session
pages `/login` and `/signup`:

- **Cookie-presence check only** (`getSessionCookie` from `better-auth/cookies`) —
  no DB or API call in middleware, per BetterAuth's Next.js guidance. Real session
  validation stays in the `(app)/layout.tsx` choke point (phase 2).
- Redirects are **locale-aware** (`/{locale}/login` in one hop, no next-intl 307
  in between). `/setup` and `/onboarding` stay gated — they come after signup, and
  signup auto-signs-in.
- Signed-in users are bounced off `/login`/`/signup` → dashboard.
- Apex surfaces (marketing, `/vote/[token]`, public `/results/[id]`) are untouched.

## Spec deviations (deliberate)

The spec was written in NextAuth v5 idioms; the intent was kept, the APIs corrected:

| Spec said | Shipped instead | Why |
| --- | --- | --- |
| `@auth/prisma-adapter` | `better-auth/adapters/prisma` | BetterAuth ships its own adapter |
| `auth.config.ts` / `auth.ts` split | single `src/lib/auth/index.ts` | the proxy's cookie check imports zero server config — that *is* the edge-safe pattern |
| `session: { strategy: 'jwt' }` | DB sessions (BetterAuth default) | BetterAuth has no JWT session strategy; the "no DB in middleware" intent is met by the cookie-presence check |
| `better-auth.d.ts` extending Session | `typeof auth.$Infer.Session` | inference already includes `user.id` |
| "use BetterAuth's default pages" | minimal form on the existing `/login` placeholder | BetterAuth is headless — there are no default pages |

## Environment

Keys in `.env.development` / `.env.production` (gitignored, user-managed):

```
BETTER_AUTH_SECRET=   # session signing secret
BETTER_AUTH_URL=      # auth baseURL — see dev caveat below
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## The dev Google OAuth constraint (important)

Two hard browser/Google rules collide with the two-host dev topology:

1. **Google rejects plain-HTTP redirect URIs** on anything except exactly
   `localhost` / `127.0.0.1` — `dashboard.localhost` fails (`.localhost` is not a
   registrable TLD) with `Error 400: invalid_request`, and can't be added in the
   Google Console at all.
2. **Chrome treats `localhost` as a public suffix** — `localhost:3000` and
   `dashboard.localhost:3000` can never share cookies.

Resolution (user decision, 2026-07-15): dev keeps the **prod-identical two-host
structure**; only the OAuth origin differs:

- Dev: `BETTER_AUTH_URL=http://localhost:3000`; test Google from
  `http://localhost:3000/hr/login`; the session cookie lands on the apex origin
  (dev-only caveat — you stay "invisible" to `dashboard.localhost`). Redirect URI to
  register: `http://localhost:3000/api/auth/callback/google`.
- Email/password + the route gate work on `dashboard.localhost` regardless, thanks
  to `trustedOrigins`.
- **Prod: unaffected.** Auth lives entirely on `dashboard.electius.com`
  (`BETTER_AUTH_URL=https://dashboard.electius.com`); register
  `https://dashboard.electius.com/api/auth/callback/google` in the Google Console
  (domain-architecture-spec §8).

A single-host dev topology (env-driven app-host detection in the proxy) was built,
tested, and **reverted** at user request — recorded here so it isn't re-attempted
casually.

## Account linking note

The seeded admin (`nikola.stefancic@gmail.com`) has a credential account. Signing in
with Google using the same verified Gmail links a second `Account` row
(providerId `google`) to the **same** user — BetterAuth's default account linking.

## Verified

- No-cookie matrix: `/`, `/hr/dashboard`, `/en/elections` on the dashboard host all
  307 to the locale-correct `/login`; `/hr/login` renders the form (both hosts).
- Email sign-in returns 200 + `better-auth.session_token` cookie from **both**
  origins (bcrypt verify against the seeded hash works).
- With cookie: dashboard root renders (200, admin shell); `/login` bounces 307 →
  dashboard.
- Apex marketing + voter pages stay public.
- Google authorize URL: `accounts.google.com`, correct `redirect_uri`, client id,
  `email profile openid` scopes.
- `npm run build` passes (TypeScript included; `/api/auth/[...all]` resolves).

## Known quirk (dev tooling, not our code)

Killing the dev server mid-run left a stale incremental `.next` that caused a
Turbopack HMR panic loop ("Failed to write app endpoint … Next.js package not
found") and, once, phantom 404s on `/vote/[token]`. A clean `.next` + restart fixed
both. If HMR goes haywire after a hard kill: `rm -rf .next` and restart.

## Phase boundary → auth phase 2

- `requireSession()` still returns the mock user/org — any signed-in session sees
  the seeded org's data.
- No signup UI, no logout wiring (sidebar button still a no-op), no OTP, no
  forgot-password, no session→org authz. See `context/features/auth-phase-2-spec.md`.
