# Results Overview — the cross-election results list

**Branch:** `feature/results-overview` · **Version:** 0.9.5 → 0.9.6
**Spec:** `context/features/Results Spec Files/election-results-overview-phase-{1,2}-spec.md`
**Design:** `context/design/electius-app-design-prototype/project/Results Overview.dc.html`

`/results` was a routing-phase-3 scaffold (`ElectionFunnelList`, CLOSED elections only). It is now the real list: cards or rows, three result modes, a sealed-results modal, and per-row export buttons.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/elections-view.ts` | `resultsAccess()`, `ResultsRow`, `resultsRows()` — the pure derivation |
| `src/lib/elections-view.test.ts` | +14 cases (210 total) |
| `src/components/elections/results-overview-list.tsx` | new — the whole list UI |
| `src/app/[locale]/(app)/results/page.tsx` | rewritten; 12 lines |
| `messages/{hr,en}.json` | new `dashboard.resultsPage`; dropped the orphaned `dashboard.election.lists.results` |

No new dependency, no schema change, no new DB query.

---

## The derivation is the feature

Everything on the page keys off one pure function:

```ts
resultsAccess({ status, resultsMode })  // → "live" | "sealed" | "closed" | null
```

| Result | Condition | Meaning |
| --- | --- | --- |
| `live` | `ACTIVE` + `resultsMode LIVE` | tally visible while voting runs |
| `sealed` | `ACTIVE` + `resultsMode AFTER_CLOSE` | tally withheld until voting ends |
| `closed` | `CLOSED` | final tally |
| `null` | `DRAFT` / `SCHEDULED` / `ARCHIVED` | not on this page |

`null` does double duty: it is both "no badge to draw" and "not a row at all", so **the same rule decides inclusion and display**. That is why the page filters in JS over `getElectionsByStatus(organizationId)` rather than putting statuses in the WHERE clause — a WHERE-based filter and a UI-based badge can drift apart; one function cannot disagree with itself. Marked `ponytail:` at the call site with the upgrade path if org lists ever grow.

`DRAFT`/`SCHEDULED` are excluded because no ballots exist. `ARCHIVED` is excluded because `/archive` already lists those with a "View details → results" action, and one election should not occupy rows in two sidebar sections.

---

## Sealing binds the admin, not just the voter

This is the decision worth remembering. `resultsMode: AFTER_CLOSE` on a running election hides the per-candidate tally **from the admin too**. If the admin could peek, "results are hidden until voting ends" would be a promise the product cannot keep — and that promise is the reason the setting exists.

Consequences, all visible in the UI:

- A sealed row does not navigate. It opens an explanatory modal instead ("Results are sealed", naming the election).
- Its PDF and CSV buttons render **disabled**, not hidden — the affordance stays legible so the admin can see the setting is doing something.
- `election-results-csv-export-spec` §Delivery already applies the identical guard to the future export endpoint. Three enforcement points, one rule.

Turnout is **not** sealed. The overview page keeps showing live turnout for every ACTIVE election (`election-overview-phase-2`); what is withheld is the per-candidate breakdown.

### Known ceiling

Blocking the row is **UX only**. `/elections/[id]/results` is still a `FacetScaffold` and remains reachable by URL. The enforcing guard belongs on that page once it renders real numbers — recorded in `election-results-id-phase-1-spec` §Status guard.

---

## Export buttons are stubs

Neither export exists yet; both have their own unstarted specs. The buttons render exactly as designed — including the sealed disable — and fire the established `comingSoon` toast. When `GET /api/elections/[id]/results/export` and the PDF report land, only the click handler changes.

The handlers call `stopPropagation()` so clicking an export never also opens the row (verified in the browser: toast fired, URL unchanged).

---

## Two implementation notes

**Clickable cards without invalid HTML.** The design makes the whole card clickable while nesting buttons inside it — an `<a>` cannot contain a `<button>`. Solved with one real interactive element (the title) carrying a stretched `after:absolute after:inset-0` overlay, and the export buttons lifted above it with `relative z-10`. A bonus: sealed rows render the title as a `<button>` (opens the modal) and openable rows as a `<Link>`, so the accessibility tree tells the truth about what each row does. Confirmed in the snapshot — sealed titles appear as `button`, others as `link` with the locale-prefixed href.

**The badge is not `STATUS_STYLES`.** A closed election's status badge is red everywhere else in the app; here the chip says "Closed" about *results availability* and is grey. Different meaning, different palette — `ACCESS_STYLES` is local to this component and commented as deliberate.

---

## Divergences from the prototype, on purpose

| Prototype | Shipped | Why |
| --- | --- | --- |
| Footnote in `neutral-400` | `neutral-600` | `neutral-400` fails WCAG AA and design-system-spec marks it "placeholder only" |
| Export buttons 34px / 12px padding | 36px / 16px, `whitespace-nowrap` | user request mid-build; nowrap because "PDF izvještaj" broke across two lines in a 326px card |
| Card footer single row | wraps, "View results" right-aligned below | same cause — three items do not fit one 326px row |

---

## Verified

- `npm run test` — **210 passed** (14 new)
- `npm run build` — clean, 35 pages, `/[locale]/results` resolves `ƒ`
- Browser (dev server, seeded dev DB, **0 console errors**): 11 rows = 5 sealed + 6 closed; Croatian paucal "11 izbora s dostupnim rezultatima"; cards ⇄ rows toggle; sealed modal names the election with Croatian quotes; `comingSoon` toast on a closed row without navigating; closed row opens `/hr/elections/<id>/results`; `/en/results` fully English with `en-US` dates and `/en/` hrefs
- The `live` branch has no seed coverage (every seeded election is `AFTER_CLOSE`), so one ACTIVE election was temporarily flipped to `LIVE` via a throwaway `tsx` script: green pulsing "Uživo" badge, `Eye` icon, enabled exports, sorted above the sealed rows. **Restored and SQL-verified** — the dev DB is back to 3 DRAFT / 3 SCHEDULED / 5 ACTIVE / 6 CLOSED / 4 ARCHIVED, all `AFTER_CLOSE`. Script deleted.

---

## Spec pass (same branch)

All six files in `context/features/Results Spec Files/` were reviewed and gap-filled:

- **overview-phase-1** — recorded that it needs **no new code**; both requirements already ship from `DashboardShell`. Added the contrast with the `[id]` chrome.
- **overview-phase-2** — **rewritten.** It previously described the `[id]` top bar (copy-pasted from the ID spec) rather than the `/results` main area. Now carries the inclusion table, the mode derivation, row actions, the sealed modal, the stub policy, and the known ceilings.
- **id-phase-1** — added the status guard (the load-bearing rule), the per-status subtitle table, and export enable rules; clarified it extends rather than replaces `ElectionTopbar`.
- **id-phase-2** — added data sources mapped to existing helpers, tie handling as an open question binding all three surfaces, ordering rationale, the anonymity constraint, and a **blocker**: the audit-integrity card needs `Archive.merkleRoot`, which nothing writes yet.
- **pdf-report** — added delivery shape (preview route + route handler), the serverless-timeout risk, filename/branding/status-guard rules, and flagged that the audit note asserts a verification that does not yet happen. **Do not ship that sentence until it is true.**
- **csv-export** — resolved open decision #3: the `/results` buttons are per-row shortcuts into this same endpoint, not a list export.

---

## Open next

- `election-results-id-phase-2` — the tally itself (and the real sealed guard)
- The two export endpoints
- Archive / Merkle spec — unblocks the audit card and makes the PDF's audit note truthful
