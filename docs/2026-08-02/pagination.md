# Pagination

**Branch:** `feature/pagination` · **Date:** 2026-08-02

Numbered pagination across every admin list, plus a "Load more" cap on the dashboard.
One presentational component, five call sites, **two different data mechanisms** — and the
split between those mechanisms is the thing to understand before touching any of this.

---

## 1. The rule that decides everything

> **A client-side filter is only correct while the client holds the COMPLETE set.**

Every list here either has a client-side filter or it doesn't, and that single fact decides
whether it may be paginated in the query.

| Route | Per page | Mechanism | Why |
| --- | --- | --- | --- |
| `/elections` | 10 | **client** | status/turnout/window filters run over the full array |
| `/results` | 12 | **client** | `resultsRows()` drops statuses in JS after fetching |
| `/archive` | 6 | **client** | `matchesQuery` searches the full set |
| `/voters` | 10 | **server** | nothing filters it — `skip`/`take` hides nothing |
| `/elections/[id]/voters` | 10 | **server** | search + status already live in the WHERE clause |
| `/home` recent | 5 (+10/click) | **display cap** | one query also feeds the stat cards and both charts |

### Why the three filtered lists deliberately over-fetch

Adding `take: 10` to `/elections` would silently turn its filters into *filters of page 1*:

- filtering to "Active" would search 10 rows instead of 22;
- `windowYears(rows)` derives the year dropdown from the full set, so the dropdown would only
  offer years present on the current page;
- `/results` fetches all statuses then drops `DRAFT`/`SCHEDULED`/`ARCHIVED` **in JS** —
  `take: 12` then dropping 8 renders 4 rows while still claiming a next page.

**Full server-side pagination was evaluated and rejected on evidence**, not assumed. Two filters
have no Prisma `where` equivalent: turnout is a ratio of two relation `_count`s (there is no
`where` on a count value), and diacritic-insensitive search needs Postgres `unaccent`, which is
available but **not installed** on the development branch. Either path would put the 40/75
turnout thresholds and the `đ`-folding rule into a second, untested SQL implementation —
breaking invariant #5 on numbers an admin reads. Each of the three carries a `ponytail:` comment
naming both the ceiling and this obstacle.

**Measured cost today** (22 elections): `/elections` ships 22 rows in a 126 KB document. That is
the ceiling to watch. When it stops being acceptable, the fix is denormalized counter columns
plus `CREATE EXTENSION unaccent` — not a quiet `take`.

### Proof the server-paginated lists don't over-fetch

Verified against the served payload including the RSC data inside `<script>` tags, which is
where over-fetched rows would hide even though they never render:

| Surface | Rendered | Records in payload |
| --- | --- | --- |
| roster, election with **285 voters** | 10 | **10** — the other 275 never leave the DB |
| `/voters`, 22 elections | 10 | **10** |
| `/elections`, 22 elections | 10 | **22** (by design, see above) |

---

## 2. Files

### `src/lib/constants/pagination.ts` — the tunable numbers

Page sizes live alone, with no logic, so they can be changed without reading anything else:
`ELECTIONS_PER_PAGE` · `RESULTS_PER_PAGE` · `ARCHIVE_PER_PAGE` · `VOTERS_PER_PAGE` ·
`ROSTER_PAGE_SIZE` · `DASHBOARD_RECENT_ELECTIONS_LIMIT` · `DASHBOARD_RECENT_STEP`.

**Changing a number never changes a mechanism.** A list is server- or client-paginated because of
its filters, not because of its page size.

`ROSTER_PAGE_SIZE` moved here from `db/voters.ts` and dropped **25 → 10**.

### `src/lib/pagination.ts` — pure logic

`pageCountOf` · `clampPage` · `pageSlice` · `pageWindow` (+ `PageSlot`). No React, no Prisma,
no `server-only` — shared by server queries and client lists alike.

`pageWindow` renders a **fixed 7 slots** above the threshold:

```
pageCount = 29
page 1    ‹  [1] 2  3  4  5  …  29  ›
page 6    ‹  1  …  5 [6] 7  …  29  ›
page 29   ‹  1  …  25 26 27 28 [29]  ›
```

The width never changes, so prev/next cannot shift under the cursor mid-click. `SLOTS` is **not**
a free knob — the branch thresholds (`<= 4`, `>= last - 3`) assume 7.

Two invariants the tests pin, both mutation-checked:
- the control is always exactly 7 slots above the threshold;
- **a gap never hides a single page** — `1 … 3` would occupy the same width as `1 2 3`.

### `src/lib/use-pagination.ts` — the client half

```ts
const { page, pageCount, setPage, pageItems } = usePagination(filtered, PER_PAGE, resetKey);
```

Encodes the two rules that must not differ between lists:

1. **`resetKey` changes → back to page 1.** Filter to 2 results while on page 4 and you would
   otherwise see a blank list. This is the single most important behaviour in the feature.
2. **`page` is clamped to the live `pageCount`.** Delete the last row of the last page and the
   view falls back one page instead of going blank with an unhighlighted control.

Page state is **React state, not `?page=`**, for these three: their filters are *also* local
state, so a shared `?page=3` link would restore a page without the filter that produced it.

> Adding a fourth filter to a list? Add it to `resetKey` too. The clamp in rule 2 means a
> forgotten reset degrades to a wrong-but-populated page rather than a blank one.

### `src/components/ui/pagination.tsx` — two exports

- **`Pagination`** — purely presentational. Takes `{ page, pageCount, onPageChange }` and
  **never learns where the numbers came from**. Server mode passes `pageCount` from the query;
  client mode computes it from `filtered.length`. This is what keeps the server/client split out
  of the UI entirely. Renders `null` at `pageCount <= 1`.
- **`UrlPagination`** — the adapter for server-rendered lists. A Server Component **cannot pass a
  callback across the boundary** (props must be serializable), so this thin client wrapper owns
  the router push. Chosen over giving `Pagination` a second link-rendering mode, so the shared
  component keeps exactly one contract.

Accessibility: `<nav aria-label>`, `aria-current="page"` on the active number, per-button
`aria-label` ("Page 7"), ellipsis `aria-hidden`, prev/next disabled at the ends and labels
collapsing to `sr-only` below `sm`.

### i18n

`common.pagination` — `label` · `page` · `prev` · `next` · `goToPage`, shared by all five call
sites. `dashboard.voters.pagination` was **removed**; leaving a second copy would let the two
drift. `dashboard.page.list.loadMore` / `loadMoreRemaining` added for `/home`.

Both catalogs were edited by a script that **aborts unless a parse → serialise round trip
reproduces the file byte-for-byte first**. These files are CRLF; without that guard a stray LF
rewrite shows up as a ~900-line diff. Result: 14 and 18 lines changed.

---

## 3. `/home` — a display cap, not a query limit

**Do not put `take` on `getDashboardData`.** One query feeds four consumers: `StatCards`
(`computeStats` runs over the whole array), `LiveHero`, `DashboardCharts`, `RecentElections`. A
query limit silently corrupts the stat cards and both charts.

The rows are already in hand; the button only reveals more. Shows 5, then **+10 per click**,
button retires when nothing is left, and the remaining count is shown beside the label.

Verified live: 5 → 15 → 17 rows while the stat cards continued to read **3,244 voters / 49%
average turnout** across all 22 elections — the cap never reached the aggregates.

---

## 4. Bug fixed along the way

`getVoterRoster` clamped only the low end of `page`, so `?q=…&page=8` on a query that now matched
three voters returned an **empty list** *and* hid the pagination control (`pageCount` 1) — a dead
end escapable only by hand-editing the URL. It now clamps against `pageCount` **before** `skip`.

This forced one extra sequential round trip (count → clamp → findMany) because the skip depends
on the count. The ownership `findFirst` deliberately still runs first: running the count in
parallel with it would break the documented reasoning that the unscoped `groupBy` is only ever
reached after ownership passes.

Dropping the roster from 25 to 10 per page made stale deep links likelier, so this stopped being
theoretical. `?page=999` now lands on the last page; so does `?page=abc`.

---

## 5. Surfaces deliberately NOT paginated

Requirement 18 ("check any sub-pages that use lists or cards") was swept. Each was rejected for a
reason, not skipped:

- **Wizard voter list** (`step-voters.tsx`) — the one genuinely unbounded surface left, but it is
  a *review* list after a CSV import; 285 voters at 10/page is 29 pages of clicking to verify one
  import. Its remove handler indexes the absolute array (`filter((_, j) => j !== i)`), so
  paginating without offsetting the index would **delete the wrong voter**.
- **`add-voters-dialog.tsx`** — already correct: `max-h-56 overflow-y-auto`, a scrolling staging
  list inside a modal. Same absolute-index caveat.
- **Results distribution** (`election-results.tsx`, public `/results/[id]`) — a tally must read
  whole, and splitting it would disagree with the CSV and PDF exports, which emit every candidate.
- **`election-report.tsx`** — a printed document. Chromium paginates it; in-page pagination would
  fight the print engine.
- **Wizard candidates/review, overview activity + config, archive audit modal** — bounded by
  candidate count or fixed rows.

---

## 6. Verification

`npm run test` **420 passing** (26 files, +13) · `npm run lint` clean · `npx tsc --noEmit` clean ·
`npm run build` clean (44 routes) · **0 console errors**.

Browser pass on the seeded dev DB, hr + en:

- `/elections` — 3 pages, 10 rows, prev disabled on page 1, next disabled on page 3 (2 rows).
- **Filter reset** — filtered from page 3 to a 1-result filter → **1 row rendered, not blank**.
  Clearing returned to page 1 of 3. Same on `/archive` via search.
- `/voters` — `?page=3` → page 3 of 3; **`?page=999` → clamped to page 3**, not empty.
- Roster — 285 voters, page 1 of **29**, window rendering `1 2 3 4 5 … 29` (7 slots).
- `/home` — 5 → 15 → 17, button retires; stat cards unaffected.
- `/results` — layout toggle (cards ⇄ rows) **preserves the page**; it is a display preference,
  not a filter, so it is deliberately absent from `resetKey`.
- `/en` — full English, `nav[aria-label="Pagination"]`.

`/archive` (5 rows) and `/results` (10 rows) are single-page at their real sizes, so their
multi-page path was proven by temporarily setting the constants to 2 and 3 (→ 3 and 4 pages) and
restoring byte-identically. That doubles as proof the constants file actually drives behaviour.

---

## 7. Known ceilings

- The three client-paginated lists fetch the whole org's rows. Fine at MVP scale; the upgrade
  path is denormalized counters + `unaccent`, marked at each call site.
- `usePagination` holds `page` in local state, so it resets on remount (navigating away and back
  returns to page 1). Deliberate for filtered lists; the two server lists keep `?page=` and don't
  have this.
- `getElectionsPage` runs `count` then `findMany` sequentially, as the skip depends on the count.
