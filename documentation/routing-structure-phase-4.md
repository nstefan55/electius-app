# Routing Structure — Phase 4: Public Apex Surfaces

Spec: `context/features/routing-structure-phase-4-spec.md`. The fourth and final phase of the routing/app-structure migration. It promotes the Phase-1 `(marketing)` and `(voter)` route-group stubs into real chrome + scaffolds on the **apex host** (`electious.com`), and wires every outward cross-host link through one env-var helper.

**Structural only.** No page content: the voter 5-screen ballot flow, the public-results dashboard UI, and the marketing landing copy/visual design are each owned by their own later feature specs and slot into the scaffolds this phase creates.

## What shipped

### `(marketing)` — the third chrome (apex `/`)

- `src/app/[locale]/(marketing)/layout.tsx` — a chrome distinct from both the admin shell (design-system §8.1) and the voter chrome (§8.2): `neutral-50` page bg, a white logo header with **Sign In / Sign Up** CTAs, and a footer region. No sidebar, no auth, no session read.
- `src/app/[locale]/(marketing)/page.tsx` — owns the **real apex `/`** (root-collision constraint: marketing owns `/`, the dashboard overview stays a real page at `/dashboard`; domain-architecture-spec §3). A hero scaffold with the two cross-host CTAs. Full landing copy/design is the marketing-landing spec's job.

Both CTA sets are plain `<a href>` built from the URL helper — **never** the same-host next-intl `<Link>`, **never** a hardcoded host.

### `(voter)` — mobile voter chrome + two gated scaffolds

- `src/app/[locale]/(voter)/layout.tsx` — design-system §8.2 chrome: white **56px** logo-only header (`neutral-200` bottom border), `neutral-50` bg, a **390px** (`max-w-voter` = `var(--max-width-voter)`) centered content container. Zero admin chrome, no auth. Per-screen progress dots (§7.16) belong to the ballot *flow content*, not this layout.
- `(voter)/vote/[token]/page.tsx` — ballot **scaffold**. Reads the `token` param and reserves the **token-hash validation seam** (`TODO(seam)`: `token.service` will hash `SHA-256(token)` and look up the `VoterToken` where `used=false` and not expired). No-op stub this phase — real verification is the voter-flow spec's job.
- `(voter)/results/[id]/page.tsx` — public-results **scaffold**, **gated by `election.resultsVisible`**. `getPublicResultsElection(id)` fetches `{ id, title, resultsVisible }`; the page calls `notFound()` when the election is missing **or** `resultsVisible` is false. This gate is the load-bearing requirement — an unpublished result must never leak.

### Cross-host links — `src/lib/urls.ts`

A client-safe module (no `server-only`) reading the two `NEXT_PUBLIC_*` base URLs (inlined at build time). The single seam every apex↔dashboard link goes through:

| Helper | Resolves to | Consumer |
| --- | --- | --- |
| `signInUrl()` | `${NEXT_PUBLIC_APP_URL}/login` | marketing CTA |
| `signUpUrl()` | `${NEXT_PUBLIC_APP_URL}/signup` | marketing CTA |
| `voteUrl(token)` | `${NEXT_PUBLIC_MARKETING_URL}/vote/${token}` | voter magic link **and** QR payload |
| `publicResultsUrl(id)` | `${NEXT_PUBLIC_MARKETING_URL}/results/${id}` | "share public results" |

The **QR payload is exactly `voteUrl(token)`** — the same apex URL, no separate route, no token variant (domain-architecture-spec §5 decision D). QR-image *rendering* needs an approved lib and is deferred; this phase ships only the payload string.

## Decisions / ponytail notes

- **Env vars reused, not duplicated.** The spec names `NEXT_PUBLIC_PUBLIC_URL` for the apex; the repo already had `NEXT_PUBLIC_MARKETING_URL` pointing at the same apex host with the same value. Reused it — one env var, not two. (`ponytail:` noted in `urls.ts`.) `.env.local` / `.env.example` already carried both `NEXT_PUBLIC_MARKETING_URL` (apex) and `NEXT_PUBLIC_APP_URL` (dashboard); no env changes needed.
- **Cross-host locale hand-off deferred.** The helpers don't yet prefix the locale on cross-host links (en → `/en/login`). Left as `TODO(i18n)` — it lands with the `en` catalog + the auth spec. hr is unprefixed, so the hr happy path is correct today.
- **`/results` vs `/results/[id]` — no collision.** `(app)/results/page.tsx` (admin list, dashboard host) and `(voter)/results/[id]/page.tsx` (public detail, apex host) share the `results` segment across route groups but are distinct paths. The build resolves both cleanly — the `/r/[id]` fallback recorded in the spec was **not** needed. Kept the `/results/[id]` path Phase 1 recorded.
- **Off-host redirects deferred.** The apex still resolves `/dashboard/*` (every `(app)` route is auth-gated → ugly, not a hole) and the dashboard host still resolves `/vote/*` (harmless). Spec §4 / domain-architecture-spec §9 known ceilings — start permissive; add redirects in `proxy.ts` later if wanted. Not built here.
- **`getTranslations` vs `useTranslations`.** The two voter scaffolds are `async` (they `await params`), so they use `getTranslations` (`next-intl/server`). The marketing chrome/page are sync and use the `useTranslations` hook.

## New / changed files

- **New:** `src/lib/urls.ts`, `(marketing)/layout.tsx`, `(voter)/layout.tsx`
- **Promoted (stub → scaffold):** `(marketing)/page.tsx`, `(voter)/vote/[token]/page.tsx`, `(voter)/results/[id]/page.tsx`
- **Changed:** `src/lib/db/elections.ts` (+ `getPublicResultsElection`); `messages/hr.json` + `messages/en.json` (+ top-level `marketing` and `voter` namespaces)

## Verification

- `npm run build` passes (TypeScript included); all five files compile; no route-collision error.
- Runtime smoke test against the **production server** (`next start`, seeded dev DB):
  - Apex `/` → 200; rendered CTA `href`s resolve to `http://dashboard.localhost:3000/login` and `/signup`.
  - `/vote/[token]` → 200 inside the voter chrome (only the ballot `<h1>`; no `<aside>`/`<nav>` admin chrome).
  - `/results/[id]` → **404** for a real `resultsVisible=false` election **and** for a garbage id (gate fires both ways, no leak).
  - Admin `/results` (dashboard host) → 200, distinct from public `/results/[id]`.
  - Bilingual: `/en` → English hero + "Sign in".
- **Gotcha:** `notFound()` returns HTTP **200 on the dev server** while streaming — the 404 status is only authoritative on the production server (`next start`). Verify gate status codes there, not against `next dev`.

## Not in scope (owned elsewhere)

- Voter ballot 5-screen flow content (§8.3, §7.15–7.17) → voter-flow spec, fills `(voter)/vote/[token]/page.tsx`.
- Public-results detailed UI (charts, bars, winner, turnout) → public-results spec, slots behind the `resultsVisible` gate.
- Marketing landing copy + visual design → marketing-landing spec, fills `(marketing)/page.tsx`.
- Real token verification (`token.service`) + vote submission (`vote.service`) → service-layer specs.
- QR-image generation lib (needs package approval) → the feature that renders the QR; this phase ships only the payload string.
