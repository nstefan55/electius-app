# Election Results CSV Export

**Branch:** `feature/election-results-csv-export` · **Version:** 0.9.7 → 0.9.8
**Spec:** `context/features/Results Spec Files/election-results-csv-export-spec.md`
(reviewed and patched before implementation — all four open decisions resolved)

The **Izvoz rezultata** button on `/elections/[id]/results` was a `comingSoon` toast. It now downloads the results tally as CSV: a key/value header block, a blank line, then the candidate table. The `/results` list's per-row **CSV** and **PDF izvještaj** buttons became real links in the same pass.

No new dependency. No schema change. No new DB query.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/results-export.ts` | **new** — the pure builder + label resolver |
| `src/lib/results-export.test.ts` | **new** — 19 cases |
| `src/app/api/elections/[id]/results/export/route.ts` | **new** — 44-line route handler |
| `src/components/elections/election-topbar.tsx` | CSV button: toast → `<a href>` |
| `src/components/elections/results-overview-list.tsx` | both row buttons wired; `stub`/`toast` deleted |
| `messages/{hr,en}.json` | `+dashboard.election.results.export`, `−dashboard.resultsPage.comingSoon` (orphaned) |

**258 tests pass** (from 239).

---

## The file

```
Polje;Vrijednost
Organizacija;Veleučilište Velika Gorica
Izbori;Izbor člana Upravnog vijeća iz reda studenata
Vrsta;Standardni · Jedan izbor
Otvoreno;2026-07-08
Zatvoreno;2026-07-13
Pobjednik;Ana Kovačević
Ukupno birača;235
Predano glasova;200
Konačna izlaznost;85%
Kvorum;Ispunjen
Kvorum (potrebno);70% (165)
Kvorum (postignuto);85% (200)

Kandidat;Uloga;Glasova;Postotak
Ana Kovačević;Predsjednica;84;42%
Marko Horvat;Tajnik;56;28%
...
```

Preceded by the UTF-8 BOM and a `sep=;` line. The quorum block is absent entirely when `quorumThreshold` is null, matching the screen, which drops the card.

---

## The builder computes nothing

This is the load-bearing rule, and the reason `results-export.ts` imports six functions to produce one string:

```ts
import { turnoutPct } from "@/lib/elections-view";
import { quorumOutcome, rankCandidates, sharePct, winnerOutcome } from "@/lib/results-view";
```

The results page, the PDF report and this file are three renderings of one derivation. Recomputing any of them is how one election ends up publishing three different percentages. `results-view.ts` had already written this obligation into its own header comment before this feature existed.

### Two denominators, both correct

| Function | Denominator | Where it appears |
| --- | --- | --- |
| `sharePct(votes, votesCast)` | ballots cast | the `Postotak` column |
| `voterSharePct(votes, voters)` | whole electorate | the winner card on screen and in the PDF |

On the same election the screen says `36% od ukupno birača` and the CSV table says `42%`. Both are labelled, both answer different questions. **This is not a discrepancy** — do not "reconcile" them.

On a `MULTI_CHOICE` election the `Postotak` column **sums past 100 %** (live-verified at 132 %) because one ballot selects several options. Dividing by total selections would produce a tidy 100 % that answers a question nobody asked.

### The winner has three forms

`winnerOutcome` returns `single` · `tie` · `none`. A template reading `ranked[0]` invents a winner that does not exist — the precise bug `isWinner`-on-every-leader forecloses.

| `kind` | Rows written |
| --- | --- |
| `single` | `Pobjednik;<name>` |
| `tie` | `Pobjednik;Izjednačeno` + one `Pobjednik (izjednačeni);<name>` per leader |
| `none` | `Pobjednik;Nema pobjednika` |

The candidate table stays in **ballot order** (`orderIndex`) while `rankCandidates` is used only to find the leader. Live-verified on a multi-choice election whose winner is the *last* row in the table.

---

## The route

`GET /api/elections/[id]/results/export?locale=hr|en`

A route handler, not a server action: a download *is* its headers, and server actions cannot set them.

```ts
const { user, organizationId } = await requireSession();
const election = await getElectionDetail(id, organizationId);   // org scope in the WHERE
if (!election) return new Response(null, { status: 404 });

const access = resultsDetailAccess(election);
if (!access || access === "sealed") return new Response(null, { status: 404 });
```

**The guard is a call, not a copy.** `resultsDetailAccess` already encodes the rule and three surfaces depend on it; restating it here would be a fourth copy that drifts.

| Election state | Response |
| --- | --- |
| `CLOSED` · `ARCHIVED` · `ACTIVE`+`LIVE` | 200, the tally |
| `ACTIVE`+`AFTER_CLOSE` (sealed) | **404** |
| `DRAFT` · `SCHEDULED` | **404** |
| unknown id · another org's id | **404**, empty body |

Sealed is a 404 rather than an explanation: the admin is already told *why* on the results page, and a download has nothing to explain. **This endpoint, not the disabled button, is the security boundary** — the button is UX.

Missing and cross-org ids collapse into the same bare 404, so the endpoint is not an existence oracle.

### Locale arrives as a query param

`/api/*` sits outside the `[locale]` segment, so there is **no next-intl request context**: `useTranslations` needs a component and `getTranslations` needs the context. Both fail here. Labels are read from the JSON catalogs by direct import, and `resolveExportLocale` (reused from `voter-export.ts`) is the single normalisation point so the labels and the delimiter can never disagree. Same precedent as `email.service.ts`.

An absent or unrecognised `locale` falls back to `hr`.

---

## Excel needs all three

Inherited unchanged from `src/lib/csv.ts` — **no writer code was written for this feature**:

1. **BOM** (`EF BB BF`) — without it Excel on Windows renders `Štefančić` as `Å tefanÄiÄ‡`.
2. **Locale delimiter** — `;` for `hr` (Croatian Excel treats `,` as the decimal mark), `,` for `en`.
3. **`sep=` line** — Excel splits on the *reader's* OS list separator, not the file's, so without this any locale mismatch dumps the export into column A.

Verified on bytes, not `String.startsWith`, because the bug class here is encoding:

```
ef bb bf 73 65 70 3d 3b   →   BOM + "sep=;"
```

Percentages are whole integers. A decimal would need `,` in Croatian, colliding with the `en` delimiter.

---

## Labels: reuse before inventing

A label that names a number on screen must name the same number in the file.

**Reused:** `statTotalVoters` · `statVotesCast` · `statTurnout` · `statQuorum` · `quorumMet` / `quorumNotMet` · `winner` · `winnerTie` · `winnerNone` · `dOrg` · `dType`, plus the type/method labels from `dashboard.wizard.step1`.

**New** (`dashboard.election.results.export`, 13 keys × 2 locales): the preamble headers, the row labels the screen has no equivalent for, the four table headers, and `fileSuffix`.

Candidate roles stay in whatever language the admin typed them — they are user data, not UI copy, so an `en` export still shows `Predsjednica`.

---

## `/results` list buttons

Both per-row buttons now navigate. They need different link types for a structural reason:

| Button | Element | Href |
| --- | --- | --- |
| PDF izvještaj | `Link` from `@/i18n/navigation` | `/hr/elections/{id}/results/report` — **locale-prefixed** |
| CSV | plain `<a>` | `/api/elections/{id}/results/export?locale=hr` — **unprefixed** |

The report is a page inside `[locale]`; the export is an API route outside it, where a locale prefix would 404. Sealed rows render `<button disabled>` for both, since there is no link to give them.

Each carries `onClick={stopPropagation}` — the card has a stretched `after:inset-0` overlay for whole-card click, and without it the row would swallow the button press.

`Content-Disposition: attachment` downloads natively, so there is no fetch → blob → `createObjectURL` → synthetic-click dance.

---

## Anonymity

Aggregate counts only. `getElectionResults` reads `_count` on the junction table for per-candidate totals, so individual ballots are never loaded to tally. It does select every ballot's `createdAt` for the results page's day chart — **the CSV ignores it**, and a second, narrower query would be worse than the wasted bytes, because two queries drift.

Never exported: `Vote` rows, `Vote.createdAt`, `batchOrder`. Ballot timestamps would reintroduce exactly the timing-correlation surface `batchOrder` is randomised to prevent.

Unlike the voter roster, this file carries **no personal data of voters** — candidate names are published on the ballot and every voter-side figure is an aggregate.

---

## Verification

`npm run test` 258/258 · `npm run build` clean · `npm run lint` clean · 0 console errors.

Live against the seeded dev DB, signed in, both locales:

- quorum met (`70% (165)` / `85% (200)`) · quorum not met (`95% (252)` / `87% (231)`) · no quorum → all three rows absent
- multi-choice shares summing to **132 %**, with the winner last in ballot order
- `ARCHIVED` exports · sealed / `DRAFT` / `SCHEDULED` / unknown id all 404
- headers: `text/csv; charset=utf-8`, `attachment; filename="izbor-clana-...-rezultati-2026-07-28.csv"`, `Cache-Control: no-store`
- `/results`: 5 sealed rows disabled, 6 open rows linked; PDF click lands on the report, back arrow returns
- reconciliation: screen `85%` / `Ispunjen` / `36% od ukupno birača` ⇄ file `85%` / `Ispunjen` / `42%` in the table

**Tested by unit test only, not by live fixture:** the tie case and the zero-candidate case (no seeded election has either; the builder is pure, and the tests assert its exact output). **Cross-org 404** is covered by the shared `findFirst({ where: { id, organizationId } })` and the unknown-id path — proving it live requires reassigning an election to another org, a write the Neon guardrails forbid via MCP.

---

## Notes for whoever touches this next

- **Do not add a query.** `getElectionResults` returns every figure; `getElectionDetail` supplies the title for the filename. Both are `cache()`-wrapped and shared with the results page.
- **Do not recompute a percentage.** If you need a new one, add it to `results-view.ts` so all three surfaces inherit it.
- The candidate table is bounded by candidate count, not voter count — no streaming ceiling.
- An election with zero candidates writes the table header with no rows under it. That is the honest output.
- **Abstain** (`allowAbstain`, Pro) has no representation here on purpose: the flag exists in the schema and the wizard writes it, but no abstain `VoteOption` is ever created and no ballot can select one. When a ballot pipeline lands, abstain becomes an option like any other and this table carries it with no change here.
- Known ceiling from `csv.ts`: Google Sheets and pandas show the `sep=` line as a data row. The fix is a real `.xlsx`, not a different delimiter (logged in `post-mvp-feature-list.md`).

### Dev-environment gotchas hit this session

- `npm run build` clobbers the `.next` directory a running dev server is serving from → `ChunkLoadError` on any route needing fresh compilation. Restart the dev server after a build before verifying in the browser.
- `TaskStop` on `npm run dev` can leave the child `next` process holding port 3000. Check with `Get-NetTCPConnection -LocalPort 3000` and kill the owning PID, or the next `npm run dev` silently moves to 3001 while a zombie serves a deleted build.
