# Fix: Archive button on every closed-election surface + ⋯ menu re-centred (v0.9.49)

**Branch:** `fix/archive-button-and-menu-alignment` · inline request, no spec file

## The gap

`archiveElection` (the Merkle seal, v0.9.8) had exactly one caller: the ⋯ menu on `/home`. `/home` shows five rows behind *Load more*, so a closed election older than the fold had no reachable Archive control anywhere — not on `/elections`, not on `/results`, not on its own page. Separately, the ⋯ trigger on `/elections` and `/home` sat 12px low and 12px left of its cell on desktop.

## The fix

Same server action on every surface, shown only where it can succeed (`status === "CLOSED"`), the `/home` precedent. `sealElection` keeps the CLOSED-only guard in its WHERE clause, so hiding the control is UX and the action stays the boundary. No new action, no migration, no dependency, **no new i18n key**: all four surfaces read `dashboard.page.actions.archive` and its `toast.sealed` / `toast.archiveNotClosed` messages.

| Surface | Control | After the seal |
| --- | --- | --- |
| `/elections` ⋯ menu | *Arhiviraj* between Duplicate and the separator | row flips to *Arhiviran* in place (the list shows every status) |
| `/results` cards + rows | ghost button after PDF/CSV, closed rows only | row leaves the list on `router.refresh()` (`resultsRows` excludes ARCHIVED) and shows up on `/archive` |
| `/elections/[id]` topbar | ghost *Arhiviraj* before the red Remove | chip → *Arhiviran*, button gone, Remove stays |

`shortRoot` (the toast's `e3b0…b855`) moved from `recent-elections.tsx` into `elections-view.ts`, shared by all four consumers, with two tests.

### No confirm dialog, by decision

A seal is irreversible but loses nothing: CLOSED is already frozen for edits, ARCHIVED keeps the results tab, both exports, the public page and the audit modal, and `/home` has sealed one-click since v0.9.8. So the topbar button seals on click like the menu items do, and the Merkle-root toast is the confirmation. The topbar carries a `ponytail:` marking where a `ConfirmDialog` goes if accidental seals ever show up. This decision is also what kept the catalogs untouched.

### The alignment bug

The actions cell was `absolute top-3 right-3 lg:relative lg:justify-self-end`. Under `position: relative` the `top`/`right` offsets stay live, so the trigger rendered 12px down and 12px left of its grid cell — introduced when the clickable-rows fixes (v0.9.2 / v0.9.4) switched `static` → `relative` and recorded "zero layout change" (true only without offsets; the hit-tests they ran cannot see a 12px shift). Fix: `lg:top-auto lg:right-auto`, the pattern `voter-roster.tsx` already used. Measured live: computed `top: 0px; right: 0px`, trigger centre within 0.5px of the row centre, right edge equal to the "Radnje" header's right edge.

### `/results` layout

The export cluster gained `flex-wrap`. At 1280px all three buttons sit on one line (479px cards); at 390px PDF + CSV take line one and *Arhiviraj* line two, in both layouts, no overflow. The button carries the same `relative z-10` + `stopPropagation` as the export links so the card's stretched overlay never receives the press; it is a `<button>`, not a link, because a seal is a mutation.

## Verification

- `npm run lint` 0 errors (7 pre-existing `window.location.assign` warnings, none on touched files) · `npx tsc --noEmit` clean · `npm run test` **748/748** (+2) · `npm run build` clean
- Browser (dev server, Neon development branch, hr + en, **0 console errors**): three throwaway CLOSED elections, each sealed from a different surface — `/elections` menu, `/results` card, topbar — all three ARCHIVED with the canonical empty-set root `e3b0c442…b855` (zero ballots). DRAFT menu has no Archive item; sealed (running) `/results` cards have no button; `/en` reads *Archive* · geometry asserted numerically on `/elections` and `/home` · rows + cards at 1280 and 390 · topbar toast captured via a MutationObserver armed before the click
- Dev DB restored and SQL-proven: 19 elections · 3 archives · 0 fixtures, same as baseline

## Gotchas

- The `/results` button predicate is `row.status === "CLOSED"`, not `row.access === "closed"` — equal today, but `resultsDetailAccess` maps ARCHIVED to `closed` elsewhere; keep the status check.
- The `/elections` optimistic flip writes `status: "ARCHIVED" as const` — without `as const` the spread widens to `string` and the `setRows` updater fails to type-check.
- A `browser_click` on a server-action button can outlast a 5 s toast (it waits for the page to settle); arm a MutationObserver before clicking if you need the toast text.
- Pre-existing, untouched: a DRAFT older than 30 days loses *Rename* because `mutationsFrozen` treats its placeholder window as expired.

## Files

- `src/components/elections/elections-list.tsx` · `src/components/elections/results-overview-list.tsx` · `src/components/elections/election-topbar.tsx` · `src/components/dashboard/recent-elections.tsx` · `src/lib/elections-view.ts` · `src/lib/elections-view.test.ts`
