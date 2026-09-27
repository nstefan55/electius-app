# Closed Voter List Once Voting Starts

**Version:** 0.9.84 · **Branch:** `feature/closed-voter-list` · **Date:** 2026-09-27

Voters can be added to an election only while it is **DRAFT** or **SCHEDULED**. Once voting starts
the list is closed for every election. This is a fixed rule, not a setting.

No migration, no new dependency, no wizard change.

---

## Why

Adding a voter to a running election changes the turnout denominator, so a quorum could move after
voting began. It is also the one path by which an admin could grow the electorate while watching
turnout. A closed voter list is standard practice for formal votes (unions, student bodies,
assemblies).

**This reverses a decision from 2026-07-26 (voter management, v0.9.5)**, which allowed adding to an
ACTIVE election and invited the new voters immediately. The reasoning then was that a late voter only
lowers turnout. The integrity argument now outweighs the convenience.

**Accepted cost:** a voter forgotten before the start cannot be added once voting runs. There is no
escape hatch by design. Check the list before pressing Start: the start screen shows the voter count,
and the list can be edited freely while the election is DRAFT or SCHEDULED (roster, or the edit
wizard).

---

## The rule, and where it lives

One definition, `EDITABLE_STATUSES` / `isEditable` in `src/lib/elections-view.ts`, now covers editing
an election **and** changing its voter list:

| Action | Allowed on | Reads |
| --- | --- | --- |
| Add voters (`addVoters`) | DRAFT, SCHEDULED | `EDITABLE_STATUSES` in the WHERE |
| Remove a voter (`removeVoter`) | DRAFT, SCHEDULED | `EDITABLE_STATUSES` in the WHERE |
| Edit a voter's name (`updateVoterName`) | DRAFT, SCHEDULED, ACTIVE (not ended) | local `OPEN_STATUSES` + `mutationsFrozen` |
| Resend a voter's link (`resendVoterInvite`) | ACTIVE (not ended) | unchanged |
| Edit the election (topbar, `/edit`, `updateElection`) | DRAFT, SCHEDULED | `EDITABLE_STATUSES` (unchanged) |

Name edits and resends stay available on a running election: a name fix is cosmetic, and a voter who
lost the email must still be able to get a link.

**The server is the boundary.** The status sits inside the `findFirst` WHERE together with the
organization id, so an ACTIVE, CLOSED, ARCHIVED, missing or foreign election all return the same
`invalidStatus` before dedupe, the plan cap or any write (invariant #3: no existence oracle).

---

## What was removed

Everything that only an ACTIVE add could reach:

- `addVoters`: the `publishElection` call and the `sent` / `failed` / `blocked` fields on
  `AddVotersResult`. Adding never sends; invitations go out when the election starts
  (`startElection` or the cron sweep, both via `publishElection`, unchanged).
- `add-voters-dialog.tsx`: the `electionStatus` prop, the "voting is in progress" warning, the
  "Add and invite" button label and the invited / partial / window-over / election-ended toasts.
- Seven catalog keys under `dashboard.voters.add` (both locales): `electionEnded`,
  `activeWarnTitle`, `activeWarnBody`, `submitInvite`, `addedInvited`, `addedPartial`,
  `addedWindowOver`.

Added: `dashboard.voters.listClosed`, the one line the roster shows on an ACTIVE election in place of
the Add button, so an admin is not left looking for it.

---

## Bug fixed along the way

`addVoters` used to refuse with `electionEnded` whenever `mutationsFrozen` said the election was over,
and the roster hid the Add button on the same signal. For a manual-start draft the wizard writes
placeholder dates (`endsAt === startsAt`), and `windowOver` puts their ceiling at `startsAt + 30
days`. So **any draft older than 30 days could not take voters**. The window check is gone from
`addVoters` and `canAdd` no longer reads `frozen`: an election that never ran has no turnout to
protect. Same class of bug the auto-close work fixed for `startElection` with `deadlinePassed`.

---

## Known narrow window

The status read and the insert are not in one transaction. If the election starts between them, the
new voters land PENDING on an ACTIVE election without an invitation. It is recoverable: the roster's
Resend and the overview's retry both target PENDING voters. Marked `ponytail:` in `addVoters`; wrap
it in a transaction with a row lock if it ever shows up in practice.

---

## Tests

`src/actions/voters.test.ts`:

- the WHERE carries exactly `["DRAFT", "SCHEDULED"]`
- a refused election (null from the DB) writes nothing and never reaches the plan cap
- adding never calls `publishElection`
- a draft with placeholder dates older than 30 days still takes voters
- `removeVoter` keeps `["DRAFT", "SCHEDULED"]`

The mock does not apply the WHERE, so a test that returns an "ACTIVE row" would pass straight through.
The refusal is tested as what the database really returns for ACTIVE: `null`.

Mutation-checked: re-admitting ACTIVE to either WHERE, re-adding the window check, and re-adding the
send each fail exactly one named test.
