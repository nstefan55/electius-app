# Fix: error boundaries per route group (v0.9.42)

**Branch:** `fix/error-boundaries` · **Decision:** production-readiness D9 / Layer 12

## The gap

`find src -name error.tsx` returned **0**. An uncaught render error anywhere in the app showed Next's default error screen — no chrome, no branding, no "try again". For a voting product, the first crash report should not be a voter's email.

## The fix

Three `error.tsx` boundaries, mirroring the existing `not-found` topology exactly (the tested shape `static-route-boundaries.test.ts` already knows), which covers all four route groups:

| File | Catches | Chrome | Home link |
| --- | --- | --- | --- |
| `[locale]/(app)/error.tsx` | errors in `(app)` pages | sidebar + topbar (layout already ran `requireSession`) | `/{locale}/home` |
| `[locale]/(voter)/error.tsx` | errors in `(voter)` pages | mobile voter header | `/{locale}` (apex) |
| `[locale]/error.tsx` | errors in `(auth)` + `(marketing)` (both passthrough layouts, no own boundary) + `[locale]`-level | `<html>/<body>` from `[locale]/layout` | `/{locale}` |

This is why 3 files, not 4: `(auth)` and `(marketing)` have passthrough layouts, so their errors bubble to `[locale]/error.tsx` — identical to how their `not-found` is handled today. Each group's chrome is preserved for `(app)`/`(voter)`; the two passthrough groups have no chrome to preserve.

Shared **`src/components/ui/error-card.tsx`** — a dumb presentational Client Component taking resolved strings + an `onRetry`, mirroring `NotFoundCard` (warning badge, title, description, "Try again" → `reset()`, home link). Each boundary is `"use client"` (error boundaries always are), resolves copy via **client** `useTranslations`/`useLocale`, logs the error in a `useEffect` (`console.error("[group] render error", digest, message)`), and passes strings down.

New `error` i18n namespace (hr + en): `badge` · `title` · `description` · `tryAgain` · `home`. Copy is neutral and reassures ("Vaši izbori i glasovi nisu pogođeni" / "Your elections and votes are unaffected") — no blame, sits beside a real user.

### The ISR-safety rule (v0.9.38)

`(voter)` contains the ISR route `/results/[id]`, and `[locale]/error.tsx` is an ancestor of it. A boundary in that tree that reads `headers()` — directly or via `next-intl/server` — turns `DYNAMIC_SERVER_USAGE` into an HTTP 500 on the cached route. Error boundaries are `"use client"` by requirement, so they cannot import `next-intl/server` and use client `useTranslations` instead. `static-route-boundaries.test.ts` derives its boundary list from the filesystem, so it **automatically** picked up the three new files and asserts they import neither `next/headers` nor `next-intl/server` — green.

## Verification

- `npm run lint` 0 errors · `npx tsc --noEmit` clean · `npm run test` **733 passing** (boundary contract test picked up the new files) · `npm run build` clean.
- **Live-triggered the `(voter)` boundary** (highest blast radius — a crash on the ballot path): a temporary throwing route rendered the boundary with voter chrome (Electius header) preserved, the ErrorCard showing "Greška" / "Nešto je pošlo po zlu" / the Croatian description / "Pokušaj ponovno" (reset) + "Idi na početnu" → `/hr`. The dev-overlay console errors were Next reporting the deliberate throw, not app errors. Temp route + Playwright artifacts removed afterwards. `(app)` and `[locale]` boundaries share `ErrorCard` and the identical pattern.

## Scope

`global-error.tsx` (root-layout crashes, own `<html>/<body>`) deliberately not added — spec D9 says one per route group, and `global-not-found.tsx` already covers the true-root not-found case. Error-tracking service (Sentry etc.) is the other half of D9 and is an owner/deploy item, not this fix.

## Files

- `src/components/ui/error-card.tsx` (new) · `src/app/[locale]/(app)/error.tsx` (new) · `src/app/[locale]/(voter)/error.tsx` (new) · `src/app/[locale]/error.tsx` (new) · `messages/{hr,en}.json` (`error` namespace).
