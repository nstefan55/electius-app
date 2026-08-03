# UI Review — High Findings + Locale Number Formatting

**Branch:** `fix/ui-review-high-findings` · **Date:** 2026-08-03
**Source:** a live browser UI review of the marketing homepage and every dashboard page, run at
three viewports while signed in. Every ratio and pixel figure below was measured in the browser,
not inferred from the CSS.

No schema change · no migration · no new dependency · 3 i18n keys added per catalog.

---

## What was wrong, and what now happens

### 1. `/home` promised live results and delivered a sealed page

`live-hero.tsx` computed `isLive` and then used it for **one thing only** — the poll interval:

```ts
const isLive = hero?.resultsMode === "LIVE";
const ms = isLive ? 15_000 : 60_000;   // the only consumer
```

The green pulsing badge ("Uživo — glasovanje u tijeku"), the "izlaznost uživo" label and the
"Pogledaj rezultate uživo" CTA rendered for **any** ACTIVE election. On an `AFTER_CLOSE` election
that CTA led to a page whose only heading is **"Rezultati su zapečaćeni"**.

That is not a cosmetic mismatch. `AFTER_CLOSE` withholds the per-candidate tally *from the admin
too* — deliberately, so "results hidden until voting ends" is a promise the product keeps
(`elections-view.ts` → `resultsAccess`, decision recorded 2026-07-26). The hero was advertising
its way past that guarantee.

`isLive` now drives all four:

| | badge | dot | CTA target | CTA label |
| --- | --- | --- | --- | --- |
| `LIVE` | Uživo — glasovanje u tijeku | pulsing, `success-500` | `/elections/{id}/results` | Pogledaj rezultate uživo |
| `AFTER_CLOSE` | Ažurira se automatski | static, `white/50` | `/elections/{id}` | Prikaži izbore |

**The AFTER_CLOSE CTA points at the overview, not nowhere.** The review suggested "drop or relabel";
dropping it leaves a large navy panel with no action at all. The overview is always accessible and
is where an admin actually wants to go from that panel.

**Wording is reused, not invented.** `dashboard.election.overview.turnout` already ships
`badgeAuto` ("Ažurira se automatski") and `caption` ("izlaznost") for exactly this state. The three
new keys under `dashboard.page.live` mirror those strings rather than adding a third phrasing for
the same idea.

### 2. The same component used `next/link`, losing the locale prefix

```ts
import Link from "next/link"   // ← the only one in the codebase
```

Every sibling list imports `{ Link } from "@/i18n/navigation"`. This was the **only** unprefixed
internal link on `/home`. On `hr` it cost a 307 plus a full document load instead of a soft
navigation; on `/en` the proxy resolved it to the default locale and silently switched an English
admin to Croatian mid-session.

### 3. `og:image` 404'd on the only indexable page

`generateMetadata` pointed at `/marketing/hero-banner.png`. That file has never existed —
`public/marketing/` holds only the `.webp` (the PNG was compressed away when the homepage shipped,
and the metadata was never updated). There was also **no `metadataBase` anywhere in `src/`**, so
Next could not resolve the relative path to the absolute URL social scrapers require.

Both fixed. `metadataBase` is derived from `NEXT_PUBLIC_MARKETING_URL` through a new
`APEX_ORIGIN` export in `lib/urls.ts` — host knowledge stays in the file that owns it, per the
"never hardcode a host" rule.

> **The dimensions were also wrong, in a way worth knowing.** The metadata declared 3168×1344,
> which belonged to the original PNG. The tracked WebP is **2560×1086**. Read the real dimensions
> rather than trusting either number if this asset changes again.

### 4. `neutral-400` on real content, below WCAG AA

The design system marks `neutral-400` **placeholder-only**. Measured in the browser it is
**2.54:1** on white and **2.43:1** on `neutral-50`; AA needs 4.5:1.

Eight sites were carrying real content on a light surface. All moved to `neutral-600`:

| File | Content |
| --- | --- |
| `wizard/step-review.tsx` (`ROW_LABEL`, `· {suffix}`, `defaultsOnly`) | the field labels an admin reads immediately before publishing |
| `wizard/election-wizard.tsx` ×2 | trust line, step counter |
| `dashboard-footer.tsx` | the anonymity trust line, on every list page |
| `settings/language-card.tsx` ×2 | `Engleski`, `Stiže nakon lansiranja` |
| `elections/election-results.tsx` | `— dostupno nakon arhiviranja` |
| `settings/logo-upload.tsx` | `Logo` slot label |

**Do not blanket-replace this token.** It appears ~80× in `src/` and most uses are correct:

- `placeholder:text-neutral-400` — the sanctioned use (§7.2)
- `disabled:text-neutral-400` and disabled-state branches (§7.1, §7.4)
- decorative icons (`Search`, `ChevronDown`, `ChevronRight`) — the adjacent label carries the meaning
- **`(marketing)/page.tsx` footer — must stay `neutral-400`.** It sits on `#142844`, where the token
  measures **5.8:1 (passes)** and `neutral-600` would fall to **~2.0:1 (fails badly)**. The blanket
  "move 400 → 600" advice is actively wrong there.

The rule that decides membership: **real content on a light background.**

### 5. The Croatian dashboard printed English thousands separators

`stats.totalVoters.toLocaleString("en-US")` rendered **`3,244`** where Croatian wants `3.244`.

The deeper problem was that the `hr → hr-HR` mapping existed in **four** places: the private
`DATE_LOCALE` in `elections-view.ts`, plus a hand-rolled `locale === "hr" ? "hr-HR" : "en-US"`
inside `voter-roster.tsx` and `election-overview.tsx` — and `election-overview.tsx` *still* had a
hardcoded `"en-US"` one component away from its own locale-aware helper.

One exported `formatCount(n, locale)` now reuses `DATE_LOCALE`; all call sites go through it.

```ts
// elections-view.ts
export const formatCount = (n: number, locale: string) =>
  n.toLocaleString(DATE_LOCALE[locale] ?? locale);
```

### Two extras, same lines

- **CTA geometry.** `h-10` was overridden by `sm:py-10`, and the chevron carried
  `sm:size-10 lg:size-5` with no `flex-none`. Measured before → after:

  | viewport | button | icon |
  | --- | --- | --- |
  | 390 | 140×40 → **140×48** | 12×24 (distorted) → **20×20** |
  | 768 | 251×**80** → **170×48** | 40×40 → **20×20** |
  | 1280 | 231×48 → **170×48** | 20×20 → **20×20** |

  48px is the design-system `lg` primary-CTA height (§7.1). A stray `type="submit"` on the anchor
  went too.

- **Unhandled rejection in the turnout poll.** `fetchTurnout` was awaited inside `setInterval` with
  no `try/catch`, so every failed poll threw `TypeError: NetworkError` into the console
  indefinitely on a 15s/60s cadence. Now caught; the next tick retries.

---

## Files touched

| File | Why |
| --- | --- |
| `src/components/dashboard/live-hero.tsx` | findings 1, 2, 5 + both extras |
| `src/lib/elections-view.ts` (+ `.test.ts`) | new `formatCount` + 3 tests |
| `src/components/dashboard/stat-cards.tsx` | finding 5 |
| `src/components/elections/election-overview.tsx` | finding 5 (×2 sites) |
| `src/components/voters/voter-roster.tsx` | finding 5 (duplicate locale map) |
| `src/app/[locale]/(marketing)/page.tsx` | finding 3 |
| `src/lib/urls.ts` | `APEX_ORIGIN` export |
| `messages/{hr,en}.json` | 3 keys each |
| 6 component files | finding 4 |

---

## Verification

`npm run lint` clean · `npx tsc --noEmit` clean · `npm run test` **430 passing (+3)** ·
`npm run build` clean (44 routes) · **0 console errors**.

Browser pass on the seeded dev DB, Croatian:

- **Both hero branches.** The seed has no `LIVE` election, so one was temporarily flipped and
  restored (DB re-confirmed `AFTER_CLOSE` afterwards). The load-bearing check is that clicking the
  live CTA now lands on a real tally (`Raspodjela glasova`, `Glasovi po danu`) rather than the
  sealed notice — that *is* finding 1.
- Both hrefs locale-prefixed; `3.244` not `3,244`; CTA geometry per the table above; no body
  overflow at any width.
- Contrast measured after: wizard review labels **7.56:1**, `Engleski` / `Stiže nakon lansiranja`
  **7.56:1**, `Logo` **7.23:1**, dashboard footer `rgb(75,85,99)`.
- `og:image` renders absolute at the `.webp`, **200**; the old `.png` still **404s**.
- Nothing created or destroyed — 22 elections before and after, no test election left behind.

**`formatCount` is mutation-checked.** Reverting it to a hardcoded `"en-US"` fails the Croatian
case. A test that cannot fail proves nothing.

**Not verified:** `/en` was not re-walked (the three new keys are translated but unexercised in the
browser), and the marketing page was checked through its metadata only, not visually.

---

## Notes for whoever picks this up next

**Assert absence, don't sample.** Two of the eight contrast sites — the wizard trust line and step
counter — were not in the review's list. They surfaced only because the check was
"`.text-neutral-400` count on this screen must be **0**" rather than "spot-check the labels the
review named". Use the same shape when clearing a token or a badge from a screen.

**Reach for the rendered value, not the class.** Contrast was confirmed by computing WCAG
luminance from `getComputedStyle` on live elements. That is what caught the design-system spec's
own §10 figure being wrong: it lists `neutral-400` on white as **2.9:1**; the real value is
**2.54:1**, so the token is worse than documented.

**JSX comments cannot sit inside an expression's parentheses.** `{cond && ( {/* … */} <span/> )}`
is a parse error. Put the comment above the `{cond && (` line. This has now bitten twice
(also `results-page-width`, 2026-07-27).

**A catalog-injection script must compare bytes, not decoded text.** A first pass read with
`utf-8-sig` (which strips the BOM) and wrote with `utf-8-sig` (which adds one), so the round-trip
guard compared two BOM-less strings and passed while the write added a BOM to both files —
a whole-file diff. Read the file as **bytes**, detect BOM and CRLF explicitly, and require the
re-serialised bytes to equal the original before touching anything.

### Dev-environment gotchas (both recurred)

- **`npm run build` clobbers the `.next` a running dev server serves from** — and the reverse also
  bites: starting `npm run dev` on a `.next` left behind by a production build puts the browser in
  a **reload loop** (steady 200s in the server log, page never settles, zero client console
  errors). It looks like an application bug. Stop the server, `rm -rf .next`, restart.
- **`TaskStop` on `npm run dev` can leave a zombie holding port 3000** while the next start
  silently moves to 3001 — which breaks auth, since the origins are pinned to `:3000`. Check with
  `netstat -ano | grep :3000` and kill the owning PID.

### Still open from the same review

Medium/Low findings deliberately left out of this branch, each real: no skip link (WCAG 2.4.1),
missing `<main>` on the marketing page, the wizard modal lacking `role="dialog"` + focus trap,
`aria-controls` pointing at panels that only render when open, charts exposed as
`role="application"` with no accessible name, the `/elections` "Avg. turnout" column header on a
per-row value, cross-host CTAs dropping the locale (`TODO(i18n)` in `urls.ts`), the inert
notification bell, truncated election titles with no `title` attribute, the wizard discarding input
on close, breadcrumb facets, and the stepper's active state using the completed treatment.

Voter-facing `neutral-400` captions (`vote-flow.tsx`, `state-screens.tsx`, `request-link-form.tsx`)
are the same token on the same light background but were outside the review's scope — worth a
follow-up pass over the voter surfaces using the rule above.
