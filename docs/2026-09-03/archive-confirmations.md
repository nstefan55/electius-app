# Fix: Archive confirmations on every surface (v0.9.50)

**Branch:** `fix/archive-confirmations` · inline request · reverses the same-day v0.9.49 "no confirm" decision

## The gap

v0.9.49 put an Archive control on `/elections`, `/results` and the election topbar beside the one `/home` always had, and made every one of them seal on a single click. The seal is irreversible, and a bare button beside two download links on `/results` is one mis-click away from a permanent state change. The user asked for a confirmation.

## The fix

One shared dialog, **`src/components/elections/archive-confirm-dialog.tsx`** (`ArchiveConfirmDialog`, Base UI `AlertDialog`), rendered by all four surfaces. Each surface now stores an `archiveTarget` (`{ id, name }`) instead of calling the seal directly; the dialog's confirm clears the target and then runs the surface's existing seal function, so the seal code itself did not move. Copy lives once in `dashboard.page.actions` (`archiveTitle` · `archiveBody` · `confirmArchive`, hr + en) beside the delete-confirm keys; `cancel` is reused. The body names the election and states what stays available (results, reports, public page) and that the seal cannot be undone.

Brand tone, not danger: the icon circle is `brand-50` / `brand-700` and the confirm button is the primary blue. Red stays reserved for Close and Remove in the topbar, which keep their private `ConfirmDialog` untouched. The confirm button is disabled while a seal is pending; the last election name is kept in state so the text does not flash empty while the dialog closes (the `SealedDialog` precedent).

| Surface | Trigger | Where |
| --- | --- | --- |
| `/home` ⋯ menu | menu item sets `archiveTarget` | `recent-elections.tsx` |
| `/elections` ⋯ menu | same | `elections-list.tsx` |
| `/results` cards + rows | button passes `{ id, name }` up — `ArchiveProps.onArchive` now takes the row, not the id | `results-overview-list.tsx` (seal renamed `seal()`) |
| `/elections/[id]` topbar | `archiveOpen` boolean, target is `{ id, name: title }` | `election-topbar.tsx` |

No server change: `archiveElection` / `sealElection` untouched.

## Verification

- `npm run lint` 0 errors (7 pre-existing `window.location.assign` warnings) · `npx tsc --noEmit` clean · `npm run test` **748/748** · `npm run build` clean
- Browser (dev server, Neon development branch, hr + en, **0 console errors**). Four throwaway CLOSED elections, one per surface. On each: the dialog opened naming the right election; cancel (the button on `/home`, Escape on the topbar) left the election CLOSED with no toast, and on the topbar returned focus to the trigger; confirm sealed it with the `Arhivirano — Merkle korijen e3b0…b855` toast and the surface updated as before (row flips to Arhiviran on `/elections`; the row leaves `/results` and `/home`; the topbar chip flips and the button disappears). Computed colours asserted: circle `#EFF6FF`, icon and confirm button `#1D4ED8`; focus trapped inside the dialog. `/en` renders *Archive this election?* / *Cancel* / *Archive election* and cancel leaves the card in place.
- Dev DB restored and SQL-proven: 19 elections · 3 archives · 0 fixtures

## Gotchas

- `onOpenChange={(open) => !open && setArchiveTarget(null)}` is what makes Escape and the backdrop cancel; the confirm handler clears the target itself before sealing, so the dialog never sits open over a running transition.
- `/results` passes `setArchiveTarget` straight in as `onArchive`. A `ResultsRow` satisfies `{ id, name }` structurally, but the prop type is deliberately the narrow shape so the dialog cannot grow a dependency on the row.
- Catalog edits go through the byte-identical round-trip guard (`JSON.parse` → `JSON.stringify(…, null, 2)` + CRLF must reproduce the file before anything is written); this one added exactly 3 lines per catalog.

## Files

- `src/components/elections/archive-confirm-dialog.tsx` (new) · `src/components/elections/elections-list.tsx` · `src/components/elections/results-overview-list.tsx` · `src/components/elections/election-topbar.tsx` · `src/components/dashboard/recent-elections.tsx` · `messages/hr.json` · `messages/en.json`
