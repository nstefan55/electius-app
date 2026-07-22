# All Elections Page — Phase 1

> Branch `feature/all-elections-page-phase-1` · Spec `context/features/all-elections-page-phase-1.md` · Design `context/design/electius-app-design-prototype/project/Elections.dc.html`

The `/elections` route is no longer a scaffold: it lists **every election of the signed-in admin's organization** with status, turnout, voting window, and a full row-action menu (view results, inline rename, duplicate, delete). Main-area only — sidebar, topbar, and breadcrumb were already wired by the routing phases.

## What was built

| File | Role |
| --- | --- |
| `src/app/[locale]/(app)/elections/page.tsx` | Server page: `requireSession()` → `getElectionsByStatus(organizationId)` (all statuses, org-scoped), header + counts, `New election` link → `/elections/new`, list, trust footer |
| `src/components/elections/elections-list.tsx` | Client list component — columns, row-action menu, inline rename, delete-confirm modal, toasts |
| `messages/hr.json` / `messages/en.json` | New `dashboard.electionsPage` namespace |

### Page header

- `h1` "Svi izbori" / "All elections" + dot-separated summary: **total · closed · archived** — ICU plurals per locale (hr uses `one/few/other` paucal forms: "21 izbor", "4 arhivirana", "6 zatvorenih").
- Right side: primary **New election** `Link` to `/elections/new` (the wizard route, phase 2's job).

### List columns (design grid `minmax(0,1fr) 128px 208px 172px 80px`)

1. **Election** — title (inline-editable) + voting-type label
2. **Status** — badge via the shared `STATUS_STYLES` map (`src/lib/elections-view.ts`)
3. **Avg. turnout** — percent + `{voted} of {voters}` (locale number formatting via ICU `{n, number}`) + progress bar in the status color; `—` / "no voters" when the election has no voters
4. **Voting window** — `opens – closes`; **DRAFT rows render "Not scheduled"** (see decisions)
5. **Actions** — ⋯ menu (Base UI `Menu`): View results → `/elections/[id]` · Rename (inline input, Enter commits, Escape cancels, blur commits) · Duplicate · ─ · Delete (Base UI `AlertDialog` confirm)

## Decisions

- **No filters in phase 1** (user scope call, 2026-07-22). The spec overview mentions status/turnout/window filtering and the design prototype includes a filter toolbar + sort — deferred to a follow-up. Phase 2 (`all-elections-page-phase-2.md`) is the creation wizard, not filters.
- **"Not scheduled" is a display rule on `status === "DRAFT"`**, not on null dates — the schema requires `startsAt`/`endsAt` (NOT NULL), so drafts always carry placeholder dates. This also satisfies the spec's requirement that duplicates (always DRAFT) show "Not Scheduled".
- **Server actions reused, not rebuilt**: `renameElection` / `duplicateElection` / `deleteElection` from `src/actions/elections.ts` (dashboard phase 4) already implement exactly what the spec asks — org-ownership checks, `(Copy)` title suffix, DRAFT status, transactional delete clearing `Archive`/`Vote` first. Zero action-layer changes.
- **No Archive menu item** on this page — the spec's action list is View Results / Rename / Duplicate / Delete; archiving stays a dashboard-list affordance.
- **i18n reuse over duplication**: the component pulls `status.*`, `actions.*` (incl. all toasts), `list.columns.*`, `list.empty*`, and `newElection` from the existing `dashboard.page` namespace; `dashboard.electionsPage` only adds what's genuinely new (`title`, `summary`, `columns.turnout` "Avg. turnout", `columns.actions`, `votesOf`, `noVoters`, `notScheduled`, `viewResults`).
- **No sorting UI** — rows keep the query's `createdAt desc` order (the design's default). The design's sort toggle went out with the filter toolbar.
- The row/menu/rename/delete implementation intentionally mirrors `recent-elections.tsx` (optimistic rows re-synced from props, `useTransition` + `router.refresh()`, toast on success/error). The duplication is accepted for now; unify only if a third list appears.

## Known follow-up

The voting-window column currently prints the DB layer's pre-formatted en-US strings ("Jun 18"). A separate fix (`fix/voting-window-locale-format`) makes all voting-window render sites locale-aware (hr → Croatian format) — it lands right after this feature and touches this component too.

## Verification

- Playwright against the dev server, seeded dev DB, both locales:
  - hr + en render with correct copy and plurals; sidebar active state + breadcrumb correct
  - Duplicate → "(Copy)" DRAFT row at top, count 20 → 21, "Nije zakazano", toast
  - Inline rename (Enter) persists + toast; View results navigates to `/elections/[id]`
  - Delete → confirm modal with interpolated name → row gone, count back to 20 (seed intact)
  - 0 console errors
- `npm run test` — 12/12 · `npm run build` — passes (TypeScript included)
