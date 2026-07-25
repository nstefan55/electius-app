# Election Overview Phase 2 — Main Content Area

> Branch: `feature/election-overview-phase-2` · version unchanged (**v0.9.4**, bump skipped at the user's request) · Spec: `election-overview-phase-2-spec` (Election Spec Files) · Design: `context/design/electius-app-design-prototype/project/Election Overview.dc.html`
> Phase 2 of 3. Phase 1 shipped the chrome (top bar + tabs); this is the **body** of `/elections/[id]`. The Send Reminder *modal* is phase 3.

## What shipped

The stat row (Invited · Voted · Pending · Time left) and the four cards below it — turnout, election configuration, actions, activity — for `SCHEDULED`, `ACTIVE`, `CLOSED` and `ARCHIVED`. `DRAFT` still renders `StartElectionCard` and is untouched. The phase-1 content scaffold (`dashboard.election.overview.{scaffoldTag,draft,active,closed}`) is gone, keys included.

| Surface | File |
| --- | --- |
| Whole body + QR dialog | `src/components/elections/election-overview.tsx` |
| Overview data read | `src/lib/db/elections.ts` (`getElectionOverview`) |
| Turnout / quorum / countdown maths | `src/lib/elections-view.ts` |
| Status branch + props | `src/app/[locale]/(app)/elections/[id]/page.tsx` |
| i18n | `messages/{hr,en}.json` → `dashboard.election.overview` |

Turnout polling reuses the existing `fetchTurnout` server action (`src/actions/dashboard.ts`) unchanged — no new action.

## The counting model — read this before changing any number

The spec's prototype computes `pending = invited − voted` and turnout as `voted / invited`. Our schema is richer than the prototype's, so the three cards mean three different things:

| Card | Value | Source |
| --- | --- | --- |
| **Invited voters** | invitations actually sent | `voters − PENDING` (a `PENDING` voter was imported but never emailed) |
| **Voted** | ballots cast | `_count.votes` — the authoritative count, same as the dashboard |
| **Pending** | has not voted | `voters − voted` (includes voters not yet invited) |

**Turnout's denominator is the full voter list, not invitations sent.** Two reasons: the dashboard already defines turnout as `voted / voters`, and the same election must not report two different percentages on two pages; and quorum is specified as "% of eligible voters", where eligible means the whole list. `turnoutPct`/`quorumRequiredVoters` in `elections-view.ts` are the single source of that rule.

Consequence worth knowing: on a fully-published election `invited === voters`, so `pending === invited − voted` exactly as the design implies. On a **partially-published** one (a publication chunk failed, voters stayed `PENDING`) `pending > invited − voted` and turnout reads lower than invited/voted alone would suggest. That gap is real and now visible instead of hidden.

A `SCHEDULED` election has sent nothing, so Invited reads `0` while the configuration card's "Voter list" row shows the full count. That is correct, not a bug.

## Data read

`getElectionOverview(id, organizationId)` — `cache()`-wrapped like its siblings, org-scoped, **one** round trip. It returns the config enums that `getElectionDetail` cannot supply (its mapper flattens `votingType` into a hardcoded English label, unusable for i18n) plus three counts via filtered `_count` selects:

```ts
_count: {
  select: {
    options: true,
    voters: { where: { status: "PENDING" } },
    votes:  { where: { createdAt: { gte: since } } },   // last 24h
  },
}
```

Three derived numbers, no extra queries. `getElectionDetail` remains the shared read for title/status/window/voter+vote counts, so the layout and this page still share a single fetch of it.

## Turnout card

Polling matches the dashboard hero exactly — **15s** when `resultsMode === "LIVE"`, **60s** otherwise — via `fetchTurnout`, and only while the election is `ACTIVE` (nothing else can move). One polling rule app-wide; if you change the cadence, change both.

The badge must never claim to be live on an election that cannot change:

| Status | Badge | PRO chip |
| --- | --- | --- |
| `ACTIVE` + `resultsMode: LIVE` | "Live — voting now" + pulsing dot | yes |
| `ACTIVE` + `AFTER_CLOSE` | "Updates automatically" | no |
| `SCHEDULED` | "Voting hasn't started" | no |
| `CLOSED` · `ARCHIVED` | "Final turnout" | no |

The Free copy is deliberately **"Updates automatically"**, not the prototype's "Updated every 30 min" — the card actually refreshes every 60s, and the badge should not understate that.

The quorum block renders only when `quorumThreshold` is set (same for the configuration card's Quorum row). `quorumRequiredVoters` **ceils**: 49.2 voters is not enough.

## Time left

`timeLeftParts(targetIso, nowMs)` returns `{ days, hours, minutes }` — parts, not a label, so the unit suffixes stay in the catalogs (`{days}d {hours}h` / `{hours}h {minutes}m`). Target is `startsAt` for `SCHEDULED`, `endsAt` otherwise; `CLOSED`/`ARCHIVED` render `—` + "Voting has closed". A target in the past clamps to `0h 0m` rather than counting up — an `ACTIVE` election past its `endsAt` (waiting on the auto-close sweep) shows `0h 0m`, not a negative.

**`nowMs` is a prop, passed from the server page**, and the client ticks from it every 30s. Do not switch this to `Date.now()` inside the component: server and client would disagree on the minute boundary and React would report a hydration mismatch.

## Layout — two packed columns, not a 2×2 grid

The design reads as a 2×2 grid, but the configuration card is roughly 110px taller than the turnout card. A real grid row therefore leaves dead space above the Actions card, and forcing the navy card to `self-stretch` only moves the problem inside the card as internal voids. So each column stacks independently:

```
left  → Turnout, Actions
right → Configuration, Activity
```

Nothing stretches, no gaps. On mobile the two columns collapse to one, ordered turnout → actions → configuration → activity (the design's row order would have been turnout → configuration → actions → activity; putting actions directly under turnout is the better mobile read anyway).

## QR modal — no regenerate, by design

The payload is `electionVoteUrl(id)` = `{apex}/vote/{electionId}` (`src/lib/urls.ts`), the same URL the wizard's confirmation QR encodes. It is permanent and identity-free, so **there is nothing to rotate**: no `qrNonce` column, no schema change, and no "Generate new QR code" button. The action button always reads "Show QR code". A printed poster stays valid for the whole election — which is the point.

The modal is the QR, the URL in mono with a copy button, and the blue note that the code only works for voters already on the voter list (QR entry still requires the voter's email to match a list row — see the voter-flow spec's `/vote/[segment]` QR branch).

## Deliberate stubs

Three buttons render and fire a toast instead of doing work. Each is marked with a `ponytail:` comment at the call site.

| Button | Why | Owner |
| --- | --- | --- |
| **Send reminder** | the modal is phase 3 | `election-overview-phase-3-spec` |
| **Voter list** | download | CSV-export spec |
| **Export CSV** | download | CSV-export spec |

The exports were left as stubs on purpose: the export spec owns the column contract, the filename, and — the load-bearing part — which voter PII a downloadable file may carry. Do not improvise those columns here.

## Configuration card rows

Type (`{electionType} · {votingType}`, labels reused from `dashboard.wizard.step1`) · Voting window · Voter list · Candidates · Results · Auto reminder · Quorum (omitted when unset).

- **Results** is `LIVE` → "Live", else "Sealed", derived from `resultsMode`.
- **Auto reminder** uses the schema's `voterReminder24h` — so the copy says **24h**, not the prototype's 48h, because 24h is what the system actually does. `ACTIVE` → "Active · 24h before deadline"; `SCHEDULED` → "Scheduled · …"; `false` → "Off".

The Activity card's first row switches label by status: "Election published" normally, "Election publishes" for `SCHEDULED`, so a future date is not described in the past tense.

## Verification

- `npm run test` — 101/101 (7 new: `turnoutPct`, `quorumRequiredVoters`, `timeLeftParts`)
- `npm run build` — clean
- Browser (seeded dev DB, hr + en, 0 application console errors — the only console errors were Turbopack HMR chunk-load noise from the dev server): all five statuses rendered correctly, including `SCHEDULED` with Invited `0` and a live countdown to *opening*, `CLOSED`/`ARCHIVED` with `—` + "Voting has closed", the `ACTIVE` clamp to `0h 0m` past `endsAt`, and `DRAFT` still showing the start card. Croatian paucal plurals verified ("285 birača", "0 kandidata", "Nema glasova u zadnjih 24 h"). All four action paths fired their toasts; the copy button put the correct apex vote URL on the clipboard. Turnout polling confirmed by network trace on a `LIVE` election.
- Quorum, `LIVE` results mode and the 24h reminder are absent from the seed, so those branches were exercised with a temporary fixture script that flipped one `ACTIVE` election and then restored its seeded values. The script was deleted; the dev DB is back to its seeded state.
