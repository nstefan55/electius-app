# Election Results ID Phase 1 — results detail chrome + status guard

**Branch:** `feature/election-results-id-phase-1` · **Version:** stays 0.9.6 (bump skipped at the user's request)
**Spec:** `context/features/Results Spec Files/election-results-id-phase-1-spec.md`
**Design:** `context/design/electius-app-design-prototype/project/Election Results.dc.html`

`/elections/[id]/results` was a routing-phase-3 `FacetScaffold`. It now has real chrome — a status-keyed subtitle, two export buttons, and the three-way status guard that decides whether the page shows a tally at all. The tally body itself is still a scaffold; that is `election-results-id-phase-2-spec`.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/elections-view.ts` | `resultsDetailAccess()` — the page-level variant of `resultsAccess()` |
| `src/lib/elections-view.test.ts` | +3 cases (213 total) |
| `src/components/elections/election-topbar.tsx` | `resultsMode` prop, facet detection, results subtitle, export buttons |
| `src/app/[locale]/(app)/elections/[id]/layout.tsx` | passes `resultsMode` (+1 line) |
| `src/app/[locale]/(app)/elections/[id]/results/page.tsx` | the status guard + sealed notice |
| `messages/{hr,en}.json` | one new key (`dashboard.election.topbar.exportCsv`); reworded the facet scaffold note |

No new dependency, no schema change, **no new DB query**.

---

## The status guard

Three outcomes, not the usual show/404 binary:

| Election state | Page renders |
| --- | --- |
| `CLOSED` · `ARCHIVED` · `ACTIVE`+`LIVE` | the tally (phase 2 fills it) |
| `ACTIVE` + `AFTER_CLOSE` | **sealed notice** — explained, not hidden |
| `DRAFT` · `SCHEDULED` | `notFound()` — no ballots exist |
| cross-org id | `notFound()` from the layout's existing `getElectionDetail(id, orgId)` |

The sealed case is the one worth remembering. It is **not** a 404: the admin owns this election and needs to know why the page is empty and when it will fill. It reuses the exact translation keys the `/results` sealed modal uses (`dashboard.resultsPage.sealedTitle` / `sealedBody`) rather than getting its own copies — the spec requires the same explanation in both places, and two separate strings drift apart the first time someone edits one.

Cross-org and missing ids both 404 from the layout, so this page is never an existence oracle.

### This closes a ceiling recorded on 2026-07-26

`docs/2026-07-26/results-overview.md` flagged that blocking a sealed row on `/results` was UX only, because `/elections/[id]/results` stayed reachable by URL. That gap is now closed at the page: a sealed election refuses to render a tally regardless of how you arrive. The guard is in place *before* phase 2 renders real numbers, so there is no window in which numbers exist without it.

The export endpoint remains the only enforcement point that is a true security boundary (`election-results-csv-export-spec` §Delivery). Page-level guards are correctness for the UI; the endpoint is correctness for the data.

---

## `resultsDetailAccess` — one rule, one deliberate divergence

```ts
resultsDetailAccess({ status, resultsMode })  // → "live" | "sealed" | "closed" | null
```

It delegates straight to `resultsAccess()` and differs on exactly one status:

| Status | `resultsAccess` (the `/results` list) | `resultsDetailAccess` (this page) |
| --- | --- | --- |
| `ARCHIVED` | `null` — the row belongs to `/archive` | `"closed"` — **renders** |
| everything else | identical | identical |

That divergence is the entire reason a second function exists. `/archive` links here with a "View details → results" action, so an archived election must show a tally even though its row lives on another page. A test pins the divergence to one status and asserts the two functions agree on every other input, so a future edit to `resultsAccess` cannot silently change what this page does.

`null` means `notFound()` here, whereas on the list it means "not a row". Same shape, different consumer.

---

## Where the chrome lives

The subtitle and export buttons are added inside the shared `ElectionTopbar`, which detects the facet itself:

```ts
const onResults = pathname === `/elections/${id}/results`;
const access = onResults ? resultsDetailAccess({ status, resultsMode }) : null;
```

`usePathname()` from `@/i18n/navigation` is locale-stripped, so it matches the flat href — the same pattern `ElectionTabs` already uses in the same layout.

**Why not a second header on the page?** The design has exactly one header. Rendering a results-specific header below the tabs would stack two headers and diverge from the prototype. The Overview and Voters tabs are untouched — they still read "Pregled izbora" with no export buttons.

**Subtitle** is keyed on access: `lineClosed` (with the closing date via `formatVotingDateTime`, the same helper the `/results` list uses, so the date reads identically on both surfaces) · `lineLive` · `lineSealed`.

**Export buttons follow the page** — present whenever the tally renders, absent when it does not. There is no state where the page shows numbers the exports refuse to write. Note this differs from `/results`, where sealed rows render the buttons *disabled*; the spec asks for absent here.

---

## Decisions recorded

Two spec-vs-design conflicts were resolved by the user at `start`:

1. **Heading** — the spec says the left region reads `Results — {title}`; the prototype keeps the plain title. **Chose the prototype:** the h1 stays the election title on all three facet tabs and only the subtitle swaps. The active tab already says "Rezultati", so the prefix was redundant and consumed truncation room on long titles.

2. **Action set** — the prototype's results screen drops Edit / Close / Remove and shows only exports + Exit. **Chose the spec:** the shared bar keeps everything and *gains* the two exports. The prototype's version would make "Close election" tab-dependent, so an admin would have to navigate back to Overview to end voting.

Implementation calls made without asking:

- **Exports are stubs.** Both target specs (`election-results-pdf-report-spec`, `election-results-csv-export-spec`) are unstarted, so the buttons fire the established `comingSoon` toast — same precedent as the `/results` list. Labels and placement are final; only the handler changes.
- **Both buttons use the ghost style**, not the design's primary-blue CSV. The bar already encodes hierarchy as danger (destructive) vs ghost (everything else); a third weight beside "Ukloni izbore" read as noise. Recorded deviation.
- **CSV label is distinct** — `Izvoz rezultata` / `Export results`, not the list's bare "CSV". The voter-roster export (`Izvezi popis birača`) sits two clicks away on the Overview Actions card and is a different document; two identically-labelled buttons producing different files is a support ticket.
- **The facet scaffold note was reworded** — it promised "PDF/CSV export", which now visibly sits in the top bar. It describes only what phase 2 owns: tally, winner, audit record.

---

## Things to know when you touch this

- **No extra DB round trip.** The page calls `getElectionDetail(id, orgId)` even though the layout already did. That helper is `cache()`-wrapped, so within one request both share a single query. This is the standard workaround for a layout being unable to pass props to its page.
- **`notFound()` drops the election chrome.** The nearest boundary is `(app)/not-found.tsx`, which sits *above* `elections/[id]/layout.tsx`. So a draft's results URL renders the 404 card inside the app shell with no top bar or tabs — verified in the browser, not assumed.
- **Sidebar highlights Elections, not Results.** Results is a facet of an election. This needed no code change; `SidebarNav` prefix-matching already handles it. Confirmed against the DOM classes.
- **`resultsMode` was already on `ELECTION_SELECT`**, so adding the prop cost one line in the layout and no query change.

---

## Verification

- `npm run test` — **213/213** (+3)
- `npm run build` — clean, `/[locale]/elections/[id]/results` resolves ƒ
- Browser pass on the seeded dev DB (hr + en, **0 console errors**): all five status branches; Overview tab confirmed unchanged (no exports, "Pregled izbora"); sidebar active state on Izbori; stub toast fires; English complete.

The seed contains no `LIVE` election, so one ACTIVE row was temporarily flipped with a throwaway script and restored. Dev DB verified back to its seeded state (4 DRAFT / 3 SCHEDULED / 5 ACTIVE / 6 CLOSED / 4 ARCHIVED, all `AFTER_CLOSE`); script deleted.

### Dev-environment gotcha

Running `npm run build` while a dev server is running **clobbers the `.next` directory the dev server is serving from**, producing `ChunkLoadError` on any route that then needs fresh compilation. Warm routes keep working, which makes it look like a code bug. The fix is to restart the dev server. If you verify in the browser after a build, restart first.

---

## Open next

- `election-results-id-phase-2-spec` — the tally body (winner banner, stat cards, distribution, audit). It slots into the `FacetScaffold` branch; the guard around it is already built.
- `election-results-csv-export-spec` / `election-results-pdf-report-spec` — the two stubbed buttons. The PDF spec still has to decide preview-route vs direct download.
- The audit-integrity card in phase 2 is blocked on `Archive.merkleRoot`, which nothing writes yet (archive/Merkle spec).
