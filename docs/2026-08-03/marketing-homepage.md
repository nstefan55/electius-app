# Marketing Homepage

**Branch:** `feature/homepage` · **Version:** 0.9.8 → **0.9.9**
**Spec:** `context/features/homepage-spec.md` · **Design:** `Electius Landing.dc.html`
**Files:** 6 new · 4 modified · 1 asset added, 1 replaced

The apex landing at `electius.com/{locale}` was still the routing-phase-4 scaffold — a hero and two
CTAs. This replaces it with the full designed page: ten sections, both locales, real metadata.

It is the **only public, indexable page in the app**, which is why it is the only page that carries
`generateMetadata`, and why the copy audit below mattered more than the layout.

---

## Route & chrome

```
src/app/[locale]/(marketing)/
├── layout.tsx   passthrough + white bg (was: header + footer)
└── page.tsx     the whole landing + generateMetadata
```

The nav and footer **moved out of the layout and into the page**, because in this design they are
part of the landing, not shared chrome. `(marketing)` is the third chrome in the app, distinct from
the admin shell (design-system §8.1) and the voter chrome (§8.2). No session, ever.

Root-collision unchanged: `(marketing)` owns the real `/`, the dashboard overview stays at `/home`
(`domain-architecture-spec` §3).

## Component split

Only what interactivity forces is a client component. The other nine sections are plain server
markup in `page.tsx`.

| File | Client? | Purpose |
| --- | --- | --- |
| `section.tsx` | server | `SectionHeader` (kicker/h2/sub — 4×) + `IconCard` (48px tinted square + h3 + body — 9×) |
| `landing-nav.tsx` | yes | sticky blurred nav + mobile menu |
| `pricing-plans.tsx` | yes | billing toggle, both plan cards, comparison table |
| `faq-accordion.tsx` | yes | one open item at a time |
| `ballot-demo.tsx` | yes | the demo modal |
| `demo-trigger.tsx` | yes | the button that opens it |

### Three triggers, one modal, no shared state

The demo opens from the hero, the final CTA and the footer. Instead of a context provider or lifted
state, **one** `<BallotDemo />` renders at the page root as a native `<dialog>`, and each
`<DemoTrigger>` calls `showModal()` on it by id.

Native `<dialog>` supplies the focus trap, Esc-to-close and the backdrop for free. Verified in the
browser: the element reports `:modal`, so the trap is the browser's, not ours.

```tsx
// ponytail: native <dialog> + getElementById over a context provider —
// three triggers in three sections, one modal, no shared React state.
```

**Gotcha worth remembering:** Tailwind's preflight sets `margin: 0` on every element, which kills
the UA stylesheet's `margin: auto` that centres a `<dialog>`. Without `m-auto` the modal pins to the
top-left corner. Any future `<dialog>` in this codebase needs it.

### Ballot options are native radios

The spec asked for `role="radiogroup"` / `role="radio"`. Native `<input type="radio">` inside label
cards gives the same accessible semantics **plus** arrow-key navigation and `aria-checked` from the
browser, with no keyboard code of our own. The inputs are `sr-only`; the card is the visual.

---

## Copy is a correctness surface, not a style surface

A marketing page is the one screen where a claim can be **wrong** rather than merely ugly. The
prototype was drawn against the product's intentions, not its implementation. Four claims were
corrected before shipping.

| Claim as drawn | Problem | Shipped as |
| --- | --- | --- |
| "Real-time results" | Live results are **Pro-only** (`resultsMode: LIVE`); the card read as a Free capability | "Results the moment voting closes" + "Live results during voting are a Pro feature" |
| "…handle invitations, reminders, **closing** and certification automatically" | Auto 24h reminders are Pro, and **`autoCloseOnDeadline` has no implementation anywhere** — the only cron route opens SCHEDULED elections, it closes nothing | "Set it up once". **"Closing" removed entirely**; reminders named as Pro |
| "TRUSTED BY · Unions · Universities · Boards" | Claims trust from customers that do not exist | **"BUILT FOR"** / `IZRAĐENO ZA` — states target segments, true today |
| Proof section (4 stats + 3 testimonials) | Entirely invented | **Commented out** — see below |

The "closing" removal also resolved an internal contradiction: the Free plan card three sections
down already said "manual reminders".

Two comparison-table rows were **added** beyond the prototype — *"Live results during voting"* and
*"Automatic 24-hour voter reminders"*, both Free `—` / Pro `✓`. They encode exactly the two
distinctions the feature cards must not blur, in the place a reader goes to check.

### Commented out, not deleted

**Proof section** (`marketing.placeholder.*`) — invented figures and three attributed quotes from
people who do not exist. Publishing them would be the same failure class the PDF report's audit note
was softened to avoid (2026-07-28, D3). The JSX and the `t.raw` variables are commented with a
`NOTE:` marker rather than removed, because the layout is built around a 4-stat band and a 3-card
grid; restoring it is an uncomment, not a rebuild. Strings stay in both catalogs.

Tracked as a **launch blocker** in `context/future-updates-spec.md` § Marketing.

**Pricing pointer** (`marketing.pricing.pointer` — *"Running a bigger election? Pay once, from €9"*)
— hidden until pay-per-election ships as a real third option post-MVP. It returns as a card, not a
footnote.

Both are greppable in one pass: `grep -rn "NOTE:" src/app/\[locale\]/\(marketing\)/ src/components/marketing/`

---

## Assets

**Hero banner: 3.51 MB → 23 KB.** The source PNG was 3168×1344; it is the LCP element of the only
indexable page. Compressed to WebP 2560×1086 at q82 via `sharp` — a 99.3% reduction, invisible
because the image is a soft gradient.

```bash
node -e "require('sharp')('<src>.png').resize({width:2560}).webp({quality:82,effort:6}).toFile('public/marketing/hero-banner.webp')"
```

It is served through **`next/image` with `fill` + `priority`**, not a CSS `background-image` — a CSS
background bypasses Next's optimizer entirely, so AVIF/WebP negotiation and responsive sizing would
have been lost.

**Logos: the filenames are inverted.** Verified by compositing each onto white and navy:

| File | Actual appearance | Belongs on |
| --- | --- | --- |
| `logo/logo-mark.png` (510×503) | **white** logo | dark backgrounds — final CTA, footer |
| `logo/logo-mark-light.png` (627×631) | **navy** logo | light backgrounds — navbar, demo modal |

The design's `electius-logo-dark/light.png` are md5-identical to these two, so **no new logo assets
were added**. Pass the true intrinsic dimensions to `next/image` — declaring them square (38×38 etc.)
against a 510×503 asset triggers an aspect-ratio console warning.

---

## Styling notes

- Tokens only from `globals.css` `@theme`. Two arbitrary values, both deliberate: footer `#142844`
  (no token, one usage) and the two radial-gradient glows.
- Four keyframes added to `globals.css` (`elBackdropIn`, `elModalIn`, `elLivePulse`, `elFloat`).
  **No `prefers-reduced-motion` block was needed** — `globals.css:159` already kills every animation
  app-wide, so they inherit it. The `data-reduce-motion` shell attribute is dashboard-only and does
  not reach this page.
- Hero is `min-h-[calc(100svh-4.5rem)]`. `svh`, not `vh`, so a collapsing mobile address bar does
  not leave a gap.
- Sizes as `text-[0.9375rem]`, never `text-[15px]` — a px value silently opts out of the Larger Text
  accessibility preference (settings phase 5).

### One place the spec was wrong

Spec §6 says move `neutral-400` to `neutral-600` on both the hero line and the footer body. Correct
for the hero (`neutral-400` on white is **2.9:1**, fails AA). **Wrong for the footer**, which sits on
`#142844`:

| Colour on `#142844` | Ratio | Verdict |
| --- | --- | --- |
| `neutral-400` `#9CA3AF` | **5.8:1** | passes AA |
| `neutral-600` `#4B5563` | **~2.0:1** | fails badly |

Following the instruction literally would have made contrast worse. Only the hero line moved.

---

## Accessibility

- One `h1`; no heading level skipped (asserted in the browser, not eyeballed).
- `scroll-mt-20` on every anchor target — measured landing at 80px against a 73px sticky nav.
- Billing toggle: `role="group"` + `aria-pressed`; price block `aria-live="polite"`.
- FAQ: `aria-expanded` + `aria-controls` wired to the panel id.
- Modal: `aria-labelledby`, native radios, `<legend>` for the group.
- **Never `href="#"`.** Footer trust-column entries (Security · Verifiability · Privacy ·
  Compliance) render as **plain text** because those pages do not exist. A link that goes nowhere is
  a link that lies.
- Comparison table: bare `✓` / `—` cells carry sr-only "Included" / "Not included" — otherwise a
  screen reader announces "check mark" and "em dash". The table also has an sr-only `<caption>`.

---

## i18n

One `marketing.*` namespace, hr + en, replacing the four scaffold keys. Structure: `meta` · `nav` ·
`hero` · `problem` · `story` · `placeholder` · `features` · `pricing` · `faq` · `cta` · `footer` ·
`demo`.

List-shaped content (plan bullets, table rows, FAQ items, demo candidates) uses **`t.raw()`** — the
first use of it in this codebase. Fixed-count sections (3 problem cards, 6 feature cards) use named
keys iterated from a `const` array instead, which keeps the catalog flat and greppable.

**Catalogs are CRLF.** The injection script refuses to write unless a parse → serialise round trip
reproduces the file byte-for-byte first:

```js
const ser = (o) => JSON.stringify(o, null, 2).replace(/\n/g, "\r\n") + "\r\n";
if (ser(JSON.parse(raw)) !== raw) throw new Error("round trip not byte-identical — aborting");
```

Result: a ~400-line diff per catalog instead of the ~900-line whole-file rewrite a stray LF produces.
**Reuse this guard for any catalog edit.**

---

## Decisions

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Fabricated social proof | Built, then **commented out** before completion. Launch blocker, tracked in `future-updates-spec.md` |
| D2 | EN/HR toggle in the navbar | **Dropped** (user, 2026-08-03). `/profile` still gates `en` as "Soon" and every outbound email is hr-only; a public toggle would have contradicted both. English stays reachable at `/en`, just not advertised |
| D3 | Ballot demo modal | **Kept.** Labelled a demo, receipt explicitly says "demonstration only — this code verifies nothing" |

---

## Verification

`npm run lint` · `npx tsc --noEmit` · `npm run test` (427/427) · `npm run build` (44 routes) — all
clean. Browser hr + en at 390 / 768 / 1280: **0 console errors**.

Asserted rather than eyeballed:

- exactly one `h1`, no skipped level; all 7 anchors clear the sticky nav
- **zero `href="#"`** anywhere on the page
- both CTAs resolve to the dashboard host via `lib/urls.ts`
- modal opens from hero **and** footer (shared-modal wiring), reports `:modal`, closes on Esc and on
  backdrop, resets to the ballot on reopen, centres at **offset 0,0**, fits 390px with 16px margins
- receipt matches `/^0x[0-9a-f]{56}$/` and carries the demo disclaimer
- FAQ opens one at a time; billing toggle swaps **both** price and note
- no horizontal overflow at any of the three widths
- `/en` fully English, canonical + both `hreflang` alternates present

**Not verified:** the apex → dashboard 307 matrix and the `dashboard./` → `/home` rewrite. The proxy
is untouched by this feature, so nothing here could have changed it.

---

## Known ceilings

- Proof section and pricing pointer are commented out, not implemented — both need a product
  decision, not code.
- The final CTA still uses the original headline; the hero headline changed independently, so the
  two no longer echo each other.
- No tests added: the page holds no derivation. If the pricing table ever gains logic, it earns one
  (invariant #8 — tests cover `src/actions/` and `src/lib/` only).
