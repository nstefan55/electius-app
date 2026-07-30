# Elections Archived Phase 2 — Archive Card Grid

**Branch:** `feature/elections-archived-phase-2` · **Version:** stays 0.9.8 (bump skipped at user request)
**Spec:** `context/features/Archived Spec Files/elections-archived-phase-2-spec.md`
**Design:** `context/design/electius-app-design-prototype/project/Elections Archived.dc.html`

`/archive` stops being a row list and becomes the card grid: title · timeline · participation ·
winner · **View / PDF / Audit**. Phase 1's header and search sit on top of it, unchanged.

No new dependency. No schema change. No server action. One new DB query.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/db/elections.ts` | **+** `getArchivedElections` · **+** `ArchivedElection` |
| `src/components/elections/archive-list.tsx` | rewritten — card grid, winner cell, audit modal; ⋯ menu removed |
| `src/app/[locale]/(app)/archive/page.tsx` | reads the new query |
| `src/lib/urls.ts` | **+** `CONTACT_EMAIL` (lifted out of `election-report.tsx`) |
| `src/components/elections/election-report.tsx` | imports the shared const; `(SHA-256)` gone from its audit note |
| `messages/{hr,en}.json` | **+8 keys**, **−2 blocks** (`actions`, `comingSoon`) |
| `docs/post-mvp-feature-list.md` | new **Archive** section — Hide, Delete |

**284 tests pass** (unchanged — see [No new tests](#no-new-tests)). `npm run lint` and
`npm run build` clean.

---

## The query: one round trip, and where the tallies stop

`getElectionsByStatus` returns `DashboardElection` — no candidates, no per-option counts — so it
**cannot answer "who won"**. That was the single largest gap in the original spec draft.

Two wrong ways to close it, both rejected:

- **`getElectionResults` per row** — N+1. Eight archived elections, nine queries.
- **Widen `ELECTION_SELECT`** — `/elections`, `/results` and the dashboard all share that select and
  would start paying for options they never render. Same reasoning that made `getElectionOverview`,
  `getElectionResults` and `getBallotPreview` separate reads.

So: a dedicated `getArchivedElections(organizationId)`, one `findMany`, Prisma nests the joins.

```ts
select: {
  ...ELECTION_SELECT,
  options: { orderBy: { orderIndex: "asc" },
             select: { id, text, description, _count: { select: { votes: true } } } },
  archive: { select: { merkleRoot: true, createdAt: true } },   // null until sealed
}
```

**The winner is derived in the DB layer, not the component:**

```ts
const ranked = rankCandidates(options.map(…), base.voted);
return { ...base, winner: winnerOutcome(ranked), sealed: … };
```

This is not only tidiness. Deriving here means **per-candidate vote counts never enter the render
tree** — the component receives a `WinnerOutcome`, not numbers it could accidentally re-rank or
re-percentage. Same precedent as `getElectionResults`, which calls `bucketVotesByDay` inside the
query rather than handing raw ballot timestamps to a chart.

`ponytail:` unbounded `findMany`, a handful of options per row. Fine at MVP scale; paginate if an
archive ever reaches thousands.

---

## Winner has three forms, and the card renders all three

`winnerOutcome` returns `single` · `tie` · `none`. A card reading `ranked[0]` invents a winner that
does not exist — the exact bug `isWinner`-on-every-leader forecloses.

| `kind` | Card shows |
| --- | --- |
| `single` | name + `winnerShare` (`31% od ukupno birača`) |
| `tie` | **Izjednačeno** + every tied candidate, `Marko Horvat · Ivana Novak` |
| `none` | **Nema pobjednika**, no sub-line (zero ballots) |

Labels are reused from `dashboard.election.results` — `winner`, `winnerTie`, `winnerNone`,
`winnerShare` already exist and already mean this.

### Two denominators, deliberately

The card shows **two different percentages** and they are not redundant:

| Number | Function | Denominator | Answers |
| --- | --- | --- | --- |
| `72%` beside the bar | `turnoutPct` | all eligible voters | how many voted |
| `31% od ukupno birača` | `voterSharePct` | all eligible voters | how much of the electorate backed the winner |

The prototype printed the turnout percentage **twice** — once under the bar and again as the
winner's sub-line. Replaced with the winner's own share, which is the number the results page and
the PDF report already print in that position, so the three surfaces agree.

Live-proven on one election: results page and archive card both read *Ana Kovačević · 38 ·
31% od ukupno birača · 72% (87/121)*.

---

## The audit modal

Shows the audit note the PDF report prints, plus the integrity record. **Two branches, keyed on
whether the `archive` row exists.**

| State | Modal |
| --- | --- |
| **Sealed** | green shield · the real 64-hex Merkle root, labelled, monospace · `Zapečaćeno {date}` |
| **Not sealed** | grey clock · dashed `— dostupno nakon arhiviranja` · `auditPendingBody` |

**The unsealed branch is permanent, not scaffolding.** `Archive.merkleRoot` has no writer yet
(`election-archive-merkle-seal-spec` is unstarted), and per that spec elections archived before the
seal ships can never be sealed retroactively. That branch is the honest terminal state for a whole
cohort of rows — do not delete it when the seal lands.

### Why the copy comes from a key and not the design

The prototype's audit modal contains two things that must never reach production:

```js
auditBody: '… Revizijski trag je provjeren i nisu utvrđene nikakve nepravilnosti.'
auditHash: '0x9f2a4c7e1b8d3f6a2c5e9b0d4f7a1c8e3b6d9021'
```

1. **"has been verified / no anomalies were detected" is a claim the product cannot make.** Nothing
   verifies anything. That sentence was deliberately softened out of the PDF report (decision D3,
   2026-07-28) in favour of copy describing *how* votes are recorded — every clause of which is true
   today. So the modal **references `dashboard.election.report.auditBody`**, the same key the report
   prints. Two copies of an integrity claim drift, and this one would drift toward a falsehood in a
   document organizations keep.
2. **`auditHash` is fabricated** — 40 hex characters, `0x` prefix, Ethereum-shaped. The real
   `Archive.merkleRoot` is `CHAR(64)`, SHA-256. Never render a placeholder hash.

> **Shared-key consequence:** `(SHA-256)` was removed from `auditBody` during this feature at the
> user's request. Because the key is shared, **the PDF report lost it too.** That is the intended
> trade: one key, both surfaces move together. If the two ever need to diverge, that is a decision
> to take explicitly — not a second key added quietly.

---

## Hide and Delete were removed, not stubbed

`archive-list.tsx` shipped five row actions in a ⋯ menu. The card design has three real buttons and
no menu, so the menu is gone — and with it the `Hide` and `Delete` `comingSoon` stubs, plus their
i18n keys.

Nothing was lost: both were toast stubs. Both are now named entries in
`docs/post-mvp-feature-list.md` under a new **Archive** section, each with the ruling it still needs:

- **Hide** — there is no `hidden` field in the schema, and no definition of what "hidden" means for
  a row already in an archive (hidden from `/archive` only? from the turnout stats too?).
- **Delete** — deleting the `Archive` row and deleting the election are **different operations**.
  `deleteElection` already does the latter, cascading everything; the Free-tier copy promises
  "delete any archive at any time", which reads as the former.

Both belong with the retention/billing spec, which is where the promise was made.

---

## Recorded deviations from the prototype

| Prototype | Shipped | Why |
| --- | --- | --- |
| micro-labels `#9CA3AF` | `neutral-600` | `neutral-400` fails WCAG AA; design-system marks it placeholder-only |
| 1180px content cap → 2 columns | `auto-fill minmax(420px,1fr)`, no cap | no other `(app)` page caps; 2 columns at laptop width, 3 on a wide monitor |
| `info@electious.com` | `contact@electius.com` | pre-rebrand address; shared `CONTACT_EMAIL` |
| modal title "Napomena o reviziji" | `results.auditTitle` — "Integritet zapisa" | it holds the note *and* the record, and that is what this is called on the results page |
| plan-cap chip (`n / 10 arhivirano`) | not rendered | carried over from phase 1 — nothing enforces a cap, so the chip would assert a limit the product does not have |

---

## No new tests

284 before, 284 after. Everything this feature derives goes through functions that are already
pinned: `rankCandidates`, `winnerOutcome`, `voterSharePct`, `turnoutPct`, `matchesQuery`. The new
code is a query and a render tree — the first is verified against the DB, the second in the browser.

Adding a test here would assert that `rankCandidates` still ranks, which
`results-view.test.ts` already does.

---

## Verification

Seeded dev DB, both locales, **0 console errors**:

- four archived cards reconcile with their own results pages
- search still filters the grid — `ŠTUDENTSKOG DOMA` → *Showing 1 of 5* (diacritic fold intact)
- `/en/archive` fully English, `/en/` hrefs on both links

The seed has no tie, no zero-vote election and no seal, so a throwaway fixture proved those three:

| Branch | Rendered |
| --- | --- |
| `none` | `0 / 3 glasova` · 0% · **Nema pobjednika**, no sub-line |
| `tie` | `2 / 3 glasova` · 67% · **Izjednačeno** · `Marko Horvat · Ivana Novak` |
| sealed | green shield · `aaaa…bbbb` (64 hex) · `Zapečaćeno 30. srp 2026. · 10:08` |

Fixture removed afterwards; DB SQL-confirmed back to 22 elections / 4 archived / 1660 votes /
0 archives / 0 fixture rows.

---

## Dev-environment note (recurring)

`npm run build` clobbers the `.next` directory a running dev server is serving from. The symptom is
a `ChunkLoadError` or a reload loop on any route needing fresh compilation — looks like an app bug,
is not. Kill the dev server, `rm -rf .next`, restart. Hit again this session; the running server had
to be killed by PID (`Get-NetTCPConnection -LocalPort 3000`) because a second `npm run dev` silently
moved to port 3001 rather than taking over.

---

## Open next

- **`election-archive-merkle-seal-spec`** — writes the `Archive` rows this page reads. When it
  lands, the sealed branch starts firing on new elections and the report's audit note can
  legitimately strengthen. One edit to `auditBody` updates both surfaces.
- **Retention / billing spec** — owns the Free 1-year prune, the plan-cap chip, and the Hide/Delete
  rulings above.
