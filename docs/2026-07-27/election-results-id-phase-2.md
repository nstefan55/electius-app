# Election Results ID Phase 2 — the tally

**Branch:** `feature/election-results-id-phase-2` · **Version:** 0.9.6 → 0.9.7
**Spec:** `context/features/Results Spec Files/election-results-id-phase-2-spec.md`
**Design:** `context/design/electius-app-design-prototype/project/Election Results ID Overview.dc.html`
(a *different* file from phase 1's `Election Results.dc.html`)

Phase 1 shipped the chrome and the status guard. This is everything below the top bar: stat cards, winner, vote distribution, votes-per-day chart, turnout donut, election details, and a pending audit-integrity card. Because the phase-1 guard runs first, every block here may assume the tally is disclosable.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/results-view.ts` | **new** — every derivation (ranking, ties, shares, quorum, day buckets) |
| `src/lib/results-view.test.ts` | **new** — 22 cases (235 total) |
| `src/components/elections/election-results.tsx` | **new** — the page body, server-rendered |
| `src/components/elections/results-charts.tsx` | **new** — the two charts, the only client code |
| `prisma/seed-results.ts` | **new** — candidates, vote distribution, quorum, spread timestamps |
| `src/lib/db/elections.ts` | `getElectionResults` — one `cache()`d org-scoped query |
| `src/app/[locale]/(app)/elections/[id]/results/page.tsx` | renders the tally past the guard |
| `messages/{hr,en}.json` | new `dashboard.election.results`; dropped orphaned `resultsFacet` |
| `src/components/elections/facet-scaffold.tsx` | **deleted** — this page was its last consumer |

No new dependency, no schema change, no new column.

---

## The derivations are the feature

Everything on the page comes out of `src/lib/results-view.ts`, which is pure and has no React or Prisma import. That matters because **the CSV export and the PDF report will consume the same functions** — one election must not get two different answers to "who won" or "what was the turnout".

Turnout and quorum deliberately stay in `elections-view.ts` (`turnoutPct`, `quorumRequiredVoters`); the dashboard and the election overview already share them, and one definition of a percentage is the entire point.

### Ties are prevented structurally, not checked for

```ts
rankCandidates(options, votesCast)   // isWinner: true on EVERY candidate at the top count
winnerOutcome(ranked)                // → { kind: "none" | "single" | "tie", candidates }
```

`isWinner` is set on all tied leaders, so the distribution card badges each of them with no extra logic and `winnerOutcome` merely filters and counts. The bug this forecloses is `sorted[0]` — the obvious implementation, which silently invents a winner out of a tie.

Two edge cases are load-bearing:

- `top > 0` guards the zero-vote case. Without it, an election where nobody voted would crown every candidate at once (all tied at 0).
- `kind: "none"` also covers an election with no candidates at all.

The winner card renders **"Izjednačeno" / "Tied"** instead of a name, lists every tied candidate with initials and role, and shows the shared vote count once. This decision binds the CSV (open decision #1) and the PDF.

### Multi-choice shares exceed 100%, and that is correct

`sharePct(votes, votesCast)` divides by **ballots cast**, not by total selections. On a `MULTI_CHOICE` election one ballot picks several options, so the shares sum past 100% — verified live at 132%. Each percentage answers "what share of ballots chose this option", which is the question an admin is actually asking. Dividing by total selections would sum to a tidy 100% and answer a different question.

### Quorum is met at the boundary

`quorumOutcome(voters, voted, threshold)` returns required/achieved as both counts and percentages. `voted >= requiredVoters` — exactly reaching the bar is enough — and the requirement ceils, because 49.2 voters is not enough. Both are pinned by tests.

---

## One query, and the anonymity boundary lives in its `select`

`getElectionResults(id, organizationId)` is `cache()`-wrapped like its siblings, so the layout, the phase-1 guard and this page share their round trips.

```ts
options: { orderBy: { orderIndex: "asc" }, select: { …, _count: { select: { votes: true } } } },
votes:   { select: { createdAt: true } },
_count:  { select: { voters: true, votes: true } },
```

Three things to notice:

1. **Per-candidate counts come from `_count` on the junction table**, so individual ballots are never read to produce a tally.
2. **`votes` selects `createdAt` and nothing else** — no id, no `batchOrder`, no option link. There is nothing in that projection to correlate a ballot with anything.
3. **Bucketing happens in the DB layer**, not in a component. `bucketVotesByDay` runs before the data leaves `getElectionResults`, so a raw timestamp never reaches the render tree.

`ponytail:` the timestamp read is unbounded (`findMany` over all votes). Fine at MVP scale — Free caps 50 voters per election, and the seed's largest is 336 — but swap in a `date_trunc` query if elections grow.

---

## The votes-per-day chart and the anonymity rule

The spec's anonymity section says never render `Vote.createdAt`. The design's second chart is exactly that. **Resolved in favour of the design**, on this reasoning:

- The rule's stated rationale is timing correlation, which is about *per-ballot ordering* — the thing `batchOrder` randomises. A daily bucket of 200 ballots is not an ordering.
- The chart shows daily totals with **no candidate split**, so the most it can reveal is "somebody voted Tuesday", never what they chose.
- There is direct precedent already shipping: the election overview renders an aggregate `votes where createdAt >= 24h` count (`election-overview-phase-2`).

The spec's own alternative — a per-candidate bar chart — was rejected as redundant: the distribution card directly above already draws a labelled bar per candidate.

Read the rule as **"never render per-ballot timestamps"**. If that reading is ever revisited, the chart is one component and one `select` line.

---

## The audit integrity card is deliberately pending

The Merkle tree lives in `Archive.proofData` / `merkleRoot`, and nothing writes an `Archive` row yet — the archive/Merkle spec is unstarted. The design shows a green "verified" card with a hash.

Shipped instead: neutral grey clock icon, "Zapečaćivanje još nije dostupno", a dashed empty slot reading "— dostupno nakon arhiviranja", and a sentence explaining that sealing happens at archiving. **No checkmark, no hash, no green.**

The spec is explicit and worth repeating: *a fabricated integrity claim is worse than an absent one*. When the archive spec lands, this card gets real content and its copy keys change; nothing else on the page moves.

---

## Seed data — `prisma/seed-results.ts`

The base seed (`prisma/seed.ts`) creates elections with aggregate vote counts only. Before this script the dev DB had **1 junction row for 1,660 votes**, options on 2 of 22 elections, and **zero** elections with a quorum — so per-candidate bars would all read 0% and the quorum card could never appear. This is the `ponytail:` note in `seed.ts` coming due.

Run it after the base seed:

```bash
npx prisma db seed          # base data
npx tsx prisma/seed-results.ts
```

It does three things, and is **idempotent** (elections that already have candidates are skipped; the rest is deterministic):

1. Adds 3–5 candidates per election, with `description` used as the role.
2. Distributes the **existing** ballots across candidates by fixed weights. `MULTI_CHOICE` elections get a second option on every third ballot, so the >100% path is exercised.
3. Sets a quorum on two closed elections — one met, one not — derived from their real turnout so both card states are demoable.

It also **spreads vote `createdAt` across each voting window**. The base seed writes every ballot at the same instant, which made the day chart a single bar. Timestamps are batched one `updateMany` per day; hundreds of individual `update` calls blow the 5s transaction timeout.

**It does not touch `prisma/seed.ts`.** That file had uncommitted work in the tree at the time, and a commit cannot split one file. Folding this into the base seed is a reasonable follow-up once that work lands.

---

## Layout notes

Two-column grid at `lg` (`1.7fr / 1fr`), stacking below. Left: distribution, then the day chart. Right: donut, election details, audit. Stat cards use `auto-fit minmax(220px, 1fr)`, so dropping the quorum card reflows the other three rather than leaving a hole.

The body is a **server component**; only `results-charts.tsx` is `"use client"`, because recharts measures the DOM. Chart labels are passed in as a `ChartLabels` prop rather than looked up client-side.

Deviation from the design: turnout renders as a whole percent (`turnoutPct`) where the prototype used one decimal. The shared helper wins — four surfaces publishing four roundings of one election is exactly what it exists to prevent.

---

## Verification

- `npm run test` — **235/235** (+22)
- `npm run build` — clean, `/[locale]/elections/[id]/results` resolves ƒ
- Browser pass, hr + en, seeded dev DB, **0 console errors**

| Case | Result |
| --- | --- |
| Quorum met | 85% turnout, 165 required of 235 → "Ispunjen" |
| Quorum not met | 87% vs 95% (252 of 265) → "Nije ispunjen" |
| No quorum configured | Stat card **and** detail row both absent |
| Multi-choice | Shares sum to 132%, "Više izbora" |
| Tie | "IZJEDNAČENO", both named, both badged |
| ARCHIVED | Full tally (the phase-1 divergence, with real data) |
| English | Complete, en-US dates |

Croatian paucal plurals verified across the range: "84 glasa", "56 glasova", "41 glas".

A throwaway tie election (7/7/4) was created, verified and removed **through the app's own delete flow** — `deleteMany` fails on the FK constraint because `Vote` deliberately has no cascade, which is precisely what `deleteElection`'s transaction handles. DB confirmed clean afterwards: 0 fixture rows, votes back to 1,660.

### Dev-environment gotcha (again)

`npm run build` clobbers the `.next` directory a running dev server serves from, and editing a watched file mid-session can do the same. The symptom is a **reload loop**: the server logs a steady stream of `200`s while the browser never finishes loading, with zero client console errors. It looks like an application bug and is not one. Kill the dev server, `rm -rf .next`, restart.

---

## Open next

- **`election-results-csv-export-spec`** and **`election-results-pdf-report-spec`** — both top-bar buttons are still `comingSoon` stubs. Both should import `results-view.ts` rather than recompute; the tie rule and the share denominator are already settled here.
- **Archive / Merkle spec** — fills the audit card and makes the PDF's audit note truthful.
- Folding `seed-results.ts` into `prisma/seed.ts` once the WIP there lands.
