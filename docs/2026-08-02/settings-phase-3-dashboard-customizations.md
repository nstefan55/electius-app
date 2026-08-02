# Profile & Settings Phase 3 — Dashboard Customizations

**Branch:** `feature/settings-phase-3` · **Version:** 0.9.9
**Spec:** `context/features/profile-settings-phase-3-spec.md` (index: `profile-settings-spec.md`)
**Design:** `Settings.dc.html` → "Dashboard customizations (Pro · not MVP)"

The smallest phase in the Profile & Settings set. `/settings` had shipped as a bare page
header since the phase-1 route split; it now renders one card. The card is **deliberately
inert** — the feature behind it is post-launch and Pro-only, so it renders as the design
draws it: dimmed, unclickable, badged **Pro** + **Coming soon**.

No schema column, no server action, no `isPro` read, no dashboard wiring, no tests.

---

## What shipped

| File | Change |
| --- | --- |
| `src/components/settings/dashboard-customizations-card.tsx` | **New.** Server component — no `"use client"`, no state, no handlers. |
| `src/components/settings/settings-card.tsx` | Two optional props: `headerAside`, `bodyClassName`. |
| `src/app/[locale]/(app)/settings/page.tsx` | Renders the card. |
| `messages/{hr,en}.json` | `dashboard.settings.customizations` — 10 keys per locale. |

The card body holds three rows — Compact density · Reorder summary stats · Hide live
turnout hero — each with a label, a description, and a switch **drawn as a `<span>` pill in
the off position**. `border-b border-neutral-100` on the first two rows, none on the last.
No footer: there is nothing to save.

---

## The two decisions that matter

### 1. Why it ships fully disabled instead of partly working

Recorded as deviation **D4** in the phase index. An earlier plan had "Hide live turnout
hero" ship as one real, free toggle. The final design marks the **whole card** Pro +
Coming soon, and the design wins — a card that is two-thirds decorative and one-third live
is harder to read than one that is honestly inert.

All three rows live in `context/features/Future Updates/profile-settings-future-scope.md`.
Each still needs the same three answers before it can be built:

1. Where is the preference stored?
2. Is it genuinely Pro, or is that a placeholder?
3. What does the CSS actually do?

**Do not add a `User` column for this card.** The first row that becomes real brings its
own migration. Phase 5 (Accessibility) is the working reference for the pattern: per-user
column → data-attribute on the shell → `globals.css`.

### 2. `aria-hidden` on the pills, never `aria-disabled` on the card

The design prototype puts `aria-disabled="true"` on the card body. **We do not copy that**,
and the reason is a bug phase 1 already shipped and fixed.

`aria-disabled` announces a control as inoperable. A screen reader says "dimmed" and moves
on — so the explanation of *why* it is dimmed never gets read. Phase 1 hit exactly this on
the gated language option: the "Soon" chip and helper text were the whole point, and
`aria-disabled` buried them.

Here the row text **is** the content and must stay readable. Only the drawn toggle is
decorative, so only the drawn toggle gets `aria-hidden`. `pointer-events-none` on the body
is sufficient because nothing inside is focusable.

The rule, generalized: **hide the depiction, never the explanation.**

---

## `SettingsCard` gained two slots

The spec asked for one (`headerAside`). It needed two.

```tsx
<SettingsCard
  title={…}
  subtitle={…}
  headerAside={<div className="flex shrink-0 gap-2">{/* Pro + Coming soon */}</div>}
  bodyClassName="px-6 pt-2 pb-5 opacity-55 pointer-events-none"
>
```

- **`headerAside`** — the badge slot. Deliberately **layout-free**: the shared card renders
  `{headerAside}` raw and the caller composes its own flex. Phase 7's Plan & billing card
  needs a Pro badge in the same position, so this belongs on the shared component rather
  than in a copy-pasted fork of the card chrome.
- **`bodyClassName`** — defaults to the existing `flex flex-col gap-4.5 p-6`, so no
  existing card moves a pixel. It exists because a **divided row list carries its own
  vertical padding** (`py-3.5` per row); the design tightens the card body to
  `8px 24px 20px` for precisely that reason. Phase 7 is also a row list and will want it.

The card header is now a flex row (`items-center justify-between gap-4`). With no
`headerAside` the single child stays left-aligned, which is why `/profile`'s three cards
render byte-identically — re-verified in the browser.

---

## i18n

New keys under the existing `dashboard.settings` namespace, hr + en.

`customizations.title` · `.subtitle` · `.pro` · `.soon` · `.density.{label,description}` ·
`.stats.{label,description}` · `.hero.{label,description}`

**`soon` gets its own key** rather than reusing `dashboard.profile.language.soon`
("Uskoro" / "Soon"). That one labels a locale that is genuinely coming; this one labels a
Pro feature. They will drift the moment either ships.

### Catalog edits need the round-trip guard

The catalogs are **CRLF**. Any script that writes them must prove
`parse → serialise === original bytes` **before** touching the file, or the line endings get
rewritten and a 10-key addition shows up as a ~900-line diff. This edit came out at 20
lines per catalog.

```js
const original = readFileSync(path, "utf8");
const crlf = original.includes("\r\n");
const trailing = /\r?\n$/.test(original);
const data = JSON.parse(original);

if (serialize(data, crlf, trailing) !== original) process.exit(1); // abort, do not write
```

---

## Verification

Instrumented rather than eyeballed — the interesting assertions here are about *absence*,
which sampling by hand cannot prove:

| Check | Result |
| --- | --- |
| Focusable elements inside the card | **0** — Tab skips from the page header to the footer |
| a11y snapshot | all six row strings present, **no `switch` / `checkbox` roles** |
| Pill geometry | 44×26 with a 20×20 knob (design: 44×26 / 20×20) |
| Body computed style | `opacity: 0.55`, `pointer-events: none`, **no `aria-disabled`** |
| Row separators | 1px / 1px / 0px |
| Locales | hr + en complete |
| Console | 0 errors (8 warnings are the known `next/font` preload noise) |
| `/profile` regression | unchanged after the header restructure |

`npm run lint` clean · `npm run test` **367/367** · `npm run build` clean.

No tests were added. Nothing here has a failure mode a unit test could catch, and the
project's testing rule covers `src/actions/` + `src/lib/` only — components are excluded.

---

## Known state

- The card is currently the **only** card on `/settings`. The spec places it third, below
  Plan & billing (phase 7), which is not built. A `ponytail:` marker at the page records
  the reorder. Order was explicitly deferred by the project owner.
- Both badges are **unconditional** — no `isPro` read. The badge states what the feature
  *will* cost, not what this admin *has*.

## Next in this set

Phase 4 (Data export) · phase 5 (Account deletion — carries the avatar-erasure obligation
from the R2 upload feature) · phase 6 (Accessibility) · phase 7 (Plan & billing — first
consumer of both new `SettingsCard` slots).
