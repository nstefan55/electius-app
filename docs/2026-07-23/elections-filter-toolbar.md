# All Elections Page — Filter Toolbar

> Branch `feature/elections-filter-toolbar` · Inline spec (`context/current-feature.md`) · Design `context/design/electius-app-design-prototype/project/Elections.dc.html` (toolbar + `matchesTurnout`/`matchesWindow` logic)

The `/elections` list gained the design prototype's **filter toolbar**: three labeled selects (Status · Turnout · Voting window), a Clear-filters button that appears only when a filter is active, a right-aligned result label, and a dedicated filtered-empty state. All filtering is **client-side** over the already-fetched org-scoped rows — zero new DB queries.

## What was built

| File | Role |
| --- | --- |
| `src/lib/elections-view.ts` | Pure filter predicates: `matchesTurnout`, `matchesWindow`, `windowYears` + `StatusFilter`/`TurnoutFilter`/`WindowFilter` types — client-safe, shared by the component and unit tests |
| `src/lib/elections-view.test.ts` | 10 new Vitest cases covering the predicates (bucket boundaries, zero-voter rows, DRAFT/year matching, year derivation) |
| `src/components/elections/elections-list.tsx` | Toolbar UI: `FilterSelect` (styled native `<select>` + chevron), filter state, clear button, result label, filtered-empty state |
| `messages/hr.json` / `messages/en.json` | New `dashboard.electionsPage.filters` block (labels, options, `showing`/`count`, empty-state copy) |

### Filter rules (ported from the prototype)

- **Status** — All statuses / Active / Scheduled / Draft / Closed / Archived (option order per design; labels reuse `dashboard.page.status.*`).
- **Turnout** — `p = round(voted / voters × 100)`:
  - `none` — 0 voters **or** 0 votes
  - `low` — 0 < p < 40 · `medium` — 40 ≤ p < 75 · `high` — p ≥ 75
  - Zero-voter rows only ever match `none` (never low/medium/high).
- **Voting window** — All windows / {distinct close-date years, newest first} / Not scheduled:
  - `unscheduled` keys on **`status === "DRAFT"`**, not on missing dates — the schema requires `startsAt`/`endsAt`, so drafts always carry placeholder dates (same rule as the list's "Not scheduled" cell).
  - Year match compares the UTC year of `endsAt` (`closes`); DRAFT rows never match a year.
- Filters AND together. `windowYears` derives the year options from the full row set (not the filtered one), so options stay stable while filtering.

### Toolbar UI

- Labeled selects per the design: 40px height, `border-border`, `radius-md`, 12px semibold caption label above, chevron icon overlay on an `appearance-none` native `<select>`; toolbar wraps (`flex-wrap`).
- **Clear filters** (X icon) renders only when any filter ≠ "all"; resets all three.
- **Result label** right-aligned (`ml-auto`): "Showing X of Y" when filtered, else "{Y} elections" (ICU plural, hr paucal forms).
- **Filtered empty state** — distinct from the no-elections empty state: "No elections match these filters" + hint + secondary Clear-filters button. The toolbar itself is hidden when the org has zero elections (nothing to filter).

## Decisions

- **Native `<select>`, no new dependency** — per the prototype and the project package rule; styling via Tailwind on the element + absolutely-positioned Lucide `ChevronDown`.
- **Predicates live in `elections-view.ts`, not the component** — pure and client-safe, so the unit tests and the list share one rule set (same pattern as `sortRecent`/`formatVotingDate`).
- **UTC year extraction** (`getUTCFullYear`) keeps server/browser output deterministic, matching `formatVotingDate`'s `timeZone: "UTC"` convention.
- **Sort toggle not built** — the design's sortable "Election" column header stays out of scope (filters only, per the spec).
- Filtering happens against the optimistic `rows` state (not props), so a just-renamed/deleted row filters correctly before the server refresh lands.

## Verification

- `npm run test` — 23/23 (4 files; 10 new predicate tests)
- `npm run build` — passes (TypeScript included, no route changes)
