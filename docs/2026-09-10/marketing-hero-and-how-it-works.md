# Marketing Hero Mockup + How-It-Works — the section that makes the comment-out safe

**Describes:** the work shipped by `fix/marketing-hero-and-how-it-works` as **v0.9.62**.
**Date:** 2026-09-10 · **Application behaviour change:** none outside the apex landing page.
No migration, no new dependency, no server action, no changed query or response shape.

> Two changes that look independent and are not. The hand-built ballot card in the hero is
> replaced by a real product screenshot, and a **How-It-Works** section is added. The section
> is not a nice-to-have on top of a comment-out — it is what makes the comment-out **safe**,
> because commenting out the Problem block took `id="how"` off the page and left two links
> scrolling nowhere.

---

## 1. The regression this closes

`id="how"` lived on the Problem section. When that section was commented out, nothing else on
the page carried the id, and **two live links pointed at nothing**:

| Link | Location |
| --- | --- |
| Nav — "Kako funkcionira" | `src/components/marketing/landing-nav.tsx:11` |
| Footer — "Kako funkcionira" | `src/app/[locale]/(marketing)/page.tsx:523` |

The new section takes `id="how"` and the shared `ANCHOR` (`scroll-mt-20`, clearing the 72px
sticky nav). **Proven, not assumed:** clicking the nav link lands `#how` at `top: 80px` against
a measured `73px` sticky nav — it clears by 7px instead of hiding under the bar.

The commented-out Problem JSX and its `marketing.problem.*` catalog keys are **left untouched**,
following the Proof-section precedent: restoring it is an uncomment, not a rebuild. Its two
lucide imports (`FileX2`, `MessageSquareWarning`) are commented in place with a pointer to the
block, so the uncomment is two edits in one file rather than a hunt for missing symbols.

---

## 2. The hero image

The hand-built ballot card (≈75 lines of JSX plus ten `hero.card.*` catalog keys ×2 locales)
became one `<Image>`. Those keys were **deleted, not orphaned** — grep confirms zero remaining
references in `src/` or `messages/`.

```tsx
<Image
  src="/marketing/assets/electius-product-mockup-hero-trimmed.png"
  alt={t("hero.mockupAlt")}
  width={2338} height={1020}
  priority quality={100}
  sizes="(min-width: 1400px) 788px, (min-width: 1024px) calc(100vw - 612px), 100vw"
  className="h-auto w-full"
/>
```

Four things here are load-bearing:

- **True intrinsic ratio.** `2338×1020` is the file's real size. A wrong ratio logs an
  aspect-ratio warning — a trap this page already hit once. Verified in the browser: the
  rendered element reports `390×170`, and `2338/1020 = 2.292` against `390/170 = 2.294`.
- **`next/image`, never a CSS `background-image`.** A CSS background bypasses the optimizer
  entirely. This sits in the hero fold beside the LCP background, hence `priority`.
- **`sizes` matches the layout.** `1400px` is the container cap (`max-w-350` = 87.5rem = 1400px),
  and `calc(100vw - 612px)` is the hero grid's right column (`lg:grid-cols-[31.25rem_1fr]`
  plus gap and padding). A `sizes` that disagrees with the CSS makes the browser pick the
  wrong candidate.
- **No `placeholder="blur"`.** Blur emits a `data:` URI, and `data:` is deliberately absent
  from the CSP's `img-src`. It would be silently blocked. The warning already sits at
  `next.config.ts:38`; this is the first change that could have tripped it.

**CSP needed no edit.** `/_next/image` is same-origin, so the existing `img-src 'self'` covers it.

---

## 3. The optimizer config, and the measurement that justifies it

`next.config.ts` had no `images` block — the "image-optimizer gap" flagged when ISR shipped.
Only what earns its keep was added:

```ts
images: {
  formats: ["image/avif", "image/webp"],
  qualities: [75, 90, 100],
  minimumCacheTTL: 2592000,   // 30 days
}
```

Measured against the running server at `w=1920&q=100`, by content negotiation:

| Client `Accept` | Served | Bytes |
| --- | --- | --- |
| `image/avif,image/webp,…` | `image/avif` | **44,598** |
| `image/webp,*/*` (older browser) | `image/webp` | 112,904 |
| — source PNG on disk | — | 103,186 |

AVIF is **60% smaller than the WebP fallback**, comfortably beating the ~20–30% its own code
comment claims. This also resolves the spec's "pre-compress the source to WebP" note: the
source stays PNG and the optimizer serves AVIF, which beats the WebP that pre-conversion
would have produced. Only the file in git is larger; **no visitor is served the PNG**.

⚠ **`qualities` is not optional.** Next 16 rejects any quality not on this list and returns a
44-byte error instead of an image, so `quality={100}` in the JSX would silently break `<Image>`
without that line.

⚠ **The `/_next/image` URL carries no file hash.** With a 30-day TTL, the cache is busted by
**renaming the file**, not by writing new bytes to the same name.

⚠ The `Cache-Control: public, max-age=0, must-revalidate` seen while testing is the **dev
server**. The 30-day TTL applies to production and was not observed here.

---

## 4. The section

A **server component** — plain markup, no interactivity, no `"use client"`. Two new exports in
`src/components/marketing/section.tsx`, sitting beside the existing `SectionHeader`/`IconCard`:

| Export | Why it exists |
| --- | --- |
| `TrackLabel` | The section has two consecutive step tracks. Without a label the second reads as a continuation of the first — but it is a different person on a different device. |
| `FlowStep` | One numbered circle + icon + title + body, rendered as an `<li>`. |

Two details in `FlowStep` are deliberate and easy to undo by accident:

- **`z-1` on the circle is required.** The `<ol>`'s connector line runs through the circles'
  centres; without stacking it draws over the white circle background.
- **The number sits in its own pill beside the circle, not inside it.** The circle already
  carries the icon — a number in the middle would mean choosing between the two. It is
  `aria-hidden`, because the `<ol>` already conveys order to assistive tech.

Content is the lifecycle the product actually implements (per `project-overview.md`):
**priprema → objava → glasovanje → rezultati → arhiva** for the admin, and
**otvara poveznicu → glasa → dobiva potvrdu** for the voter.

Conventions honoured: no `border-l-*` accent anywhere (CLAUDE.md overrides design-system
§7.10/§7.15), design tokens only with no raw hex, and every size in `rem` — a `px` value would
silently opt the element out of the larger-text accessibility preference.

---

## 5. i18n

New `marketing.how.*` namespace in **hr + en**, no hardcoded strings. Injected behind the
**byte-identical round-trip guard** (parse → serialise must reproduce the CRLF file before
writing). It worked: **2016 CRLF, 0 bare LF** in both catalogs afterwards, and the diff is
32 lines rather than the ~900 a stray LF rewrite produces.

---

## 6. Verification

Everything below was run, not inferred.

| Gate | Result |
| --- | --- |
| `npm run lint` | **0 errors**, 7 warnings — all pre-existing `window.location.assign` in auth components, none in this fix's files |
| `npx tsc --noEmit` | **0 errors** |
| `vitest run` | **765 passed / 42 files** — unchanged. Invariant #8 keeps Vitest to `src/actions/` + `src/lib/`; this is page markup |
| `npm run build` | clean — and **`● /hr` / `● /en` still prerender static**, so Gate 13 is intact |

Browser pass (dev server, Firefox, hr + en), **0 console errors** at every step — the 8 warnings
are the recorded `next/font` preload baseline:

| Check | 390px | 768px | 1280px |
| --- | --- | --- | --- |
| Horizontal scroll | none | none | none |
| Elements wider than viewport | 0 | 0 | 0 |
| Admin track / voter track | stacked | 5-col / 3-col, connectors on | 5-col / 3-col |

The 390px result is the one that mattered: the connector is drawn with an absolutely
positioned `::before`, and the spec flagged it as the most likely source of a horizontal
scrollbar. It produces none.

`/en` renders the section fully translated — 8 steps, both track labels, translated `alt` —
with no Croatian leaking through and no raw i18n keys.

---

## 7. What was deliberately **not** done

- **The source PNG was not pre-converted to WebP.** §3 explains why: the optimizer already
  serves AVIF, which is smaller than the WebP a pre-conversion would produce.
- **The Problem block and its catalog keys stay.** Commented, not deleted.
- **Pricing was not touched**, per the spec's scope guard.
- **No unit tests.** Invariant #8 — Vitest covers `src/actions/` and `src/lib/` only.

---

## 8. Observations recorded, not fixed

Neither of these was introduced by this branch; both are on `main` already.

1. **The footer's `#pricing` link dangles.** The `#pricing` section is commented out
   (`page.tsx:398`) and the **nav** link was correctly commented out with it
   (`landing-nav.tsx:12`) — but the **footer** link at `page.tsx:529` was not. This is exactly
   the regression class this fix closes for `#how`, one column away in the same footer. It was
   left alone because the spec guards pricing as out of scope. Fixing it is a one-line change
   whenever pricing is next opened.
2. **The final CTA section (§9) is commented out**, which removes the third `DemoTrigger`.
   Not a break: the `<BallotDemo />` modal is still mounted and two triggers remain (hero and
   footer), and nothing links to `#cta`.

Also worth knowing: the hero mockup renders the product UI in **English** on the Croatian page.
It is a product illustration rather than data, and the `alt` text is localised — but if a
Croatian screenshot is ever produced, this is the file to swap.
