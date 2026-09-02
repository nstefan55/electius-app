# Election timezone — a typed time now means Europe/Zagreb

**Branch** `fix/election-timezone` · **v0.9.45 → v0.9.46** · no migration, no new dependency

An admin who scheduled an election for 18:00 got one that opened at **20:00**. The countdown was
the only screen that showed it.

---

## What was wrong

The wizard collects a **local wall-clock** string with no timezone — `"2026-09-10T18:00"`. The
server action passed that straight to `new Date(v)`, and per ECMAScript a date-**time** string
with no offset resolves against the **runtime's** zone. That runtime is Vercel, which runs UTC.

So `18:00` was stored as `18:00Z` — **20:00 in Zagreb**.

It stayed invisible because every display formatter pinned `timeZone: "UTC"`, so each one echoed
the typed digits back and they all agreed with each other. One typed string produced three answers:

| Surface | Showed | Why |
| --- | --- | --- |
| Wizard step 5 review | `18:00` | parses and formats browser-local — a round-trip identity |
| Cards, lists, emails, PDF | `18:00` | wall clock re-anchored to UTC, then printed as UTC |
| **Real behaviour** — countdown, cron, ballot gate, token expiry | **`20:00`** | the stored instant |

The countdown was the only consumer doing epoch math against a real clock, which is why it was the
only thing that looked broken. **It was the honest one.** Everything else was quietly two hours out.

### What that reached

Every scheduling consumer read the same shifted column, so they were mutually consistent and
collectively wrong — nothing errored:

- elections opened and closed ~2 h late (cron sweep)
- **the ballot gate accepted votes 2 h past the advertised close** (`votingOver`)
- magic-link tokens lived 2 h longer (`tokenExpiry`)
- the automatic 24 h reminder fired 2 h off (`autoReminderDue`)
- **the invitation email printed a closing time the system did not honour** (`email.service.ts`)

That last one is the reason this was a correctness bug and not a cosmetic one: a published,
emailed deadline the product itself ignores.

---

## The rule now

> **A time typed in the wizard means `Europe/Zagreb`.**

One constant, one converter, in `src/lib/elections-view.ts`:

```ts
export const ELECTION_TIME_ZONE = "Europe/Zagreb";
export function zonedWallClockToInstant(wallClock: string): Date | null
```

`zonedWallClockToInstant` uses two `Intl.DateTimeFormat().formatToParts()` passes — read the digits
as if UTC, measure the zone's offset at that instant, subtract, then refine once so DST boundaries
land correctly. No dependency: `Temporal` is not available unflagged on Node 24, so `Intl` is the
native tool.

**It names its zone explicitly, so it returns the same instant on any host.** That property is what
lets the tests assert literal `Z` instants and pass in Zagreb and in CI's UTC alike.

Display then moved from `timeZone: "UTC"` to `timeZone: ELECTION_TIME_ZONE`. A *fixed* zone is
exactly as hydration-deterministic as UTC — which is the guarantee the UTC pin actually existed for —
so server and client still render identical strings. Verified in the browser: zero hydration errors.

### Edge behaviour, pinned by test rather than left to chance

| Input | Result |
| --- | --- |
| Summer `18:00` | `16:00Z` (CEST, +2) |
| Winter `18:00` | `17:00Z` (CET, +1) |
| Non-existent local time (spring forward, `02:30`) | resolves **forward** to `03:30` local |
| Ambiguous local time (autumn, `02:30`) | takes the **second** occurrence (CET) |
| `2026-02-31T10:00`, `2026-13-01`, `25:00` | `null` — rejected, not rolled over |

---

## Files changed

| File | Change |
| --- | --- |
| `src/lib/elections-view.ts` | `ELECTION_TIME_ZONE`, `zonedWallClockToInstant`, `electionYear`; 3 formatters moved off the UTC pin |
| `src/actions/create-election.ts` | `parseLocalDate` deleted, converter wired in |
| `src/components/voter/voter-ui.tsx` | `formatVoterDateTime` moved off the UTC pin |
| `src/lib/elections-view.test.ts` | +11 tests |
| `src/actions/create-election.test.ts` | tautology replaced with literal `Z` instants |

### Two faults that fixed themselves

Neither needed its own patch — both stop being expressible once the parse returns a true instant.
Worth knowing so nobody goes hunting for them:

- **Mixed anchors.** `startsAt = new Date()` (a true instant) sat beside `endsAt` from the wall-clock
  parse, so in manual mode their *difference* was corrupt. That could trip the `endsAt <= startsAt`
  "not scheduled" sentinel on a real close date, after which the election silently got a **30-day
  token window** and no reminder. Reachable on a draft save, where validation is skipped.
- **Validation.** `closeAt <= new Date()` compared a shifted value against a true instant, so a past
  deadline could be accepted and a genuinely future one rejected.

### What deliberately did NOT change

- **`step-review.tsx`** — its browser-local round trip is now *correct*, because the server agrees.
- **`election-wizard.tsx:79-80`** — the client gate compares the two wall clocks *against each other*.
  A shared shift is order-preserving, and it never compares against `now`.
- **`startElection` / `closeElection` / `duplicateElection` / the seed** — all already write true
  instants.
- **`billing-card.tsx`, `account-management-card.tsx`** — still `timeZone: "UTC"`. Those are Stripe
  instants; a separate and much milder issue, and changing them here would widen the diff past the bug.

---

## Working with dates from here

- A wall-clock string from a form goes through `zonedWallClockToInstant`. **Never `new Date(str)`** —
  that binds it to whatever zone the process happens to run in.
- Anything formatting an election date pins `ELECTION_TIME_ZONE`, never `"UTC"` and never nothing.
- Deriving a calendar field (year, day) from a stored instant uses the same zone. `electionYear`
  exists because the year filter and the card must agree: `2025-12-31T23:30Z` is already 2026 in
  Zagreb, so `getUTCFullYear()` would file an election under a year the UI does not show.

### Ceilings

- **One hardcoded zone.** Wrong the day an organization outside Croatia signs up. The upgrade is one
  step: the constant becomes an `Election.timeZone` column and the formatters take it as an argument.
- **No backfill.** Rows written before this fix keep the shifted instant, and the display change now
  *reveals* it rather than hiding it. Verified against production: one throwaway row, no real
  election affected.
- **Nothing labels a timezone in the UI.** Under this rule the times on screen are simply true for a
  Croatian admin, so no label is required — but a `CET/CEST` hint beside the wizard's time inputs is
  a cheap follow-up.

---

## Verification

746 tests (735 → 746) · `tsc` clean · lint 0 errors · build clean · ISR and marketing prerender intact.

**Six mutations, all caught by named tests** — reverting the parse, dropping the DST refinement pass,
zone back to UTC, dropping either input guard, and the year filter.

Two notes on the mutation run, because both nearly produced a false "verified":

1. The first run declared **every** mutation a survivor, including the one that reverts the whole
   bug. `--reporter=basic` crashes vitest, so the summary line never appeared and the parser read
   the empty output as zero failures. **A green control run does not prove the harness works** — only
   a negative control does.
2. The negative control then failed to fail, because its canary string `"3.244"` also appears in a
   **comment** two lines above the assertion, and a first-occurrence replace corrupted the comment
   instead of the test.

### The test that could not fail

`create-election.test.ts` previously asserted:

```ts
expect(arg.data.startsAt).toEqual(new Date("2999-06-01T09:00"));   // input: "2999-06-01T09:00"
```

The same ambiguous expression on both sides, shifting identically in every zone. It was the only
assertion covering the parse, and it passed everywhere for exactly the reason the bug existed. Every
other date fixture in the suite uses explicit `Z` instants, so the parse never ran in them.

**Rule this leaves behind:** a date assertion states a literal `Z` instant. If the expected value is
built by the same call the code under test uses, the test pins nothing.

### Browser

Wizard run end to end on the dev database, scheduling for 23:50 at 23:35:

- stored `startsAt` = `2026-09-02T21:50:00.000Z` = **23:50 Zagreb**
- countdown read **`0h 13m · do otvaranja glasanja`** (old code: `2h 13m`)
- schedule line `2. ruj · 23:50 – 3. ruj · 00:20` — midnight crossing correct
- **0 console errors**, no hydration mismatch

Fixture removed; dev DB verified back to baseline (19 elections, 2087 votes, 3 archives, 0 fixture rows).
