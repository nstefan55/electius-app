# Edit Elections (wizard edit mode)

**Version:** 0.9.81 · **Branch:** `feature/edit-elections` · **Date:** 2026-09-26

Admins can now edit an election that has not been published yet. The **Edit** button in the
election top bar opens the existing 5-step wizard at `/elections/[id]/edit`, prefilled from the
database. Saving updates the election instead of creating a new one.

No migration, no new dependency.

---

## What can be edited, and when

Only **`DRAFT`** and **`SCHEDULED`** elections. The rule lives in one place:

```ts
// src/lib/elections-view.ts
export const EDITABLE_STATUSES = ["DRAFT", "SCHEDULED"] as const;
export const isEditable = (status: ElectionStatus) => ...
```

It is read by all three layers — change it here, never at a call site:

| Layer | File | Behaviour for ACTIVE / CLOSED / ARCHIVED |
| --- | --- | --- |
| Edit button | `components/elections/election-topbar.tsx` | not rendered |
| Edit page | `app/[locale]/(app)/elections/[id]/edit/page.tsx` | redirects to the election overview |
| Save | `actions/create-election.ts` → `updateElection` | refused with `invalidStatus` |

Why the boundary is publication: before an election opens there are no ballots and no magic-link
tokens (tokens are minted by `startElection` / the cron sweep). So candidates and voters can be
**replaced** wholesale without touching `Vote`, `VoteToOption` or `VoterToken`, and no emailed
link is revoked. After that point, editing would rewrite a running vote.

Missing and other-organization ids return a 404 from the existing `[id]/layout.tsx`.

---

## Status rules on save

Create and edit share one rule (`prepareWizard` in `actions/create-election.ts`):

| Action in the wizard | Resulting status |
| --- | --- |
| **Save changes**, scheduled mode **with** a start date | `SCHEDULED` |
| **Save changes**, manual mode | `DRAFT` |
| **Save changes**, scheduled mode with the start date **cleared** | `DRAFT` |
| **Save as draft** (any mode) | `DRAFT` |

So a draft stays a draft until it gets a start date, and a scheduled election goes back to draft
when saved as a draft or when its start date is removed. A **malformed** (non-empty, unparseable)
start date is still a `schedule` error — it is never silently turned into a draft.

When reopening, the wizard derives the start mode from the status (`lib/wizard-prefill.ts`):
`SCHEDULED` reopens in scheduled mode with both dates; `DRAFT` reopens in manual mode with **no**
start date. A past close date is prefilled, not cleared — saving then fails validation and the
wizard jumps to step 4, which is how an expired draft (the old `deadlinePassed` dead end) is fixed.

---

## How the pieces fit

```
election-topbar  ──Edit──▶  /elections/[id]/edit (server)
                              ├─ getElectionForEdit(id, orgId)   status in WHERE; null → redirect
                              ├─ resolveEntitlement(id, orgId)
                              └─ toWizardData(election)          DB row → WizardData
                                        │
                                        ▼
                              <ElectionWizard editId initial />  same 5 steps as create
                                        │ save
                                        ▼
                              updateElection(id, payload, draft)
```

- **`updateElection`** shares `prepareWizard` (parsing, type/method coupling, dates, status,
  voter dedupe) and `planRefusal` (voter cap + the three Pro toggles) with `createElection`. Plan
  checks run **before** the transaction and apply to draft saves too.
- The write is one `$transaction`: an org- and status-guarded `election.updateMany` first (its
  `count` is the check), then `deleteMany` + `createMany` for options and voters.
- **Race with the cron sweep:** the first write locks the election row. If the sweep opens the
  election first, the update matches 0 rows and nothing is written; the wizard shows
  *"Izbori su u međuvremenu pokrenuti…"*. The sweep's own flip now also requires
  `startsAt <= now`, so it cannot open an election whose start the admin just moved later
  (`api/cron/activate-elections/route.ts`).
- **`refresh()` from `next/cache`** is called in the action on success. The overview's title and
  status badge live in the shared `[id]` layout, which a client navigation from `/edit` would not
  re-render. Do **not** replace it with `router.refresh()` after `router.push()` — that cancels
  the navigation (recorded in the wizard).
- `clearSweepGate()` runs when the save produces `SCHEDULED`, same as create.

### Time zones

The wizard's date fields hold Zagreb wall-clock strings (`"2027-03-10T09:00"`). Stored instants are
converted back with `instantToZonedWallClock` in `lib/elections-view.ts` — the inverse of the
existing `zonedWallClockToInstant`. Never use `toISOString()` or the server's zone for these.

### Prefill is computed on the server

`toWizardData` runs in the page (server) and the result is passed to the client wizard. Keep it
there: `wizard-shared.tsx` is a `"use client"` module, so the prefill module imports only its
**type**.

---

## Files

| File | Change |
| --- | --- |
| `src/app/[locale]/(app)/elections/[id]/edit/page.tsx` | **new** — edit route |
| `src/lib/wizard-prefill.ts` (+ test) | **new** — `prefillSchedule`, `toWizardData` |
| `src/actions/create-election.ts` (+ test) | `updateElection`; shared `prepareWizard` / `planRefusal`; empty start date in scheduled mode → DRAFT |
| `src/lib/db/elections.ts` (+ test) | `getElectionForEdit`, `ElectionForEdit` |
| `src/lib/elections-view.ts` (+ test) | `EDITABLE_STATUSES`, `isEditable`, `instantToZonedWallClock` |
| `src/components/elections/wizard/election-wizard.tsx` | `editId` / `initial` props, edit copy, exit to the election, `invalidStatus` + `schedule` error handling |
| `src/components/elections/election-topbar.tsx` | Edit is a link to `/edit` (was a "coming soon" toast) |
| `src/app/api/cron/activate-elections/route.ts` | `startsAt <= now` in the activation `WHERE` |
| `messages/{hr,en}.json` | `editTitle`, `saveChanges`, `saving`, `changesSaved`, `errors.editLocked`; new `step5.startUnset` copy; `topbar.editSoon` removed |

---

## Known limits

- **Last write wins** between two admins editing the same election at once. There is no version
  check; add one if multiple admins per organization becomes common.
- Saving **replaces** all voter rows, so voter ids change on every save. Harmless before
  publication (nothing references them), but do not extend editing past `SCHEDULED` without
  changing this to a diff.
- A draft saved in scheduled mode does not keep its start date on reopen — by decision, a draft
  has no start date.
- The whole voter list is loaded into the wizard (fine at the 50 / 500 caps).
- The sweep route change has no unit test; tests cover `src/actions` and `src/lib` only.

## Tests

885 tests pass. New cases cover the `updateElection` WHERE shape, refusal paths that write nothing,
candidate/voter replacement, both status transitions, the prefill mapping, the time-zone inverse and
`isEditable`. Key guards were mutation-checked (each mutation caught by a named test). Verified in
the browser in Croatian and English, including the sweep race and a cross-organization 404.
