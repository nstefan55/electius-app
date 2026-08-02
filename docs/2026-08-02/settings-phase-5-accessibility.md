# Profile & Settings Phase 5 — Accessibility

**Branch:** `feature/settings-accessibility` · **Version:** stays 0.9.8 (bump skipped at the owner's request)
**Spec:** `context/features/profile-settings-phase-5-spec.md` (index: `profile-settings-spec.md`)
**Design:** `Settings.dc.html` → "Accessibility"

Four per-admin preferences that actually change how the dashboard renders — **reduce
motion · high contrast · larger text · always show focus outlines**. The card sits first on
`/settings`, above Dashboard customizations.

Nothing of this existed before. It is the only card in the design that was neither shipped
nor deferred elsewhere.

---

## What shipped

| File | Change |
| --- | --- |
| `prisma/schema.prisma` + migration `20260802144009_add_accessibility_prefs` | **New.** Four `Boolean` columns on `User`, purely additive. |
| `src/lib/accessibility.ts` | **New.** One source of truth: key list, types, defaults, `accessibilityAttributes()`. |
| `src/lib/accessibility.test.ts` | **New.** 4 cases. |
| `src/lib/auth/require-session.ts` | Select + `Session.accessibility`. |
| `src/app/[locale]/(app)/layout.tsx` | Passes prefs to the shell. |
| `src/components/dashboard/dashboard-shell.tsx` | Spreads the four `data-*` attributes on the root. |
| `src/app/globals.css` | The four implementations. **This is where the feature lives.** |
| `src/actions/settings.ts` | `setAccessibilityPref` — one action, closed key union. |
| `src/actions/settings.test.ts` | +5 cases. |
| `src/components/settings/accessibility-card.tsx` | **New.** The card + real switches. |
| `src/app/[locale]/(app)/settings/page.tsx` | Renders the card first. |
| `messages/{hr,en}.json` | `dashboard.settings.accessibility` — 21 lines per locale. |
| **45 component/page files** | **Codemod:** 282 `text-[Npx]` → rem. See below. |

No new dependency. No client-side preference read, no context provider, no per-component prop.

---

## How it works

```
User row ──> requireSession() ──> (app)/layout.tsx ──> DashboardShell
                                                          │
                                          data-reduce-motion, data-high-contrast,
                                          data-larger-text, data-focus-outlines
                                                          │
                                            globals.css: html:has([data-…]) { … }
```

Attributes are **server-rendered**, so there is no flash of unstyled preference. That is
the reason the values are not read on the client at mount.

An off preference renders **no attribute at all**, not `data-x="false"` — `[data-x]` matches
any value, so emitting `"false"` would turn every preference permanently on with no error
anywhere. `accessibilityAttributes()` owns that rule and a test pins it.

### The four implementations

| Preference | CSS |
| --- | --- |
| Reduce motion | Standard `animation-duration`/`transition-duration: .01ms !important` reset. Also honours `@media (prefers-reduced-motion: reduce)` **unconditionally** — an OS request wins whether or not the admin ever opened the card. |
| High contrast | Overrides **tokens only**: `--color-neutral-100/200/400/600` plus the shadcn `--border`, `--input`, `--muted-foreground`. Every component already consumes these, so one block recolors the shell. Component classes are never touched. |
| Larger text | Root font size 16 → 18px. The rem scale follows. |
| Always show focus outlines | `:focus:not(:focus-visible) { box-shadow: var(--shadow-focus) }`. Changes **when** the ring shows, never **what** it looks like. |

---

## Three things to know before editing this

### 1. `html:has()` is why portals work — don't "simplify" it to a shell selector

Base UI `Menu` / `Dialog` / `AlertDialog` mount through portals into `<body>`, **outside**
`DashboardShell`. A selector rooted at the shell would stop at the modal backdrop, which is
exactly where animation is most noticeable.

The spec's fix was passing a `container` to every portal — about 20 call sites across 10
files, needing a shared ref. Checking on `<html>` instead costs nothing: portals are inside
`<body>`, which is inside `<html>`, so they inherit automatically.

Verified live: the delete-account dialog is confirmed outside the shell
(`shell.contains(dialog) === false`) yet inherits reduce motion (`0.00001s` on both dialog
and backdrop), high contrast (`#6b7280` border) and larger text (18px).

Larger text specifically **must** be on `html` — `rem` resolves against the root element,
not `body`.

### 2. The whole block is inside `@media screen` — on purpose

The election report renders through the browser's print engine, and the route lives inside
`(app)`, so it is inside the scope. Without the gate, a stored PDF would bake in the
preferences of whoever generated it — a personal display setting leaking into an artifact
organizations keep.

Verified: under print media the high-contrast border reverts to `#e5e7eb` with the toggle
still on.

### 3. The dynamic column write is safe because of a closed union, not a check

```ts
const accessibilitySchema = z.object({
  key: z.enum(ACCESSIBILITY_KEYS),
  value: z.boolean(),
});
// …
data: { [parsed.data.key]: parsed.data.value }
```

One action, not four. A key outside the union never reaches Prisma. The test feeds it
`isPro`, `email`, `stripeCustomerId` and `__proto__` and asserts no write happens — so
loosening that enum fails loudly rather than opening an arbitrary-column write.

---

## The px → rem codemod

The toggle scales `rem`-based Tailwind classes. The codebase had **282 hardcoded
`text-[Npx]` classes across 45 files** — 13 in `elections-list.tsx`, 14 in
`election-report.tsx`, 13 in `voter-roster.tsx` — which would not have moved. On
list-heavy pages the toggle would have done almost nothing.

Decision (owner, at `start`): convert all of them mechanically.

```
text-[13px]   → text-[0.8125rem]
text-[13.5px] → text-[0.84375rem]
text-[15px]   → text-[0.9375rem]
```

All 24 distinct values divide evenly by 16, and the script asserted `rem × 16 === px`
before writing — so the conversion is **pixel-identical at the default root**. Confirmed in
the browser: `text-[0.8125rem]` computes to exactly `13px` at root 16px, and `14.625px` at
18px.

Auth, voter and report surfaces were converted too. They never receive the scope attribute,
so their root stays 16px and the change is a no-op there.

**Going forward: write `text-[0.8125rem]`, not `text-[13px]`.** A new px value silently
opts that element out of the preference. Prefer the Tailwind scale (`text-sm`, `text-base`)
where it fits.

The same rule applies to **any dimension paired with a rem-based one**. The switch knob
originally used `top-[3px]`/`left-[21px]` inside a rem-based `h-6.5 w-11` track: at 18px the
track grew to 29.3px while the px inset stayed 3.0, pushing the knob off-centre. Canonical
classes (`top-0.75`, `left-5.25`) scale with it — measured 3.4px inset against a 29.3px
track.

---

## Behaviour notes

- **Saves immediately on flip**, no Save footer — a switch that needs a save button is two
  controls doing one job. (Phase 1's text-field cards legitimately differ: text needs commit
  semantics.)
- Optimistic UI, rollback + toast on failure, then `router.refresh()` so the shell
  re-renders its attributes from the server. The CSS is what applies the change, so without
  the refresh the switch would report a state the page does not show.
- **A network failure rejects the action call** rather than returning `{ success: false }`.
  Without the `.catch()` the optimistic value survives a write that never happened. Verified
  by aborting the POST: switch rolls back, toast fires, nothing persists.
- All switches are disabled while any write is in flight, which serializes toggles.
- The card is scoped to `(app)` only. The subtitle promises voters are unaffected —
  `/hr/vote/…` was verified to carry zero attributes and root 16px with all four on. **Do not
  extend the CSS beyond the shell.**

---

## Verification

`npm run test` **390 passing** (+9) · `npm run lint` clean · `npm run build` clean ·
**0 console errors**. Migration applied to the `development` branch, `prisma migrate status`
clean.

Browser pass (hr + en, seeded dev DB) asserted the **effect** of each preference, not the flag:

| Check | Result |
| --- | --- |
| Defaults | only `focusOutlines` on; off preferences emit no attribute |
| Larger text | root 16 → 18px; `text-[0.8125rem]` 13 → 14.625px |
| High contrast | card border `#e5e7eb` → `#6b7280`; muted text `#4b5563` → `#1f2937` |
| Reduce motion | transitions `0.15s` → `0.00001s`; pulse `2s` → `0.00001s` |
| Focus outlines | ring on programmatic `.focus()` with `:focus-visible === false`, carrying exactly `--shadow-focus`; clears on blur |
| Portal | dialog outside the shell inherits all three effects |
| OS preference | `prefers-reduced-motion: reduce` suppresses motion with the toggle **off**, and reverts |
| Voter flow | `/hr/vote/…` — zero attributes, root 16px, border unchanged |
| Print | high contrast reverts under print media with the toggle on |
| Persistence | survives reload; rollback verified by aborting the POST |
| a11y tree | four `switch` roles, names from the labels, descriptions on `aria-describedby` |
| Geometry | 44×26 track, 20px knob, 3px insets — proportional at 18px |
| `/en` | fully English |

**Non-finding, recorded so it is not re-investigated:** an early run appeared to lose a
`largerText` write. Three controlled rounds of rapid double-toggling showed UI and DB
agreeing every time. The cause was the test script clicking before hydration attached the
handler — a test artifact, not an app bug.

---

## Known ceilings

- `useState(prefs)` in the card never re-syncs from the server prop. Unreachable in practice
  (writes are serialized and every success refreshes); it would only surface with two tabs
  open. `useOptimistic` is the upgrade if it ever matters.
- High contrast darkens `--color-neutral-100`, which serves both faint dividers and light
  fills. Dividers become visible; some fills become light grey. In high-contrast mode that
  is the right direction, but it is one token doing two jobs.
- Larger text is a fixed 16 → 18px. No intermediate steps, no per-user scale factor.

## Out of scope

Voter-flow accessibility settings · dark mode / theme · font-family choice · per-org
accessibility policy · any change to the voter ballot.
