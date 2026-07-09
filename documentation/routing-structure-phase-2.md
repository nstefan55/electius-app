# Routing Structure — Phase 2: (auth) Funnel Boilerplate & Guard Seam

> Spec: `context/features/routing-structure-phase-2-spec.md` · merged to `main` in `a61c727`.
> Depends on Phase 1 (route-group skeleton + host proxy).

## What this phase does

Turns the Phase-1 `(auth)` stubs into **boilerplate placeholder pages** and reserves the `(app)`
**auth guard seam** as a no-op choke point. **No real authentication ships here** — every auth-shaped
surface is a marked placeholder with a `TODO(auth-spec)` pointing at the separate, not-yet-authored
auth feature (BetterAuth + Google OAuth + OTP).

## Files

| File | What |
|------|------|
| `src/lib/auth/require-session.ts` | **New.** `server-only` `requireSession()` — async no-op returning the `currentUser` mock. The single choke point (domain-architecture-spec §5, decision B). Async now so the future `await` shape is already in place. |
| `src/app/[locale]/(app)/layout.tsx` | Now `async`; `await requireSession()` at the top before rendering `DashboardShell`. No-op today → shell renders exactly as before (mock-backed). |
| `src/app/[locale]/(auth)/layout.tsx` | **New.** Bare full-screen centered chrome — no sidebar/topbar (contrast the `(app)` shell). Structural only. |
| `src/app/[locale]/(auth)/{login,signup,setup,onboarding}/page.tsx` | Boilerplate: heading + subtitle + visible TODO + one "Continue" link. i18n via the `auth` namespace. |
| `src/app/[locale]/(marketing)/page.tsx` | "Sign In" / "Sign Up" CTAs as absolute cross-host anchors → `NEXT_PUBLIC_APP_URL` + `/login` · `/signup`. |
| `messages/{hr,en}.json` | New `auth` namespace (hr-first). |
| `.env.local` / `.env.example` | Local `NEXT_PUBLIC_APP_URL=http://dashboard.localhost:3000`; `.env*` is gitignored. |

## The funnel (reserved, NOT enforced)

Each page carries one forward "Continue" control wired to the next step. These are scaffolds — they do
**not** gate on session or onboarded state.

```
/login  → /            (dashboard root; proxy resolves to /dashboard)
/signup → /setup → /onboarding → /
```

Same-host navigation uses the locale-aware `Link` from `src/i18n/navigation` (locale prefix handled
automatically — `hr` unprefixed, `en` → `/en/...`). Marketing CTAs are the one exception: cross-host,
so a plain `<a>` with the absolute `NEXT_PUBLIC_APP_URL`.

## The guard seam — why a no-op matters

`requireSession()` exists and is called at the top of `(app)/layout.tsx` **now**, even though it does
nothing but return the mock user. Reserving the *shape* (async helper + single call site) means real
BetterAuth session validation + org authz drop in by editing one file — zero call-site churn, no
restructuring. This is the whole point of the phase.

## Explicitly deferred (TODO-marked only)

Owned by the separate upcoming **auth spec**, not built here:

- Real auth: BetterAuth install/config, session cookie/host config, Google OAuth callback, OTP.
- Enforced redirects: login/signup bouncing to `/` when already signed in; `/setup` + `/onboarding`
  per-page session guards.
- Replacing the `currentUser` mock inside `requireSession()`.

## Deliberate simplifications (`ponytail`)

- **Marketing CTA labels are plain text, not i18n'd.** The whole landing is a Phase-4-owned stub that
  Phase 4 rebuilds and translates; Phase 2 only guarantees the two hrefs resolve. Phase 4 also moves
  these links to a shared `src/lib/urls.ts` helper (`signInUrl()` / `signUpUrl()`).
- **Auth pages render dynamic (`ƒ`), not static.** `useTranslations` without per-page
  `setRequestLocale`, same as the existing dashboard pages. Add `setRequestLocale` only if static
  auth pages are ever wanted.

## Verification (all passed)

- `npm run build` — clean, 25 pages, **no auth dependency added**.
- Runtime (`npm start`): `/login /signup /setup /onboarding` → 200, bare chrome (no sidebar).
- Bilingual: hr (`Prijava` / `Rezervirano…`) + en (`Sign in` / `Reserved…`), locale-correct funnel hrefs.
- Funnel targets: `/signup`→`/setup`, `/setup`→`/onboarding`.
- Marketing CTAs → `http://dashboard.localhost:3000/{login,signup}`.

## Next

Phase 3 — election aggregate-root nesting (`elections/[id]/layout.tsx` fetch+authorize once, tab nav,
facet segments). It consumes this phase's `requireSession()` seam.
