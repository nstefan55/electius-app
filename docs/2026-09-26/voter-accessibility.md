# Voter Accessibility (ballot header control)

**Version:** 0.9.82 · **Branch:** `feature/voter-accessibility` · **Date:** 2026-09-26

Voters can now adapt the ballot without an account: an **Accessibility** button in the voter
header opens two options, **Larger text** and **High contrast**. A device that already asks for
more contrast (`prefers-contrast: more`) gets high contrast on voter pages with no click.

No migration, no new dependency, no server code.

---

## Where it shows

The control lives in `src/app/[locale]/(voter)/layout.tsx`, so it appears on every voter surface:

- `/vote/[token]` — all five ballot screens, the fail/race states and the state screens
- the QR entry ("email me a link") at `/vote/[electionId]`
- the public results page `/results/[id]`

The ballot flow never changes URL between screens, and the layout does not remount, so a choice
made on screen 1 stays on through screen 5.

---

## How it works

No new styling rules were written for the two options. The admin accessibility pipeline
(settings phase 5) already switches the whole document through CSS:

```css
/* src/app/globals.css, inside @media screen */
html:has([data-larger-text])   { font-size: 18px; }
html:has([data-high-contrast]) { --color-neutral-200: #6b7280; /* … */ }
```

`:has()` matches the attribute anywhere on the page, so the voter control only has to put it on an
element. It sits on the Accessibility button itself, because the button is always rendered.

| File | Role |
| --- | --- |
| `components/voter/accessibility-menu.tsx` | client component: button (`aria-expanded`), panel, two native checkboxes |
| `lib/accessibility.ts` → `voterAccessibilityAttributes` | maps the two voter options to data-attributes |
| `lib/accessibility.test.ts` | pins that the voter mapping never emits the admin-only attributes |
| `app/globals.css` | `prefers-contrast: more` rule, scoped to voter pages |
| `messages/{hr,en}.json` → `voter.a11y` | button label, two option labels, one note |

`voterAccessibilityAttributes` forces `reduceMotion` and `focusOutlines` to `false`. The admin
default is `focusOutlines: true`; without the override a voter page would change without a click.

---

## Nothing is stored — keep it that way

The choice lives in React state only. No cookie, no `localStorage`, no `sessionStorage`, no
server write. This is deliberate: `/privacy` §F publishes that the voting flow sets no cookie and
uses no browser storage. Persisting a voter preference would make that sentence false and needs a
rewrite of §F in both catalogs first.

Consequence: a full page reload (including the `location.reload()` that `vote-flow.tsx` does on an
HTTP 410 mid-flow) resets the options to their defaults. The panel tells the voter so.

The component is a client component using client `useTranslations`, so the `/results/[id]` ISR
route stays static-safe and cached.

---

## The device contrast rule is voter-only on purpose

```css
@media screen and (prefers-contrast: more) {
  [data-voter-chrome] { /* same tokens as the data-high-contrast block */ }
}
```

`data-voter-chrome` is set on the voter layout's root element. **Do not move this rule to
`:root`.** The high-contrast tokens were designed for light surfaces. The marketing and legal page
footers (`bg-[#142844]`) use `text-neutral-400`, and remapping that token drops their contrast from
**5.8:1 to 1.96:1** (measured on `/privacy/voters`). Taking the rule app-wide means fixing those
footers first.

The token values are duplicated between this rule and the `data-high-contrast` block. Change both
together.

Everything is inside `@media screen`, so a printed or stored PDF never inherits a viewer's setting.

---

## Why only two options

- **Reduce motion:** voter pages have almost no motion (a few colour transitions, two spinners),
  and the global `prefers-reduced-motion` block already covers the device setting.
- **Focus outlines:** keyboard focus is already visible on voter pages (`:focus-visible`, plus the
  ballot option card's `focus-visible:shadow-focus`).

---

## Known limitations

- If the device asks for high contrast, the checkbox still shows unchecked, and unchecking it
  cannot turn contrast off. The dashboard's reduced-motion setting behaves the same way.
- At 320px with Larger text on, the button wraps to a second header row (kept right-aligned with
  `ml-auto`).
- Design-system §8.2 draws a logo-only, centred header. The logo is now on the left and the
  button on the right; the deviation is recorded in the layout comment.

---

## Checking it

- Unit: `npx vitest run src/lib/accessibility.test.ts`
- Browser: open any `/hr/vote/<anything>`, Tab to **Pristupačnost**, Enter, Tab, Space. The root
  font size should go 16px → 18px and the header border `#e5e7eb` → `#6b7280` with High contrast.
- Device setting: emulate `prefers-contrast: more` (Playwright `emulateMedia({ contrast: "more" })`
  or DevTools → Rendering) and reload a voter page.
