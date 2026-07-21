# Auth Phase 2 — Apex Route Gating (BetterAuth Proxy Routing)

> Branch `feature/auth-phase-2`.
> Spec: `context/features/auth-phase-2-spec.md`.

Closes the `domain-architecture-spec.md` §9 "known ceiling": route folders exist
**once** in the app tree, so the apex domain (`electius.com`) also resolved every
dashboard-host surface — `electius.com/hr/login` served the same page as
`dashboard.electius.com/hr/login`. The proxy now redirects those surfaces to the
app host.

## What was built

One file changed: **`src/proxy.ts`** (+21 lines). No new routes, components, or deps.

- `DASHBOARD_ONLY_PATHS` — the surfaces that must only serve on the dashboard
  host: spreads `PUBLIC_AUTH_PATHS` (`/login`, `/signup`) + `/setup`,
  `/onboarding`, `/dashboard`, `/elections`, `/archive`, `/voters`.
  **Prefix-matched** (`/elections/abc123` redirects too).
- An **apex branch** in the proxy (the `else` of the existing `isDashboardHost`
  check): strips the locale with the shared `localePrefix()` helper, matches the
  path, and cross-host-redirects (307) to `NEXT_PUBLIC_APP_URL`.

```
electius.com/hr/login            → 307 → dashboard.electius.com/hr/login
electius.com/login               → 307 → dashboard.electius.com/hr/login   (default locale resolved)
electius.com/en/dashboard        → 307 → dashboard.electius.com/en/dashboard
electius.com/hr/elections/abc    → 307 → dashboard.electius.com/hr/elections/abc
electius.com/hr/results          → 307 → dashboard.electius.com/hr/results (exact only)
```

## Key decisions

- **`/results` is exact-match only.** Apex `/results/[id]` is the *public*
  results page (gated by `resultsVisible`) and must keep serving on apex. Only
  the bare `/results` (the admin closed-elections list) redirects. This is why
  `/results` sits outside `DASHBOARD_ONLY_PATHS` instead of in it.
- **Single hop.** The locale is resolved *in the proxy* (`prefix ??
  routing.defaultLocale`) before redirecting, so the target host never emits a
  second next-intl redirect. Query strings are preserved.
- **307, not 308.** These URLs shouldn't be permanently cached by browsers or
  crawlers while the host topology can still evolve.
- **Env-driven target.** `NEXT_PUBLIC_APP_URL` (dev
  `http://dashboard.localhost:3000`, prod `https://dashboard.electius.com`) —
  never a hardcoded host. If the var is unset the proxy fails open (serves the
  page as before); acceptable because the var is load-bearing everywhere else
  (marketing CTAs).
- **No trailing-slash handling.** Next.js 308-normalizes `/x/` → `/x` *before*
  middleware runs (verified empirically — a guard written for this turned out to
  be dead code and was removed).
- **No open-redirect surface.** The redirect host is env-fixed and the built
  path always starts `/{locale}`, so crafted `//evil.com` paths can't go
  protocol-relative (and don't match the allowlist anyway).

## What did NOT change

- **Dashboard-host gate (auth phase 1)** — zero edits to that branch of the
  proxy; the cookie-presence check and locale-aware login redirects behave
  exactly as before (regression-tested).
- **Reverse leak stays a known ceiling** — the dashboard host still resolves
  `/vote/[token]` and public `/results/[id]`. Out of scope per spec; same
  pattern applies if it's ever needed.
- `requireSession()` stays the mock seam — session→org wiring is a later phase.

## Verification

- `npm run build` passes (TS included).
- Dev-server host-header matrix (20 cases): all dashboard-only surfaces 307 to
  the app host with correct locale + query; apex keeps marketing `/` (200),
  `/vote/[token]` (200), `/results/[id]` (`resultsVisible` gate → 404 for
  unknown ids); dashboard host regression green (no-cookie → `/{locale}/login`,
  `/login`·`/signup` 200).
