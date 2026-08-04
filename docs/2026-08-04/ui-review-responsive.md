# UI Review — Responsive & Touch-Target Findings

**Branch:** `fix/ui-review-responsive` · **Version:** 0.9.10 → **0.9.11** (patch)
**Date:** 2026-08-04

Fixes the responsive, touch-target and focus findings from a live browser UI review of the
marketing homepage and all 10 dashboard pages at 390 / 768 / 1280px, signed in as the demo admin.
No schema change, no new dependency, no server-side change — every edit is presentational.

---

## Why this review found things the last one couldn't

The 2026-08-03 review was dispatched to the `ui-reviewer` agent, which turned out to have **no
browser**: its frontmatter carried markdown-escaped underscores (`mcp\_\_playwright\_\_*`) that
matched no tool, so it silently fell back to a static code read. That frontmatter was fixed, but
**the agent registry is cached at session start**, so the same-session re-dispatch still failed and
the live pass went through `general-purpose`.

This session is the first where `ui-reviewer` actually drove a browser. That is the whole reason
this pass surfaced viewport-dependent layout bugs — a static read cannot measure a grid collapsing
at 768px or a row clipping at 390px.

**Carry-forward:** after editing `.claude/agents/*.md`, the change does not take effect until the
next session.

---

## The fixes

### G1 — Election topbar clipped its own actions on mobile *(High)*

`election-topbar.tsx` — the actions row was `flex shrink-0 flex-wrap`.

`shrink-0` pins a flex item to its max-content width, and a wrapping flex container's max-content
width is the sum of all children **on one line**. So `flex-wrap` never received a constrained width
to wrap inside: the row stayed ~768px wide, and an ancestor is `overflow-hidden`, not `overflow-auto`.

At 390px on the Results tab this meant **PDF izvještaj, Izvoz rezultata (CSV) and the exit X were
clipped off-screen with no scroll affordance** — real controls, unreachable.

Fix: `shrink-0` → `min-w-0`. Measured after: actions row `326×140` (wrapped to three rows), all five
controls inside the viewport.

### G2 — Two list tables overlapped and lost their actions column at exactly 768px *(High)*

`elections-list.tsx` and `recent-elections.tsx` switch to a CSS grid at `md:` (768px), but their
tracks are mostly **fixed px**:

```
elections-list:    minmax(0,1fr) 128px 208px 172px 80px   → 588px fixed
recent-elections:  minmax(0,1fr) 120px 190px 130px  44px  → 484px fixed
```

Plus 4×16px gaps and 2×24px padding, against roughly **464px** of content once the 240px sidebar is
subtracted from a 768px viewport. Result: headers rendered as `IzbStatus`, the ⋮ column clipped
off-screen, titles truncated to 2–3 characters. Clean again at 1024px.

**Fix: raise the breakpoint `md:` → `lg:` — all 8 tokens per file.**

Three options were weighed and two rejected:

- **`minmax(0,Npx)` on the fixed tracks** preserves desktop exactly, but CSS grid starves `fr`
  tracks *before* it shrinks `px` ones — the title column collapses to 0 first. That **is** the
  "titles truncate to 2–3 characters" symptom, so it fixes the overlap by making the other half
  worse.
- **Fractional tracks** change desktop proportions to fix a bug that only exists on tablet.
- **Raising the breakpoint** keeps the already-designed stacked-card layout until there is genuinely
  room. `voter-roster.tsx` uses the same grid pattern but only 232px of fixed track, which is why it
  never reproduced the bug — it is the reference for what "enough room" means.

⚠️ **`md:relative` had to move with the rest.** Those two tokens are load-bearing from the
clickable-rows fixes (v0.9.2 / v0.9.4): the stretched `after:inset-0` overlay sits above every
*non-positioned* sibling, so the actions cell must be positioned or the ⋮ button becomes
unclickable. Below the breakpoint the cell is already `absolute` and wins by DOM order, so moving
the whole set to `lg:` stays coherent — but leaving `md:relative` behind would have stranded it and
silently broken the row menu between 768 and 1024px.

### G3 — Wizard stepper clipped step 5 at 390px *(High)*

`election-wizard.tsx` — the 5-step indicator needed ~483px inside an `overflow-hidden` container at
390px, so "Pregled" was entirely invisible.

**The reported case was not the worst one.** At step 5 all four prior steps are `done`, and `done`
labels rendered at *every* width — only *upcoming* labels were `hidden lg:inline`. So the overflow
grew as the user progressed.

Fix — labels now tier by state, and the connectors tighten on mobile:

| State | Visibility |
| --- | --- |
| current | `hidden sm:inline` |
| done | `hidden lg:inline` |
| upcoming | `hidden lg:inline` (unchanged) |

Connectors: `mx-3.5 min-w-5` → `mx-2 min-w-2.5 sm:mx-3.5 sm:min-w-5`.

Hiding the labels below `sm` loses nothing: the wizard header already reads **"Korak 5 od 5 ·
Pregled"** — it carries the step *name*, not just the number. Verified in the DOM rather than
assumed.

### G4 — Icon-only buttons under the 44×44px minimum *(Medium)*

`design-system-spec.md` §10 sets 44×44 (WCAG 2.5.5). Measured: row ⋮ menus **34×34**, topbar bell
and both sidebar toggles **38×38**.

The review named the row menus and the shell controls, but the finding is a **class, not a list**,
so every interactive icon-only control below 44px moved to `size-11`:

| File | Control | Before |
| --- | --- | --- |
| `elections-list.tsx` · `recent-elections.tsx` · `voter-roster.tsx` | row ⋮ menu | 34px |
| `dashboard-shell.tsx` | mobile drawer, sidebar collapse, notification bell | 38px |
| `election-topbar.tsx` | exit X (the control G1 unclips), ballot-preview close | 38 / 40px |
| `election-wizard.tsx` | wizard close X | 40px |
| `step-candidates.tsx` | remove candidate | 34px |
| `add-voters-dialog.tsx` | remove voter row | 36px |
| `ballot-demo.tsx` | demo modal close | 36px |

Icon glyph sizes are unchanged; only the hit box grew. Decorative `size-8.5`/`size-9` spans (stat
card icons, avatars, result badges) were deliberately left alone — they are not interactive.

### G5 — `neutral-400` on real content *(Medium)*

`voter-roster.tsx` rendered the "Bez imena" fallback at `neutral-400` — **2.9:1**, where AA needs
4.5:1. The design system marks that token *"placeholder only — never use for real content"*, and a
voter's missing name is real row content.

→ `neutral-600`, measured **7.56:1**. Verified as **absence**: zero `neutral-400` text nodes remain
on that page, rather than spot-checking the one row.

### G6 — Pricing comparison table scrolled with no cue *(Medium)*

`pricing-plans.tsx` — correctly `overflow-x-auto`, but at 390px the columns were cut at the viewport
edge with no hint, so the Pro column read as missing data rather than scrollable.

New `.scroll-shadow-x` utility in `globals.css` — the pure-CSS scroll-shadow technique, no JS:

```css
background-attachment: local, local, scroll, scroll;
```

Two white `local` gradient layers travel with the content and extinguish the shadow at each end;
two `scroll` radial layers stay pinned to the edges. The shadow therefore appears **only** when
there is something to scroll toward, in both directions, with no scroll listener and no lie when
the table fits.

### G7 — Marketing mobile nav had no backdrop and ignored Escape *(Medium)*

`landing-nav.tsx` rendered an in-flow panel: page content stayed visible and scrollable directly
beneath it with a hard cutoff, reading as a layering glitch. Escape did nothing.

Added a `useEffect` keydown listener and a click-to-close backdrop.

**The first attempt was broken, and only the browser caught it.** The backdrop measured **390×281**
instead of full-viewport, because `<header>` carries `backdrop-blur-md` — and **`backdrop-filter`
makes an element a containing block for `position: fixed` descendants**. `fixed inset-0` resolved
against the header, not the viewport.

Fix: the backdrop moved **out of `<header>`** as a sibling with `z-40` (below the `z-50` bar, above
page content). Re-measured **390×772**, and a hit-test below the panel now resolves to the backdrop
instead of page text.

> **Carry-forward:** never nest a `fixed` overlay inside an element with `backdrop-filter`, `filter`
> or `transform`. All three create a containing block and silently reparent your overlay.

### G8 — Focus rings used the browser default *(Low)*

Keyboard focus fell back to `outline: auto` rather than the design system's `--shadow-focus`.
Visible in the tested browser, so not a WCAG failure, but inconsistent across browsers and OSes.

Added to `@layer base` in `globals.css`:

```css
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
```

In the **base** layer deliberately, so component-level `focus-visible:*` utilities still win.

**It must not disturb the accessibility preference** at `globals.css`
(`html:has([data-focus-outlines]) :focus:not(:focus-visible)`). The two selectors are mutually
exclusive by construction — this one decides *what* the ring looks like, that one decides *when* it
appears (mouse focus, for admins who opted in). Confirmed via CSSOM that both rules are present and
intact.

### G9 — Chart tooltip: **false positive, no code changed**

The review reported that hovering a bar on the turnout chart produced no tooltip, leaving two
elections truncated to the identical axis label with no way to tell them apart.

Checked before fixing. `ChartTooltip` **is** wired (`dashboard-charts.tsx`), and `truncate` is a
`tickFormatter` on the **YAxis only** — it never touches the data. A real Playwright `hover()`
returned *"Test Izbor Vote Flow · Izlaznost 100"*: the full, untruncated name, which is exactly the
disambiguation the review said was missing. The reviewer's synthetic mouse event on an SVG bar
simply didn't register.

> Verifying cost one hover. "Fixing" it would have added a tooltip on top of a working tooltip.

---

## Marketing padding (same branch, user request)

Three mobile-only padding bumps on the apex landing page, one Tailwind step each. Tailwind is
mobile-first, so the increased value sits at base and `sm:` restores the original:

| Element | ≤ 639px | ≥ 640px |
| --- | --- | --- |
| End-to-end badge above the hero headline | `px-3.5` (14px) | `sm:px-3` (12px) |
| Hero CTA | `px-8` (32px) | `sm:px-7.5` (30px) |
| Blue CTA above the footer | `px-8.5` (34px) | `sm:px-8` (32px) |

**A pre-existing bug surfaced while measuring this.** At 390px the Croatian badge string
("PROVJERLJIVO GLASOVANJE OD POČETKA DO KRAJA") wraps to two lines — 34px of text inside a fixed
`h-7.5` (30px) pill — so it was **spilling out of its own background**. It needed ~337px of run and
had ~318px, so it overflowed at `px-3` too; the +2px only made it tighter.

Fix: `h-7.5` → `min-h-7.5 py-1`. On mobile the pill grows to 46px and contains its text; on desktop
one line never reaches the minimum, so the height stays exactly 30px.

### Hero asset swap (was uncommitted WIP, included at user request)

`src="/marketing/hero-banner.webp"` → `src="/hero/hero_banner.webp"`, with
`public/hero/hero_banner.webp` (3168×1344, 26 KB) now tracked.

**`og:image` deliberately still points at `/marketing/hero-banner.webp` (2560×1086).** The open item
recorded in v0.9.10 said the og dimensions need revisiting when `public/hero/` lands — they were
revisited and left alone: the declared `width`/`height` must match the file a scraper actually
fetches, and that pair is correct for the file it names. The stale code comment claiming the hero
was "2560×1086 WebP / 23 KB" was rewritten to describe the file actually referenced.

> **Open decision for the reader:** whether the social preview should show the same image as the
> landing page. If yes, point `og:image` at `/hero/hero_banner.webp` **and** update the dimensions to
> `3168×1344` in the same edit — the two must move together. Both files are tracked either way.

---

## Verification

`npm run lint` clean · `npx tsc --noEmit` clean · `npm run test` **430/430** ·
`npm run build` clean (exit 0, 46 routes) · **0 console errors** on every page visited.

No tests were added: every change is presentational, and the Vitest scope is `src/actions/` +
`src/lib/` only (invariant #8).

Browser-verified on the seeded dev DB, signed in — **measured, not eyeballed**:

| Goal | Evidence |
| --- | --- |
| G1 | 390px: actions row `326×140`, PDF / CSV / exit all within viewport, no overflow |
| G2 | 768px: header `display:none`, rows single-column, all 10 ⋮ inside viewport (right edge 723 < 768). **1280px unchanged**: `274px 128px 208px 172px 80px`, header columns distinct |
| G3 | Step 5 visible at 390px (right edge 370 < 390); stepper unclipped at 390 / 768 / 1280; labels tier correctly; step 5 at 1280 unclipped at 896px |
| G4 | Bell, sidebar toggle and row ⋮ on `/home`, `/elections`, roster all **44×44**; zero controls under 44 remaining on those screens |
| G5 | 10 "Bez imena" at `rgb(75,85,99)` = **7.56:1**; **zero** `neutral-400` text nodes remaining |
| G6 | Scrollable at 390px (413 > 340), 4 gradient layers, `local, local, scroll, scroll`, white base intact |
| G7 | Backdrop 390×772; hit-test below panel resolves to it; panel still on top; nav bar still clickable; **Escape closes**; **backdrop click closes** |
| G8 | Tab → `box-shadow: rgba(29,78,216,0.3) 0 0 0 3px`, `outline: none`, `:focus-visible` matches; CSSOM confirms the `data-focus-outlines` rule intact |
| G9 | Tooltip returns the full name — false positive |
| Padding | 390px: 14 / 32 / 34px. 1280px: 12 / 30 / 32px and badge height 30px — desktop byte-identical |

**Not verified (recorded, not implied):**

- `/en` was not re-walked — no copy changed, only class strings.
- The `data-focus-outlines` preference was not toggled live: it writes to the demo admin's row. The
  CSSOM check covers the regression risk, since the two selectors cannot overlap.
- The marketing page was not compared against a visual baseline; all assertions are measurements.

---

## Self-inflicted bugs worth carrying forward

1. **A JSX comment placed inside `{cond || ( … )}` is a parse error.** It must go above the
   enclosing element. `tsc` caught it; `npm run test` would not have — a green Vitest run is not
   evidence the build compiles. **Third occurrence in this repo** (also `results-page-width` and
   `ui-review-high-findings`).
2. **The `backdrop-filter` containing-block trap** (G7 above). Static reasoning said the backdrop
   was full-viewport; the browser said 390×281.

## Dev-environment notes

- `npm run build` clobbers the `.next` a running dev server serves from — **twelfth occurrence**.
  Stopped the dev server by PID, `rm -rf .next`, built, restarted. `npx tsc --noEmit` and
  `npm run lint` are safe to run against a live dev server; `npm run build` is not.
- Playwright's MCP server writes screenshots and `.playwright-mcp/` into the **repo root**; both were
  cleaned out before staging.

## Open — carried forward from the 2026-08-03 review, still not done

No skip link (WCAG 2.4.1 Level A) · missing `<main>` on the marketing page · wizard modal without
`role="dialog"` + focus trap · `aria-controls` pointing at unrendered panels · charts as
`role="application"` · `/elections` "Avg. turnout" header on a per-row value · cross-host CTAs
dropping locale · dead notification bell · truncated titles without `title` · wizard discarding
input on close · voter-surface `neutral-400` captions.
