# Voter Management

`v0.9.5` (unchanged — version held at the user's request) · branch `feature/voter-management` · spec `context/features/Voter Spec Files/voter-management-spec.md`

## What shipped

`/elections/[id]/voters` is the real voter roster — it was a `FacetScaffold`. The **Popis birača** button in the overview Actions card now points at it (it was a `comingSoon` toast).

Table (name · email · status · actions), summary line, search, status filter, server-side pagination, and four row/bulk operations: add voters (manual + CSV), edit name, remove voter, resend link.

| File | Role |
| --- | --- |
| `src/lib/db/voters.ts` | `getVoterRoster()` — paginated, org-scoped, **not** part of `ELECTION_SELECT` |
| `src/actions/voters.ts` | `addVoters` · `updateVoterName` · `removeVoter` · `resendVoterInvite` |
| `src/components/voters/voter-roster.tsx` | table, toolbar, pagination, row menu, edit/remove/resend dialogs |
| `src/components/voters/add-voters-dialog.tsx` | manual + CSV staging, reuses the wizard's `CsvDropZone` |
| `src/lib/elections-view.ts` | `voterCounts()` — the shared count derivation |
| `src/lib/services/publication.service.ts` | `inviteVoter()` extracted so there is still one send path |
| `messages/{hr,en}.json` | `dashboard.voters` namespace extended |

`/voters` (the cross-election list) needed **no change** — `ElectionFunnelList` already rendered per-election `voted/total (%)`.

## The counting model — one derivation, two screens

The roster summary and the overview stat cards must never disagree about the same election. Rather than trusting two implementations to stay in sync, the rule lives once in `elections-view.ts`:

```ts
voterCounts({ total, notInvited, voted })
// invited = total − notInvited   (notInvited = voters with status PENDING)
// voted   = ballot count (Vote rows), not voter status
// pending = total − voted
```

`election-overview.tsx` was refactored onto it in this branch. **If you add a third screen showing voter counts, import this — do not re-derive.**

Two consequences that look like bugs and are not:

- **`pending` ≠ the number of rows badged `Na čekanju`.** The badge shows `VoterStatus.PENDING` (never successfully emailed). The summary's *pending* means "has not voted". On a healthy election they diverge.
- On a **partially published** election (a failed send chunk) `pending > invited − voted`. That gap is real and now visible instead of hidden.

Turnout's denominator is the full roster, per `election-overview-phase-2`. Adding voters mid-election therefore *lowers* the reported percentage.

## Search and filter are server-side — deliberately against the spec

The spec asked for client-side filtering *and* server-side pagination. Those two are incompatible: filtering the fetched page means a voter on page 7 is invisible to a search that should match them. Both now live in the WHERE clause, driven by URL params (`?q=&status=&page=`).

Verified: `?q=voter17` on a 285-row roster returns **11 of 285**, not 11 of the 25 rendered.

Page size is `ROSTER_PAGE_SIZE = 25` in `lib/db/voters.ts`. Any filter change resets to page 1 (`setParams` deletes `page` unless it is the thing being set).

## Guards live in the WHERE clause

Every action is org-scoped through `requireSession()`, and **status guards are part of the same statement** — never read-then-check:

```ts
// removeVoter
where: {
  id: voterId,
  status: { not: "VOTED" },
  election: { organizationId, status: { in: ["DRAFT", "SCHEDULED"] } },
}
```

A cross-org id, a running election, and an already-voted voter all match zero rows and return the same `invalidStatus`. One code path, no existence oracle, no race between the check and the write. `voters.test.ts` pins these WHERE shapes — if you change a guard, a test should fail.

## Rules decided for this feature (2026-07-26)

| Rule | Why |
| --- | --- |
| **Removal only on DRAFT / SCHEDULED** | Adding mid-election only lowers turnout (quorum harder — conservative). Removing non-voters *raises* it and could manufacture a quorum that was never met. |
| **`VOTED` voters are never removable, at any status** | Their ballot is anonymous and already counted; deleting the row makes turnout unreconcilable and the archive snapshot wrong. |
| **Adding to an ACTIVE election invites immediately** | A `PENDING` voter on a running election is invisibly broken — no link, but already in turnout's denominator. Routes through the existing idempotent `publishElection`, which targets `PENDING` only. |
| **No per-voter resend cooldown** | Matches `sendElectionReminders`, which deliberately has none. Adding a window only here would be inconsistent. Lands with the reminder cooldown (`post-mvp-feature-list.md`). |

**The combination of rules 1 and 3 makes a mid-election add irreversible** — a typo'd address that belongs to a real person gets a working link and can vote, with no way to revoke it short of closing the election. There is no undo, so the add dialog warns *before* the insert. That warning is load-bearing; do not soften it.

## Email is identity, not a field

`@@unique([email, electionId])` is what makes one voter one vote, and an emailed voter holds a token tied to that row. So the edit dialog edits **names only** and says so. Changing an address is remove + create, which on an ACTIVE election is (by rule 1) not possible — intended.

## One send path, and it rotates the link

`inviteVoter(voterId, currentStatus, invitation)` was extracted from `resendVoterLink` so the roster's row action reuses it rather than becoming a third sender. It mints (delete + re-mint), sends, and flips `PENDING → INVITED`.

**Every resend invalidates the previously emailed link.** Raw tokens are unrecoverable by design — the DB stores only the SHA-256 — so a resend *necessarily* carries a new one. Live-proven: hash `30d811cc…` → `51e8fd27…`, exactly one token row. The confirm dialog states this; a voter holding two emails must know only the newest works.

## Known ceiling — dead tokens after the voting window

Adding a voter to an ACTIVE election whose `endsAt` has passed mints a token that is **already expired** and emails it anyway. Verified live: minted `2026-07-26`, `expiresAt 2026-07-23`.

This is **not** introduced here — it is inherited from `publishElection`, and the same is true of `startElection`, the activation sweep, `resendInvitations`, and the voter-facing `resendVoterLink`. Root cause: nothing implements `autoCloseOnDeadline`, so an election sits ACTIVE past its deadline indefinitely, and `tokenExpiry()` pins expiry to `endsAt`.

Deliberately not patched here — a guard in this one action would leave the other five paths lying. Full analysis and the fix plan: **`context/fixes/expired-token-sends-spec.md`**.

## Other notes

- `q` is capped at 120 chars in the page, `status` is validated against the enum — an arbitrary `?status=` never reaches Prisma.
- Croatian status labels are **gender-neutral on purpose** (`Na čekanju` · `Pozivnica poslana` · `Glas predan`) — they sit beside a real person's name, where `Ana Horvat … Glasao` misgenders the reader.
- The **Dodaj birače** button is hidden on CLOSED/ARCHIVED, matching the server rule. A button whose action always rejects is not an offer.
- `getVoterRoster` reads all of an election's emails to dedupe on add (`ponytail:` marked). Fine at MVP scale (Free 50/election, seed max 285); narrow it to the candidate set if Pro rosters reach thousands.

## Anonymity

The roster shows **that** a voter voted, never **what**. `Vote` has no `voterId` and no relation to `Voter`; the `select` in `lib/db/voters.ts` touches no token and no ballot. Do not add a per-voter receipt lookup, a "how did they vote" column, or a join through `VoterToken` — any of those is a schema change and an explicit decision, not an implementation detail. Ballot timestamps must not appear beside voter rows either (`Vote.batchOrder` is randomised precisely to prevent that correlation).

## Verification

- `npm run test` — **203 passing** (23 new: `voterCounts` derivation, WHERE-clause shapes, dedupe, name split, invite-on-ACTIVE, send-throw tolerance)
- `npm run build` — clean
- Browser (seeded dev DB, hr + en, 0 console errors): summary reconciles with the overview (285/285/88/197), 12 pages, server-side search (11 of 285), status filter (88 of 285), action visibility across DRAFT/SCHEDULED/ACTIVE/CLOSED, edit round trip with diacritics, add + case-insensitive dedupe (132 → 133, not 134), add-to-ACTIVE with real Resend send, token rotation on resend, removal with token cascade, unknown id → 404
- Dev DB restored to its seeded state afterwards (0 leftover rows, 0 orphan tokens)
