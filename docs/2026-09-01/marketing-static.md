# Fix: marketing landing renders static (v0.9.45)

**Branch:** `fix/marketing-static` · **Gate:** production-readiness Gate 13 / `caching-strategy-spec.md` §7

## The gap

The marketing landing (`/[locale]`) — the **only indexable page** in the product — rendered per request. `generateStaticParams` and `setRequestLocale` were already correctly in place on the page; the single remaining blocker was `(marketing)/loading.tsx`.

A route boundary (`loading.tsx`) renders in the tree of **every page beneath it**. As a **server** component calling `getTranslations("common")` from `next-intl/server` **without** `setRequestLocale`, it fell back to reading the `x-next-intl-locale` header — a `headers()` read — which opted the whole `(marketing)` group out of static rendering.

## The fix

Convert `(marketing)/loading.tsx` to a **client** component using client `useTranslations` — the same pattern as `[locale]/not-found.tsx`, the `(voter)` boundaries, and the error boundaries shipped earlier today. `Spinner` only imports `cn`, so it is client-safe. No copy, no markup, no visual change — only the boundary's rendering mechanism.

## Verification

- `npx tsc --noEmit` clean · `npm run test` **735 passing** · `npm run build` clean.
- **The route flipped from `ƒ` (dynamic) to prerendered.** `.next/prerender-manifest.json` now lists **`/hr` and `/en`** (the marketing landing in both locales); before this change it held only `/_global-error` and `/favicon.ico` (the `caching-strategy-spec.md` §7 baseline). That manifest entry — not the build symbol alone — is the proof.

## Scope

This is the second and final branch of Gate 13 (the first, `/results/[id]` ISR, shipped v0.9.38). The dashboard `(app)` tree stays dynamic **by construction** (`requireSession()` reads `headers()`) — correct, not a gap. The image-optimizer gap (D8, remote images through plain `<img>`) stays deferred.

## Files

- `src/app/[locale]/(marketing)/loading.tsx` — server → client component.
