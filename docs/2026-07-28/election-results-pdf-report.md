# Election Results PDF Report

**Branch:** `feature/election-results-pdf-report` · **Version:** stays 0.9.7 (bump skipped at the user's request)
**Spec:** `context/features/Results Spec Files/election-results-pdf-report-spec.md`
**Design:** `context/design/electius-app-design-prototype/project/PDF Report Preview.dc.html`

The **PDF izvještaj** button on `/elections/[id]/results` was a `comingSoon` toast. It now opens a preview route that renders the official election report from the database, with one button that hands the sheet to the browser's print engine.

No new dependency. No schema change. No new DB query.

---

## What shipped

| File | Change |
| --- | --- |
| `src/components/elections/election-report.tsx` | **new** — the report sheet (server component) |
| `src/app/[locale]/(app)/elections/[id]/results/report/page.tsx` | **new** — route, status guard, `generateMetadata` |
| `src/lib/results-view.ts` | `voterSharePct` — the "% of eligible voters" derivation |
| `src/lib/results-view.test.ts` | +2 cases |
| `src/lib/csv.ts` | `exportFilename` — the filename stem, shared with the CSV export |
| `src/lib/csv.test.ts` | +2 cases |
| `src/components/elections/election-results.tsx` | 2 lines — inherits `voterSharePct` |
| `src/components/elections/election-topbar.tsx` | report top-bar variant; the PDF button is now a `Link` |
| `src/components/elections/election-tabs.tsx` | hidden on the report route |
| `src/components/dashboard/dashboard-shell.tsx` | `print:` variants |
| `src/app/globals.css` | `@page` margin |
| `messages/{hr,en}.json` | `dashboard.election.report` (+20 lines each) |

239 tests pass (from 235).

---

## Delivery: the browser's print engine, not Puppeteer

The spec assumed Puppeteer + `@sparticuz/chromium`. Two facts killed that for the MVP:

1. **A headless browser has no session.** Chromium navigating to the report route gets bounced to `/login` and screenshots the login page. Making it work means forwarding the session cookie into the browser context, or dropping navigation entirely for `renderToStaticMarkup` → `page.setContent`.
2. **The prototype already produced a PDF without any of it** — `@media print` rules plus `window.print()`.

So: a preview route, a print stylesheet, and one button calling `window.print()` with PDF as the destination. No 50 MB function bundle, no 10 s Vercel Hobby ceiling, both locales free.

**Accepted cost:** the browser owns the saved filename and no file object exists server-side. That only becomes real when the archive spec needs a stored PDF in R2 — and by then the template component exists, so the generator is a bolt-on against a finished template rather than a rewrite. Recorded as a `ponytail:` note at the route.

### The print stylesheet is load-bearing

`DashboardShell` is `h-screen overflow-hidden` with a single scroll container. Print that as-is and you get page 1 and nothing else — silently. The fix is Tailwind's built-in `print:` variant on the shell:

```tsx
<div className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible">
<aside className="… md:block print:hidden">
<main className="flex-1 overflow-y-auto print:overflow-visible">
  <div className="mx-auto w-full max-w-content p-8 print:max-w-none print:p-0">
```

Only what Tailwind cannot express lives in `globals.css`:

```css
@media print {
  @page { margin: 16mm; }
  body { background: #fff; }
}
```

Verified with `page.emulateMedia({ media: 'print' })`: sidebar, app top bar and report top bar all `display: none`; `overflow` becomes `visible`; padding and max-width released.

### `document.title` is the filename

Under print-first the browser picks the filename — but it *suggests* one from the page title. So `generateMetadata` sets the title to the slugified stem:

```ts
title: exportFilename(election.name, SUFFIX[locale] ?? "report", new Date())
// → izbor-clana-upravnog-vijeca-iz-reda-studenata-izvjestaj-2026-07-28
```

`exportFilename` is the extension-less stem; `csvFilename` is now `exportFilename(...) + ".csv"`. **One slugifier, not two** — `slugify` already guarantees ASCII output and handles `đ` (which NFD does not decompose).

---

## Every number comes from a shared helper

The report computes nothing. This is the whole point: the tally page, this report and the future CSV export must never give one election two answers.

| Figure | Function | File |
| --- | --- | --- |
| Ranking, `isWinner`, per-candidate % | `rankCandidates` · `sharePct` | `results-view.ts` |
| Winner / tie / no winner | `winnerOutcome` | `results-view.ts` |
| **% of eligible voters** | `voterSharePct` | `results-view.ts` |
| Quorum required · achieved · met | `quorumOutcome` | `results-view.ts` |
| Winner initials | `candidateInitials` | `results-view.ts` |
| Turnout % | `turnoutPct` | `elections-view.ts` |
| Dates | `formatVotingDate` | `elections-view.ts` |

### Two percentages, two denominators — both correct

The winner card and the candidate rows answer different questions, and the labels say so:

```
Ana Kovačević        84    36% od ukupno birača     ← voterSharePct: 84 / 235 eligible voters
2  Marko Horvat      56 glasova            28%      ← sharePct:      56 / 200 ballots cast
```

`sharePct` divides by **ballots cast**, so on `MULTI_CHOICE` the shares legitimately exceed 100 % (live-verified at 132 % on a seeded election) — each percentage means "share of ballots that chose this option". `voterSharePct` divides by the **full voter list**.

**They are the same arithmetic with different inputs**, which is exactly why they are easy to confuse. `voterSharePct` is an alias of `turnoutPct`; a test pins the pair side by side so anyone "tidying up two identical functions" fails in CI rather than on a printed document:

```ts
expect(voterSharePct(84, 235)).toBe(36);
expect(sharePct(84, 200)).toBe(42);
```

> This extraction also removed a duplicate: `election-results.tsx` had the formula inline. Both surfaces now call `voterSharePct`.

### Votes cast is `_count.votes`

Never a sum of candidate votes. The prototype summed candidates + abstain; on `MULTI_CHOICE` one ballot selects several options, so that sum exceeds the ballot count and turnout prints above 100 %.

### Percentages are integers

The prototype printed turnout as `toFixed(1)`. `turnoutPct` returns a whole number, the results page renders whole numbers, and the CSV spec mandates integers — three surfaces, one rounding. A decimal would also need `,` in Croatian, colliding with the `en` CSV delimiter.

---

## Three outcomes, not one winner

`winnerOutcome` returns `single | tie | none` and the template renders all three. A template reading `ranked[0]` would print a winner that does not exist — the precise failure `isWinner`-on-every-leader was built to foreclose.

| `kind` | Report renders |
| --- | --- |
| `single` | avatar, name, role, count, share, quorum pill |
| `tie` | **no avatar**, title "Izjednačeno / Tied", every leader named, shared count stated **once** |
| `none` | one line ("Nema pobjednika") — candidate list still prints with zeros |

Rank numerals come from the position in the full `ranked` array, so on a two-way tie the runner-up is **3**, not 2.

---

## Status guard

Reuses `resultsDetailAccess` — the same rule as the results page, never re-derived:

| Election state | Report route |
| --- | --- |
| `CLOSED` · `ARCHIVED` · `ACTIVE + LIVE` | renders |
| `ACTIVE + AFTER_CLOSE` (sealed) | **`notFound()`** — *not* the explanatory notice the page shows |
| `DRAFT` · `SCHEDULED` | `notFound()` — no ballots exist |
| cross-org / unknown id | `notFound()` from `getElectionDetail(id, organizationId)` |

Sealed differs from the results page on purpose: a sealed election's own admin is told *why* on the results page; a report route has nothing to explain.

**The route guards itself.** The results page's guard does not extend to it. Org scoping lives in the WHERE clause, so missing and cross-org collapse into the same 404 — the route is not an existence oracle. `generateMetadata` returns `{}` when the election is null, so a cross-org id leaks no title either.

---

## Chrome

The route nests under `elections/[id]`, so the shell, session and authz come free. Two components detect the report path via `usePathname()`:

- **`ElectionTopbar`** returns a report variant — back arrow, "Pregled PDF izvještaja", election title beneath, one print button. No status badge, no election actions.
- **`ElectionTabs`** returns `null` — the tabs would highlight a page the user is not looking at.

### Deliberate deviations from the prototype

| Prototype | Shipped | Why |
| --- | --- | --- |
| "Open full PDF" + "Download PDF" | **one** button | Both open the same dialog under print-first; a button claiming a different action is a lie |
| Footer `Stranica 1 / 1` | no page number | False on any report that paginates; Chrome's print engine adds real ones |
| `ID izvještaja: ELC-2025-0417` | real `Election.id`, labelled | No schema field produces that format. A fabricated reference number on an official document is a small version of the audit-note problem |
| `info@electious.com` | `contact@electius.com` | Confirmed mailbox |

---

## The audit note does not claim a verification

The designed sentence asserted *"the audit trail has been verified and no anomalies were detected."* **Nothing verifies anything** — `Archive.merkleRoot` and `proofData` have no writer, because the archive spec is unstarted. Every report generated today would carry a false integrity claim in a document an organization keeps.

The shipped note describes *how* votes are recorded instead:

> Ovi izbori provedeni su na platformi Electius. Svaki je glas zabilježen anonimno — zapis o glasu ne sadrži nikakvu poveznicu na birača — a svaki listić nosi vlastiti kriptografski kontrolni zapis (SHA-256).

Every clause is true today. **When the archive spec ships, upgrade this sentence and print the real `merkleRoot` beside it** — that is the only thing that should reintroduce the word "verified". This matches the on-screen audit card, which already shows a grey clock and a dashed "— dostupno nakon arhiviranja" rather than an invented hash.

---

## Branding

Always the Electius mark. `Organization.logoUrl` (Pro) is *read* by the settings page and **never written** — settings phase 1 shipped logo display with no upload affordance. When an upload feature lands, one branch goes in `election-report.tsx`; until then the fallback is the correct behaviour for the Free tier anyway.

---

## Verification

`npm run test` 239/239 · `npm run build` clean · browser pass hr + en, **0 console errors**:

- quorum met (85 % vs 70 % threshold) · quorum not met (87 % vs 95 %) · no quorum → row **and** pill both absent
- `MULTI_CHOICE` shares summing to 132 %, turnout 91 %
- **tie** — no seeded election has one, so a throwaway fixture was created and removed; DB SQL-verified back to 22 elections / 1 660 votes / 0 leftovers
- `ARCHIVED` renders · `DRAFT` → 404 · sealed `ACTIVE` → 404 · unknown id → 404
- Croatian paucal plurals ("22 glasa", "41 glas", "56 glasova"); English with en-US dates
- print media asserted via `emulateMedia`, not assumed
- round trip: results tab → PDF button → report → back link → results tab

---

## Gotchas for the next developer

- **`npm run build` clobbers the `.next` a running dev server serves from.** Symptom is a reload loop — steady `200`s in the server log, browser never finishes, zero client console errors. It looks like an app bug. Kill the dev server, `rm -rf .next`, restart. A stale `.next/dev/types/routes.d.ts` can also fail the build's TypeScript step with a bogus syntax error in a file you never wrote.
- **`TaskStop` on `npm run dev` may leave the child `next` process holding the port.** Check with `Get-NetTCPConnection -LocalPort 3000` and kill the owning PID, or the next `npm run dev` silently moves to 3001 while a zombie serves a deleted `.next` on 3000.
- **`page.pdf()` is Chromium-only.** The Playwright MCP browser here is Firefox; use `emulateMedia({ media: 'print' })` and assert computed styles instead.

---

## Open, deliberately

- **Abstain.** When `allowAbstain` is enabled, does abstain get its own candidate row or sit in the turnout block? No abstain option exists anywhere in the ballot pipeline yet. **Answer it once, together with `election-results-csv-export-spec` open decision #4** — one answer for both files, or the report and the CSV will disagree.
- **Empty states.** An election with zero candidates prints both "Nema pobjednika" and "nisu uneseni kandidati" — two true sentences, mildly redundant, near-unreachable (the wizard requires ≥2 candidates for a full create).
- **Server-generated file.** See the delivery section — arrives with the archive spec, as a bolt-on.

## Related

- `docs/2026-07-27/election-results-id-phase-2.md` — the on-screen tally this must agree with; the derivations shipped there
- `docs/2026-07-26/voter-list-csv-export.md` — `csv.ts`, the filename convention, the other export button
- `context/features/Results Spec Files/election-results-csv-export-spec.md` — same numbers, machine-readable; shares the status guard, the filename convention and the abstain decision
