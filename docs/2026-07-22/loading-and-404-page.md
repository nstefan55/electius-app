# Loading & Custom 404 Page

`loading.tsx` (Suspense fallback) and `not-found.tsx` (404) for all four route groups, plus a
branded, design-matched 404 for genuinely unmatched URLs. Two specs: `context/features/loading-and-404-page-spec.md`
(structure/placement) and `context/features/404-page-redesign-spec.md` (visual redesign, sourced
from the Claude Design project "Custom 404 page design").

## Loading — one `<Spinner>` per route group

`src/components/ui/spinner.tsx` — a 60px (`size-15`) rotating ring (`brand-700` arc on a
`neutral-200` track), `role="status"` + `aria-label` from `common.loading` (hr/en). One file per
group, each just centering the spinner — the group's own layout (sidebar/topbar, auth card frame,
voter header, marketing header) keeps rendering around it:

| File | Group |
| --- | --- |
| `src/app/[locale]/(app)/loading.tsx` | Admin |
| `src/app/[locale]/(auth)/loading.tsx` | Auth |
| `src/app/[locale]/(voter)/loading.tsx` | Voter |
| `src/app/[locale]/(marketing)/loading.tsx` | Marketing |

## 404 — three placements, one shared card

**`src/components/ui/not-found-card.tsx`** (`NotFoundCard`, a **Client Component** — its
secondary "Go back" button calls `window.history.back()`) renders: a mono "Error 404" badge, a
giant Poppins "404" numeral, heading, description, "Go to homepage" (plain `<a>`) + "Go back"
(real Base UI `Button`), and an optional voter-note callout. Props are fully-resolved strings —
the component has no `next-intl` dependency of its own.

**`src/lib/not-found-copy.ts`** — `notFoundCopy(t, reason)` picks `notFound.generic.*` or
`notFound.linkExpired.*` from a `getTranslations("notFound")` translator. Lives in its own plain
module (not in `not-found-card.tsx`) because a `"use client"` file's exports can't be called from
a Server Component.

| Placement | Catches | Chrome | Voter note |
| --- | --- | --- | --- |
| `(app)/not-found.tsx` | `notFound()` inside `(app)` (e.g. bad/cross-org election id) | sidebar + topbar | no |
| `(voter)/not-found.tsx` | `notFound()` inside `(voter)` (`resultsVisible` gate, bad `/vote/[token]`) | voter header | **yes** |
| `src/app/[locale]/not-found.tsx` | `notFound()` inside `(auth)`/`(marketing)` (neither calls it today) | none — picks tone via `isDashboardHost()` | no |
| `src/app/global-not-found.tsx` | **Genuinely unmatched URLs** — the ones with no route at all | its own standalone header/footer | no |

`reason: "link-expired"` is fully implemented (copy + card) but has **no caller yet** — reserved
for the Voter Flow spec's eventual token-expiry handling. Until then, every placement uses
`reason: "generic"`.

## Why there's a `global-not-found.tsx` at all

This app has no `src/app/layout.tsx` — `src/app/[locale]/layout.tsx` is the effective root, sitting
behind a **dynamic segment**. Next 16 can't cascade a normal nested `not-found.tsx` through that
topology for genuinely-unmatched URLs (confirmed empirically — a plain `[locale]/not-found.tsx`
was silently ignored, falling back to the framework's default 404). This is exactly the case
Next 16's experimental `global-not-found.js` convention exists for (its own docs: *"if your root
layout is defined using top-level dynamic segments, making it harder to compose a consistent
global 404 page"*).

- **`next.config.ts`**: `experimental: { globalNotFound: true }`
- **`src/app/global-not-found.tsx`**: the true app root — its own `<html>`/`<body>`, own
  `next/font` loading (mirrors `[locale]/layout.tsx`; without it headings fell back to a broken
  serif font), own header (56px, logo + "Electius" wordmark) and footer. No `NextIntlClientProvider`
  exists here, so `NotFoundCard`'s CTA is a plain `<a>` (not next-intl's `Link`, which needs that
  provider) and locale comes from `getLocale()` directly — the `next-intl` plugin still resolves
  it from the URL even outside the `[locale]` segment.

## Known dev-only quirk — verify against a production build

With `experimental.globalNotFound` on, **`next dev` (Turbopack)** was observed routing *every*
`notFound()` call — including `(app)`'s and `(voter)`'s — through `global-not-found.tsx`, losing
the surrounding chrome. This is a **documented Turbopack gap**, not a code bug: Next's own
dev-handler source notes the `_not-found` special-case logic *"is missing from the Turbopack hot
reloader."* A full `next build && next start` proved all four placements resolve correctly.

**If this resurfaces:** don't assume a regression from `next dev` alone — verify against
`next build && next start` first.

## Adding a new group or a new `notFound()` call site

- New route group needs its own `loading.tsx` (copy an existing one, adjust the wrapper's
  `min-h-*`) and, if it ever calls `notFound()`, its own `not-found.tsx` using `NotFoundCard` +
  `notFoundCopy()` — don't rely on the root `[locale]/not-found.tsx` for chrome you actually have.
- Wiring `reason: "link-expired"` for real: pass `notFoundCopy(t, "link-expired")`'s spread props
  instead of `"generic"` from whatever page ends up doing real token verification.

## i18n

`notFound.{badge,cta,back,footerTagline}` + `notFound.{generic,linkExpired,voterNote}.{title,description}`,
`common.loading` — hr + en, `messages/hr.json` / `messages/en.json`.
