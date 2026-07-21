# Routing Structure — Phase 3: Election Aggregate-Root Nesting

**Branch:** `feature/routing-structure-phase-3` · **Spec:** `context/features/routing-structure-phase-3-spec.md`

Phase 3 of the routing migration. Builds the `/elections/[id]` aggregate-root (one fetch + authz + shared chrome, tab nav, thin facets) and the three cross-election **list** routes that funnel into it. Structural only — page *contents* stay owned by the `election-overview-*`, `election-results-*`, and `elections-archived-*` specs.

## What shipped

### The aggregate root — `(app)/elections/[id]/`

```
elections/[id]/
├── layout.tsx        fetch once · authz seam · notFound · chrome (title · badge · tabs)
├── page.tsx          Overview facet — status-adaptive shell
├── results/page.tsx  Results facet — scaffold
└── voters/page.tsx   Voters facet — scaffold
```

`layout.tsx` is the **single choke point**:

1. `await requireSession()` — the Phase-2 no-op guard seam. Carries `TODO(auth-spec)`: real org-ownership enforcement lands with the auth spec as a one-line swap that guards **every** facet at once.
2. `getElectionDetail(id)` — one query.
3. `if (!election) notFound()` — Next.js 404 (structural, not an auth decision).
4. Renders shared chrome (election title, `StatusBadge`, `ElectionTabs`) wrapping `{children}`.

Adding a future facet (`settings/`, `audit/`, live `monitor/`) is a new folder under `[id]/` — no duplicated fetch, authz, or header.

### The "fetch once" mechanism — `cache()`, not prop-drilling

App Router `layout.tsx` and `page.tsx` are siblings wrapped by `{children}`; a layout **cannot** pass fetched data to its page as props. So the single-fetch guarantee is **React request memoization**:

```ts
// src/lib/db/elections.ts
export const getElectionDetail = cache(async (id: string) => { … });
```

The layout calls it for the chrome; the Overview facet calls it to branch on `status`. `cache()` dedupes both into **one** DB round trip per request. The Results/Voters facets read nothing yet (pure scaffolds), so those children genuinely contain no fetch/authz call. `requireSession()` is called **only** in the layout.

`elections.ts` was refactored to share `ELECTION_SELECT` + a `toDashboardElection` mapper across `getDashboardData`, `getElectionsByStatus`, and `getElectionDetail`.

### Status-adaptive overview shell — `[id]/page.tsx`

Branches `election.status` into three labelled scaffold regions:

| Status | Variant | Shell |
| --- | --- | --- |
| DRAFT / SCHEDULED | `draft` | setup summary + edit |
| ACTIVE | `active` | live turnout + management (reminder, close early) |
| CLOSED / ARCHIVED | `closed` | sealed summary (results live in the Results tab) |

### Cross-election list routes — top-level sidebar sections

| Route | Query | Row funnels to | UI |
| --- | --- | --- | --- |
| `(app)/results` | CLOSED | `/elections/[id]/results` | `ElectionFunnelList` (server) |
| `(app)/voters` | all | `/elections/[id]/voters` | `ElectionFunnelList` (server) |
| `(app)/archive` | ARCHIVED | `/elections/[id]/results` | `ArchiveList` (client, inline row menu) |

Both **Results** and **Archive** funnel into the same canonical `/elections/[id]/results` — one detail surface, multiple entry points. Archive has **no** `/archive/[id]` detail route; its row menu exposes View details (→ nested results), Export PDF, Audit log, Hide, Delete — the last four are `comingSoon` toast placeholders (Hide's `hidden` flag + real delete belong to the archive-filtering + results specs).

## New / changed files

- `src/lib/db/elections.ts` — `getElectionDetail` (cached), `getElectionsByStatus`, shared select/mapper.
- `src/lib/elections-view.ts` — extracted shared `STATUS_STYLES` (client-safe).
- `src/components/elections/` — `status-badge`, `election-tabs` (client, active-state), `facet-scaffold`, `election-funnel-list`, `archive-list` (client).
- `src/app/[locale]/(app)/elections/[id]/{layout,page,results/page,voters/page}.tsx`.
- `src/app/[locale]/(app)/{results,archive,voters}/page.tsx` — stubs → funneling scaffolds.
- `src/components/dashboard/recent-elections.tsx` — imports the shared `STATUS_STYLES` (dropped its local copy).
- `messages/{hr,en}.json` — new `dashboard.election` namespace.

## Verification

- `npm run build` passes — no route collisions; `[id]`, `[id]/results`, `[id]/voters` resolve as dynamic (ƒ).
- Runtime (dev server, dashboard host, seeded dev DB): detail renders chrome + tabs; tab active-state persists across facets; the three status variants render the right shell; unknown id → 404; `/results`·`/archive`·`/voters` funnel to the correct nested paths; bilingual (hr/en).

## Not in scope (owned elsewhere)

Facet page contents, real auth/org enforcement, `/elections` list + `/elections/new` wizard, archive filtering (`hidden` flag), `/elections/[id]/settings`, public voter results (Phase 4).
