# Results Page Width & Rows Responsiveness

**Date:** 2026-07-27 · **Branch:** `fix/results-page-width` · **Type:** fix

## What

Two layout fixes on `/results` (the cross-election results list), one file changed: `src/components/elections/results-overview-list.tsx`.

1. **The page now uses the full shell width.** The component wrapped itself in `mx-auto max-w-[1080px] p-8`, capping it 200px narrower than every other admin page and double-padding it (the shell already applies `p-8`). The wrapper classes are gone — `/results` now fills `max-w-content` (1280px) exactly like `/elections` and `/home`.
2. **The rows view no longer breaks on narrow viewports.** Each row now stacks below the `sm` breakpoint (640px): title + status line on top, export buttons + chevron beneath. From `sm` up it stays the designed one-line row with a truncating title.

## Why the rows view broke

`ResultsRowItem` is a flex row of two cells:

- left: title + status line — `min-w-0 flex-1`, so it absorbs all shrinkage
- right: PDF + CSV buttons, divider, chevron — `flex-shrink-0` with `whitespace-nowrap` labels, a fixed ~300px block that never shrinks

On narrow screens the left cell truncated the title down to nothing, and past that the fixed right cell overflowed the container. The cards view never had the problem because its footer is `flex-wrap`.

## The fix

```tsx
// prije
<div className="group relative flex items-center gap-5 …">

// poslije
<div className="group relative flex flex-col gap-3 … sm:flex-row sm:items-center sm:gap-5">
```

Nothing else moved. The stretched-link overlay (`after:inset-0` on the title) still covers the whole row in both arrangements, and the export buttons keep their `z-10` so they stay clickable above it.

## Rule for future `(app)` pages

`DashboardShell` owns the content frame: `mx-auto w-full max-w-content p-8` (`dashboard-shell.tsx`). Pages and page-level components must **not** add their own outer width cap or padding — `/results` was the only surface doing it, and the same double-padding class of bug was fixed once before in the election-detail layout (2026-07-25, election-overview phase 1).

## Verification

- `npm run test` 210/210 · `npm run build` clean
- **No browser pass** — skipped at user request. The one open check: eyeball `/results` in both layouts (cards ⇄ rows) at desktop and a sub-640px width.

## Version

Stays **0.9.6** — patch bump skipped at user request.
