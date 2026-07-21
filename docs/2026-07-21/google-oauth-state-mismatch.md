# Fix: Google OAuth State Mismatch (Cross-Origin Dev Topology)

**Date:** 2026-07-21 · **Branch:** `fix/google-oauth-state-mismatch` · **Files:** `src/lib/auth/index.ts`

## The Bug

Signing in with Google from `dashboard.localhost:3000/hr/login` failed at the callback:

```
ERROR [Better Auth]: Failed to parse state
[BetterAuthError]: State mismatch: State not persisted correctly
code: 'state_security_mismatch'
```

## Root Cause

Two dev-environment constraints collide:

1. **Google only accepts `localhost` for plain-HTTP redirect URIs.** The registered callback is `http://localhost:3000/api/auth/callback/google`; `dashboard.localhost` cannot be registered (and doesn't need to be).
2. **Chrome treats `localhost` as a public suffix** — cookies are never shared between `localhost` and `dashboard.localhost`.

So the OAuth dance splits across two origins: sign-in starts on `dashboard.localhost` (BetterAuth's signed state cookie is set there), but Google's callback lands on `localhost:3000`, where that cookie doesn't exist. BetterAuth's second CSRF layer (the signed state cookie, checked even with the default database state strategy) fails → `state_security_mismatch`.

This was the known auth-phase-1 caveat ("Google tested from `localhost:3000`; session lands on the apex origin"). **Production was never affected** — everything lives on one origin, `dashboard.electius.com`.

## The Fix

BetterAuth's `oAuthProxy` plugin (built for exactly this: preview/dev origins that can't be registered with the OAuth provider), added to the `plugins` array in `src/lib/auth/index.ts` — before `nextCookies()`, which must stay last:

```ts
oAuthProxy({
  productionURL: process.env.BETTER_AUTH_URL,      // registered callback host
  currentURL: process.env.NEXT_PUBLIC_APP_URL,      // origin that starts sign-in
}),
```

How it works when `currentURL` ≠ `productionURL` (dev):

1. On `/sign-in/social`, the plugin wraps the OAuth state in an encrypted package (keyed by `BETTER_AUTH_SECRET`) and points the post-callback hop at `{currentURL}/api/auth/oauth-proxy-callback`.
2. Google redirects to the registered `localhost:3000` callback as usual. The plugin recognizes its state package there, **skips the state-cookie check** (the encrypted state itself carries the CSRF binding), exchanges the code with Google.
3. It then 302s to `dashboard.localhost`'s `oauth-proxy-callback` with the profile encrypted in a query param (validated against `trustedOrigins`), which creates the session **on the dashboard origin** — also closing the old "session lands on the wrong origin" caveat.

When `currentURL` === `productionURL` (production: both `https://dashboard.electius.com`), the plugin skips itself entirely — zero behavior change.

## The Gotcha Worth Remembering

`currentURL` **must be passed explicitly.** The plugin normally auto-detects the current origin from `request.url` — but the Next.js dev server normalizes `request.url` to `http://localhost:3000/...` regardless of the `Host` header the browser sent (the real host survives only in the `host` / `x-forwarded-host` headers; verified empirically with an echo route). Without the option, the plugin always concluded it was already on the production origin and stayed inert — the state param in the Google authorize URL remained the plain 32-char value instead of the long encrypted package.

**Diagnostic tell:** look at `state=` in the Google authorize URL. Plain ~32 chars → proxy inactive. Long hex blob → proxy active.

## Verification

- Direct `POST /api/auth/sign-in/social` from the dashboard origin returns an authorize URL with the encrypted state package and the registered `localhost:3000` redirect URI
- Full browser round-trip from `dashboard.localhost:3000/hr/login`: Google consent → callback → session live on `dashboard.localhost` (user-confirmed)
- `npm run build` passes (26 routes)

## Google Console

Unchanged. Only `http://localhost:3000/api/auth/callback/google` (dev) and `https://dashboard.electius.com/api/auth/callback/google` (prod) are registered. No `dashboard.localhost` entries — Google rejects them, and the proxy makes them unnecessary.
