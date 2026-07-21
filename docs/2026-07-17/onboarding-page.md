# Onboarding Page — How-It-Works Explainer

> Branch `feature/onboarding-page` · Spec `context/features/onboarding-page-spec.md` · Design `context/design/electius-app-design-prototype/project/Onboarding.dc.html`

The `/onboarding` page replaces the phase-2 placeholder with the real post-setup explainer: after an admin finishes `/setup`, this page shows what they can do and how voting works for the people they invite, then hands off to the dashboard or straight into the election wizard.

## Structure (faithful port of the prototype)

1. **Sticky header** — logo + brand, "Skip to dashboard" link (chevron) → `/dashboard`.
2. **Hero** — "Welcome" pill (star icon), personalized title *"Dobrodošli u Electius, {firstName}"* (first token of the session user's name), subtitle.
3. **Admin section** (`Settings` badge, uppercase eyebrow) — six feature cards in an auto-fill grid (min 290px): create wizard, candidates & voters, schedule & safeguards, live results, reports & audit, archive & history. Each card: tinted icon chip, title, description, hover lift.
4. **Voter section** (`Users` badge, green) — two delivery cards (magic links / QR code), then a white panel with the numbered **4-step voting flow** (get invited → open the ballot → cast the vote → stay anonymous) and a green trust note restating the anonymity guarantee.
5. **CTA panel** (navy `brand-900`) — primary "Create your first election" → `/elections/new`, secondary ghost "Explore the dashboard" → `/dashboard`.

## Implementation notes

- **Pure server component** — no `"use client"`. The page has zero interactivity beyond `Link`s, so no client JS ships for it. Session check is the same pattern as `/setup`: raw `auth.api.getSession` → redirect to `/login` when invalid (the proxy's cookie-presence gate fires first for anonymous hits; this covers invalid/expired cookies). The org-less are still allowed here — onboarding needs a session, not an org.
- **File:** everything lives in `src/app/[locale]/(auth)/onboarding/page.tsx` (single-purpose page, no reuse — deliberately not split into a component).
- **Icons:** Lucide only, matched to the prototype's inline SVGs — `FilePlus2`, `Users`, `ShieldCheck`, `BarChart3`, `FileCheck2`, `Archive`, `Mail`, `Lock`, `SquareCheckBig`, `ShieldAlert`, `Settings`, `Star`, `QrCode`, `Plus`, `ChevronRight`.
- **Colors:** token classes where the palette has them (`brand-50/700/900`, `info-50`, `success-50/700`, `warning-50/700`); the prototype's violet, cyan and navy-tint chips (`#F5F3FF`, `#6D28D9`, `#0E7490`, `#EEF2FB`, plus the trust note's `#D6F0DE`/`#33544A`) stay Tailwind arbitrary values — the design is deliberately "colorful"; they were not promoted to tokens.
- **Responsive:** card grid `repeat(auto-fill, minmax(290px, 1fr))`, step flow `auto-fit minmax(180px, 1fr)`, delivery cards `grid-cols-1 sm:grid-cols-2` — no breakpoint-specific layouts needed.
- **i18n:** full `auth.onboarding` namespace (hr + en), copy taken verbatim from the prototype's built-in HR/EN translations with the brand corrected Electious → Electius; `heroTitle` uses a `{name}` param. Post-review edit: the "administrator sees who voted, but not how" clause was removed from the EN `trustNote` per request (HR never had it). The orphaned `auth.todo` placeholder key (last consumer was the old page) was removed from both catalogs.

## Funnel

`/signup` → `/setup` (creates the org) → **Continue to onboarding** → `/onboarding` → dashboard or wizard. "Skip to dashboard" exists both on setup and here, so the explainer is never a forced gate.

## Verified

- Anonymous `/hr/onboarding` → 307 to `/hr/login` (proxy gate).
- Signed in: full Croatian render with the real first name; all six admin cards, both delivery cards, the four steps, trust note and CTAs present; links resolve locale-correctly (`/hr/elections/new`, `/hr/dashboard`).
- `/en/onboarding` renders the complete English variant (`/en/…` links).
- Full-page screenshot matches the prototype; `npm run build` passes (26 routes, TS included).

## Open next

`/settings` page content, OTP/forgot-password, legal pages (terms/privacy — footer/CTA links elsewhere still `#`), voter token validation (voter-flow spec), election creation wizard (`/elections/new` is still a stub the CTA points at).
