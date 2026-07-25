# Dashboard Clickable Rows

**Date:** 2026-07-25 · **Branch:** `fix/dashboard-clickable-rows` · **Type:** fix

## What

Election rows in the dashboard recent-elections list (`/home`) are now clickable — clicking anywhere on a row navigates to that election's detail page at `/elections/[id]`, with a pointer cursor across the whole row. Previously only the ⋯ actions menu was interactive.

## How — the stretched-link pattern

One file changed: `src/components/dashboard/recent-elections.tsx`.

The election name is now a real `<Link>` (from `@/i18n/navigation`, so hrefs are locale-aware) whose click surface is stretched over the entire row with a pseudo-element:

```tsx
<Link href={`/elections/${e.id}`} className="after:absolute after:inset-0">
  {e.name}
</Link>
```

The `::after` positions against the nearest positioned ancestor — the `relative` `<li>` — so it covers the full row. Supporting change: the ⋯ actions cell went from `md:static` to `md:relative` so it stacks **above** the overlay on desktop (on mobile it was already `absolute`, which stacks above by DOM order).

## Why a stretched link instead of `onClick` on the row

- **Portals bubble through the React tree, not the DOM tree.** The row menu renders in a Base UI `Menu.Portal`; with an `<li onClick>` every menu-item click (Rename, Delete…) would also fire row navigation, forcing `stopPropagation` guards on every interactive child. The stretched link has zero handlers — only clicks that physically land on the link/overlay navigate; positioned siblings win by stacking order.
- **Real link semantics for free:** keyboard focus, Enter to open, cmd/middle-click new tab, and the browser's native `cursor: pointer` (no extra class).
- **Rename mode suppresses navigation structurally:** the editing branch replaces the name with the input and simply doesn't render the link — no state flag needed.

## Guard behavior (verified live)

| Interaction | Result |
| --- | --- |
| Click anywhere on a row (name, badge, turnout, dates, whitespace) | Navigates to `/{locale}/elections/[id]` |
| Click ⋯ menu / menu items | Menu works, **no** navigation |
| Row in rename mode | Link not rendered — row inert until Enter/Escape/blur |
| Delete confirm dialog | Renders outside the `<ul>`, unaffected |

## Gotchas for future list rows

- If you add a positioned (`absolute`/`relative`) element inside a row that must stay clickable, it must come **after** the name cell in DOM order (or get a z-index) — otherwise the overlay covers it. Static elements are always covered.
- Text in the row is no longer mouse-selectable (the overlay sits above it). Accepted trade-off for a navigation row.
- The same pattern is the right candidate for `elections-list.tsx` (`/elections`) if row-click navigation is wanted there later.

## Verification

- `npm run test` 90/90 · `npm run build` passes
- Playwright (hr, seeded dev DB): row hit-test at 60% row width resolves to the anchor with `cursor: pointer`; navigation, menu, rename-suppression, and Escape-restore all confirmed; 0 console errors. No component unit tests per project testing scope (server actions + lib only).
