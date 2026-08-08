# Auto-Close Enforcement

**Branch:** `feature/auto-close-enforcement` · **Version:** 0.9.22 (patch) · **Date:** 2026-08-08
**Spec:** `context/features/election-auto-close-spec.md` (audit written 2026-08-07, re-verified and
corrected 2026-08-08 against `main` @ `39dcbef`).
No migration, no new route, no new dependency, no new service.

The requirement in three sentences: auto-closing on the end date is a **default and unchangeable**
behaviour · **voters cannot vote** after the end · **the admin cannot change** an election that has
ended. The first was already true. This branch is the other two.

---

## Findings index

Read these before touching the files. Three reversed or corrected something written earlier.

1. **`tokenExpiry`'s `now` parameter is gone, not just re-anchored.** It became unused, so the bug
   is now unrepresentable rather than merely fixed — §1.
2. **`deadlinePassed` is a second predicate on purpose.** `startElection` reads `startsAt` *before*
   the same query re-stamps it, so asking `windowOver` there would brick every draft older than 30
   days, permanently, with no edit route to fix the date — §2.
3. **The spec's own workaround for that does not work.** It says (a) neutralises the DRAFT blast
   radius "because `startElection` re-stamps `startsAt` anyway". The re-stamp happens *after* the
   guard — §2.
4. **`votingOver` now calls `mutationsFrozen` instead of restating it.** Same formula, two
   questions, one body — §3.
5. **`frozen` is computed once in `toDashboardElection`**, so every list inherits it with no query
   change and the client never re-derives an entitlement it cannot see — §4.
6. **G1 got worse after the audit was written** and is *not* fixed by code here — §7.

---

## 1. G2 — the election that could never close

`tokenExpiry` fell back to a 30-day ceiling measured from `now`:

```ts
if (endsAt <= startsAt) return new Date(now.getTime() + THIRTY_DAYS_MS);
```

For a placeholder election (`endsAt <= startsAt`, which is what a manual-start election with no
close date gets from `create-election.ts:83`, `endsAt = closeAt ?? startsAt`), substituting into
`windowOver` gives:

```
windowOver = (now + 30 days) <= now = false, always
```

The ceiling moved with every call. Not "not expired yet" — **cannot expire**. Two consequences, both
real: the election never closed, and tokens outlived their own stated contract (*tokens die with the
election*) because a token minted on day 29 lived to day 59, and a reminder on day 100 minted
another 30 days.

Shipped fix (decision D1(b)):

```ts
export function tokenExpiry(startsAt: Date, endsAt: Date): Date {
  if (endsAt.getTime() <= startsAt.getTime()) {
    return new Date(startsAt.getTime() + THIRTY_DAYS_MS);
  }
  return endsAt;
}
```

**The third parameter was removed, not left unused.** After anchoring to `startsAt` nothing in the
function depends on the current time, so keeping `now` would be a lie about what the expiry depends
on — and it is exactly the input that caused the bug. Callers that passed it were updated;
`windowOver` still takes its own `now` and compares against the returned date.

D1(a) — requiring a close date on every published election — was **not** taken. Open-ended elections
stay possible; they now close 30 days after they open instead of never.

---

## 2. `deadlinePassed` — why a second predicate exists

`startElection` was the only caller asking `windowOver` about a **draft**, and it is asking a
different question. Its guard exists so a scheduled deadline that has already passed cannot be
silently reinterpreted as an open-ended 30-day election.

The order in `src/actions/elections.ts` is what forces the split:

```
168-171   read draft { startsAt, endsAt }
173       guard                                  ← reads the OLD startsAt
179       data: { status: "ACTIVE", startsAt: now }   ← re-stamp
```

A draft carries `startsAt = createdAt`. Under the new anchor, a draft with no close date that is
older than 30 days has `windowOver === true` — so a `windowOver` guard here would refuse it with
`deadlinePassed` **forever**, and there is no edit route to change the date (Edit is still a toast
stub). The spec's suggested escape ("accept it alongside D1(a), where `startElection` re-stamps
`startsAt` anyway") does not work: the re-stamp is six lines *below* the guard.

The other suggestion — gating the ceiling on `status !== "DRAFT"` — would put an election status
inside a pure function over two dates. So instead:

```ts
// Rezervirani datum nije rok — čarobnjak ga nije ni postavio, pa nema što proći.
export function deadlinePassed(e, now = new Date()): boolean {
  return e.endsAt.getTime() > e.startsAt.getTime() && e.endsAt.getTime() <= now.getTime();
}
```

| Question | Asked by |
| --- | --- |
| *Would a token minted now be born expired?* | six send paths, the close sweep, the ballot router — `windowOver` |
| *Does this draft have a real deadline that already passed?* | `startElection` only — `deadlinePassed` |

Neither derives the other. `windowOver` keeps its meaning, and the invariant that nothing re-phrases
it as `endsAt < now` is untouched.

---

## 3. G3 — `castVote` asks the shared question

`castVote` checked `token.expiresAt` and `status !== "ACTIVE"` and never called `votingOver`, which
was defined 30 lines above it. That was safe only *by coincidence*: for scheduled elections
`tokenExpiry === endsAt`, so the token check happened to coincide with the window check. Under G2
the coincidence breaks outright — status is ACTIVE, the token is live, and nothing compares against
the window.

```ts
if (token.expiresAt.getTime() <= now.getTime()) throw new VoteError("invalid");
if (election.status !== "ACTIVE") throw new VoteError("invalid");
if (votingOver(election, now)) throw new VoteError("invalid");
```

The token check **stays** alongside it. It is a different fact (this token's own life) and it still
catches tokens minted under the old anchor, whose stored `expiresAt` can outlive the window.

`votingOver` and `mutationsFrozen` are the same formula asking two different questions, so
`votingOver` now calls it rather than restating it:

```ts
function votingOver(e, now = new Date()) { return mutationsFrozen(e, now); }
```

Its parameter was also narrowed from `BallotElection` to `{ status, startsAt, endsAt }` — that is
all it reads, and `castVote`'s select is narrower than a ballot's.

---

## 4. G4 + G5 — "ended" means the same thing in every mutation

New in `token.service.ts`:

```ts
export function mutationsFrozen(e, now = new Date()): boolean {
  return e.status === "CLOSED" || e.status === "ARCHIVED" || windowOver(e, now);
}
```

| Action | Change |
| --- | --- |
| `addVoters` | refuses `electionEnded` **before** dedupe, cap and insert. Previously the rows landed and only the *send* was blocked, so late voters entered the turnout denominator and could push a met quorum back under its threshold — a result-changing write after voting ended |
| `updateVoterName` | reads the election (the window is a column-vs-column comparison and cannot live in a WHERE), refuses if frozen, and its `updateMany` gained `status: { in: OPEN_STATUSES }` |
| `renameElection` | `assertOwned` replaced by a `findFirst` returning `status`/`startsAt`/`endsAt`; refuses **CLOSED and ARCHIVED** (decision D3, the stricter line) |
| `resendInvitations` · `sendElectionReminders` · `resendVoterInvite` | **no change** — already refuse at the send layer. Listed so the next reader does not re-audit them |

The refusal travels the **failure** path as `error: "electionEnded"`, never through `blocked`.
`blocked` is a success-path qualifier meaning *"added, but not invited"*, and the dialog only reads
it after `res.success` — the same trap the voter-cap refusal recorded when it was built.

Ownership stays in the WHERE clause everywhere (invariant #3). Only the window check reads first,
and only because Prisma cannot compare two columns.

`assertOwned` had exactly one caller and was deleted with it.

---

## 5. D2 — hiding the affordance

`mutationsFrozen` is `server-only` (it calls `windowOver`), but client components need the answer.
Rather than refactor the predicate to be client-safe, `frozen: boolean` was added to
`DashboardElection` and computed **once**, in `toDashboardElection` — the single mapper every
election list already flows through:

```ts
frozen: mutationsFrozen(e),
```

`ELECTION_SELECT` already carried `startsAt`/`endsAt`, so this costs **no query change**, and
`getElectionDetail` maps through the same function, so `/elections/[id]/voters` got the flag free.
The client receives a decision it cannot re-derive incorrectly — the same shape the voter caps use.

Hidden when frozen: **rename** in `/elections` and `/home`; **add voters**, **edit name** and
**resend** in the roster. `canRemove` is unchanged (DRAFT/SCHEDULED only).

Each surface keeps a localized backstop toast for the stale-page case — the control is hidden, but
the action is the boundary, and a refusal must name its reason rather than fall into the generic
error. Three new keys per locale: `dashboard.page.actions.toast.electionEnded` (shared by both
lists), `dashboard.voters.toast.electionEnded`, `dashboard.voters.add.electionEnded`.

### Empty menus

Folded in on request during verification: with all three row actions gated off, the roster's row menu
opened a popup containing nothing. The trigger now renders only when at least one item would:

```ts
const hasRowActions = (v: RosterVoter) =>
  (canResend && v.status !== "VOTED") || canEdit || (canRemove && v.status !== "VOTED");
```

The `/elections` and `/home` menus cannot empty — they carry ungated items (view results, duplicate,
delete), so only the roster needed this.

**Not changed, because it was already correct:** the *Zatvori izbore* button is `status === "ACTIVE"`
only, verified live on both CLOSED and ARCHIVED. It still shows on a window-over ACTIVE election,
which is right — closing it manually is the escape hatch when the pinger is down.

---

## 6. Tests — 543 passing (+25), nine guards mutation-checked

Every new guard was deleted in turn and had to fail a **named** test:

| Mutation | Caught by |
| --- | --- |
| re-anchor the ceiling to `now` (the original bug) | 4 tests, incl. *"windowOver is true for a placeholder election past its 30-day ceiling"* |
| drop `deadlinePassed`'s placeholder term | *"is false for the wizard placeholder however old"* |
| drop `mutationsFrozen`'s `windowOver` term | *"is true for an ACTIVE election whose window is over…"* |
| drop `castVote`'s `votingOver` guard | *"rejects a late ballot … even when the token is still valid"* |
| drop `addVoters`' frozen refusal | 3 tests |
| drop `updateVoterName`'s frozen refusal | 3 tests |
| drop `updateVoterName`'s status filter | *"scopes the write to the session org…"* |
| drop `renameElection`'s frozen refusal | 3 tests |
| `startElection` asks `windowOver` instead of `deadlinePassed` | 2 tests, incl. the ancient-draft regression |

`renameElection` had never had tests before this branch.

> **Trap worth carrying forward.** The first mutation run reported five "DID NOT APPLY" — the search
> strings used `\n` against this repo's **CRLF** files. A mutation that fails to apply looks exactly
> like a mutation no test caught. Any mutation script must assert the search string was found.

---

## 7. Live verification (dev branch, all seven spec §6 items)

| # | Check | Result |
| --- | --- | --- |
| 2 | Sweep closes overdue elections, `endsAt` **not** rewritten | `closed: 3`, all three `endsAt UNCHANGED`; second ping `closed: 0` |
| 3 | Placeholder election closes | SQL contrast on the fixture: `window_over_old_rule = false` / `new_rule = true`, then CLOSED |
| 4 | Late ballot, live token, window over | **410 `invalid`**; `votes_cast 0`, `junction_rows 0`, token unused, voter still INVITED — with `old_checks_would_pass = true`, i.e. it *would* have been counted before |
| 5 | Add voters from a stale page | toast *"Rok za glasanje je prošao…"*, roster unchanged, no row landed |
| 6 | Rename an ARCHIVED election from a stale page | toast *"Izbori su završili…"*, title unmoved; all 3 sealed archives `TITLES MATCH` |
| 7 | Restore | 19 elections · 3993 voters · 2087 votes · 3 archives · 3 tokens · 1 org · 1 user — identical to baseline, 0 orphans |

**D2 confirmed live:** on a window-over ACTIVE election the badge still reads *Aktivan* while every
admin affordance is gone. Status alone cannot produce that.

§6.5 and §6.6 were driven through genuinely **stale pages** (page rendered while the election was
live, election then ended in the DB) — the exact scenario the server refusals exist for, since the
controls are otherwise hidden.

### Running the sweep against a dev DB

`POST /api/cron/activate-elections` runs **four** passes. Before pinging it, check for `SCHEDULED`
elections whose `startsAt` has passed — the first pass opens them and **publishes real invitation
emails**. One such row exists in the dev DB and has sent a real email in a previous session; it was
parked (its `startsAt` pushed forward) for this run and restored afterwards, which is why every ping
here reported `activated: 0`.

---

## 8. Operational — this feature is not finished by code alone

**G1 was left as an operational obligation, by decision D4** (no `vercel.ts`, no vendor lock-in;
cron-job.org stays the only trigger). A `GET` export was dropped from scope with it — it existed
solely for Vercel Cron, and `POST` is the correct semantics for something that mutates.

Two things the app cannot verify and will not warn about:

- `CRON_SECRET` set in the production environment.
- The pinger actually pointed at `/api/cron/activate-elections`.

**The stakes rose after the audit was written.** The automatic 24-hour voter reminder became the
sweep's third pass on 2026-08-08, and it rides the same trigger. Closing is self-healing — the first
ping after an outage closes everything overdue. The reminder is **not**: it fires on the first tick
inside the 24-hour window, so a pinger down for an election's final day misses it permanently
(window closes, election closes, `autoReminderSentAt` never stamped). Same silent-no-op class as the
Upstash and R2 variables.

---

## 9. Known limits

- `updateVoterName` on CLOSED/ARCHIVED and the `deadlinePassed` DRAFT-regression path are covered by
  mutation-checked unit tests but were not exercised in a browser.
- A draft older than 30 days now has `windowOver === true`. Nothing refuses it (`startElection` asks
  `deadlinePassed`), but any future caller asking `windowOver` about a DRAFT must know this.
- The `frozen` flag is computed at render time. A page open across an election's deadline keeps
  showing its controls until refreshed — which is precisely why the server refusals and their
  named toasts exist.
- Removing a voter is still DRAFT/SCHEDULED only. That is unchanged and deliberate: removing
  non-voters *raises* turnout and could manufacture a quorum that was never met.
