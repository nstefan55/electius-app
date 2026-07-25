# Elections List Clickable Rows

> Branch: `fix/elections-list-clickable-rows` · v0.9.4 · Inline spec
> Sibling of `docs/2026-07-25/dashboard-clickable-rows.md` (v0.9.2), which applied the same pattern to `/home` and named this file's component as the next candidate.

## What changed

Rows on `/elections` are now fully clickable and navigate to `/elections/[id]`, with a pointer cursor across the whole row. Previously only the ⋯ menu was interactive.

One file — `src/components/elections/elections-list.tsx`, ~11 lines net of comments:

1. The election name is wrapped in a locale-aware `<Link>` (`@/i18n/navigation`, already imported) carrying `after:absolute after:inset-0`.
2. The row-actions cell went `md:static` → `md:relative`.

That's it. No new state, no handlers, no props.

## The stretched-link pattern

```tsx
<div className="truncate font-heading …">
  <Link href={`/elections/${e.id}`} className="after:absolute after:inset-0">
    {e.name}
  </Link>
</div>
```

The `::after` pseudo-element is positioned against the nearest positioned ancestor — the `relative` `<li>` — and `inset-0` stretches it over the entire row. Clicking anywhere in the row therefore hits the anchor.

Everything else comes free from real anchor semantics: pointer cursor, keyboard focus, Enter to activate, cmd/middle-click to open in a new tab, and the browser's status-bar URL preview. None of that would work with a click handler.

### Why not `onClick` on the `<li>`

Base UI menu items render inside a **Portal**. React portals bubble events through the *React* tree, not the DOM tree — so a row-level `onClick` fires when you click "Rename" or "Delete" too. Making that work means `stopPropagation` at every menu item and every future interactive child, forever. The stretched link has no handlers, so there is nothing to propagate.

### Why `md:relative` on the actions cell

The stretched `::after` sits above every **non-positioned** sibling. On mobile the actions cell is already `absolute top-3 right-3`, so it wins by DOM order. On desktop it was `md:static`, which would have put it *underneath* the overlay and made the ⋯ button unclickable. `md:relative` restores the stacking without changing layout — `relative` with no offsets occupies the same box as `static`.

**If you add another clickable element to a row**, it must either come after the name cell in DOM order *and* be positioned, or take an explicit `z-index`. A plain `static` child will be swallowed by the overlay.

### Rename mode

Suppression is structural, not a guard. The editing branch renders an `<input>` in place of the name, so while renaming there is no link and no overlay — nothing to click through. That is more robust than an `if (isEditing) return` inside a handler, because there is no handler to forget.

## Trade-off

Row text is no longer mouse-selectable — the overlay sits on top of it. Same as `/home`. Accepted: these rows are navigation targets, not content to copy from.

## Verification

Playwright against the seeded dev DB (hr, 0 console errors):

| Check | Result |
| --- | --- |
| Hit-test at 60% row width | resolves to `<a href="/hr/elections/…">`, `cursor: pointer` |
| Click row whitespace | navigates to `/elections/[id]` |
| Hit-test over the ⋯ trigger | resolves to the button's SVG, **not** the link |
| Open ⋯ menu | URL unchanged |
| Click "Rename" (portal item) | URL unchanged, rename mode entered |
| Row middle while renaming | no anchor present |
| Escape | link restored, name intact |

`npm run test` 94/94 · `npm run build` clean. No unit tests added — component behaviour is out of the Vitest scope (server actions + `lib/` only); the browser pass is the coverage.

## Remaining list surfaces

`archive-list.tsx` and `election-funnel-list.tsx` (`/results`, `/voters`) still have non-clickable rows. `election-funnel-list` already renders explicit per-row links, so it may not want this. Apply the same three-part recipe if either is requested: stretched link on the name, `md:relative` on any positioned action cell, and confirm the editing branch (if any) omits the link.
