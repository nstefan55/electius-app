# Dashboard Elections — Live DB Data

Replaces the dashboard main area's mock data (`src/lib/mock-data.ts`) with live
Prisma queries against Neon. The layout, design, and i18n are unchanged — only
the data source moved. Spec: `context/features/dashboard-elections-spec.md`.

## What changed

| Before | After |
| ------ | ----- |
| Each component imported `elections` / `dashboardStats` from `mock-data.ts` | `page.tsx` fetches once via `getDashboardData()` and passes props down |
| `recentElections()` sort helper lived in `recent-elections.tsx` | Moved to `src/lib/elections-view.ts` as `sortRecent()` (pure, client-safe) |
| Static page | `export const dynamic = "force-dynamic"` — fresh data every request |
| Live hero was static | Client component polling turnout on an interval |

## Data flow

```
page.tsx (server, force-dynamic)
  └─ getDashboardData()  ── src/lib/db/elections.ts (server-only)
       → { elections: DashboardElection[], stats: DashboardStats }
          ├─ <StatCards stats />           (server)
          ├─ <LiveHero elections />        (client — polls fetchTurnout)
          ├─ <RecentElections elections /> (server)
          └─ <DashboardCharts elections /> (client)
```

One query serves the whole page. `getDashboardData()` runs a single
`election.findMany` with `_count` on `voters` and `votes`, then maps each row to
the `DashboardElection` shape the components already expected (same fields as the
old mock: `id, name, type, status, voters, voted, opens, closes` + `resultsMode`).

## Files

| File | Role |
| ---- | ---- |
| `src/lib/db/elections.ts` | `server-only`. `getDashboardData()` + `getElectionTurnout(id)`; owns the DB→view mapping and stat computation |
| `src/lib/elections-view.ts` | Pure types (`DashboardElection`, `ElectionStatus`, `ResultsMode`) + `sortRecent()`. No DB, importable by client components |
| `src/actions/dashboard.ts` | `"use server"` — `fetchTurnout(id)` wraps `getElectionTurnout` for the live-hero poll |

## Field mapping (DB → view)

- `title` → `name`
- `votingType` (`SINGLE_CHOICE` / `MULTI_CHOICE`) → `type` label (`"Single choice"` / `"Multiple choice"`). The schema only has these two; the old mock's freer labels ("Ranked choice", "Yes / no referendum") don't exist in the DB.
- `voted` = `_count.votes` (anonymous ballots cast; equals voters with status `VOTED`).
- `voters` = `_count.voters` (eligible electorate).
- `startsAt` / `endsAt` → `opens` / `closes`, formatted `"Jun 18"` (`toLocaleDateString en-US, month short + day`).

## Stats

Computed in `computeStats()` from the fetched rows (no separate query):

- **activeElections** — count of `status === "ACTIVE"`.
- **totalVoters** — sum of every election's voter count.
- **avgTurnout** — mean of `voted / voters` across elections with `voters > 0`, as a percent. (The old mock hardcoded 66%; the real seed computes to **60%**.)
- **archived** — count of `status === "ARCHIVED"`.

## Live turnout polling

The live hero (featured active election with the most ballots cast) is a client
component. It seeds turnout from the server-rendered props, then polls
`fetchTurnout(heroId)` on an interval and updates the bar + numbers in place:

- **LIVE** results mode → **15 s** interval.
- Otherwise → **60 s** interval.

`ponytail:` polling, not websockets — Vercel serverless has no persistent
connections (the project overview lists "no persistent processes" as a known
MVP constraint). Polling is the correct fit; swap for SSE/websockets only if a
dedicated realtime service is added later.

## Scope notes

- The **sidebar** account block and the **`DashboardHeader`** org name still read
  `currentUser` from `mock-data.ts` — there's no auth yet, and the spec targets
  the election data in the main area. `mock-data.ts` also remains the source for
  `prisma/seed.ts`, so it is not deleted.
- Row action menus, create/delete, inline rename, and the results/wizard links
  remain deferred (unchanged from Phase 3).

## Verification

- `npm run build` — passes, TypeScript clean. `/[locale]/dashboard` is now
  `ƒ (Dynamic)`.
- Queried the seeded `development` branch: stats `{ activeElections: 3,
  totalVoters: 3837, avgTurnout: 60, archived: 2 }`; per-election voter/vote
  counts match `mock-data.ts` exactly.
