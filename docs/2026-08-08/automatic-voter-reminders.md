# Automatic 24-Hour Voter Reminders

**Branch:** `feature/auto-voter-reminders` · **Version:** 0.9.19 (patch) · **Date:** 2026-08-08
**Spec:** `context/features/pro-features-implementation-spec.md` §2 — the second of that file's four
slices, on its own branch. One migration (one nullable column), one pass added to the existing cron
sweep, one new email sender. No new route, no new dependency, no server action.

`Election.voterReminder24h` had been written by the wizard, displayed on the overview, carried into
the archive snapshot and the GDPR export since the wizard shipped — and **nothing had ever
scheduled it**. The sending machinery existed and was tested; only the admin pressing *Send
reminder* could trigger it. This slice makes the advertised Pro feature real.

---

## Findings index

Read these before touching the files; each one cost time to discover or decide.

1. **The column is not optional, and voter status cannot replace it.** `sendReminders` re-mints
   every recipient's magic link, and it leaves INVITED voters INVITED — §1.
2. **Gate → claim → send is an ordering with three separate reasons**, one per step. Any other
   order is a real defect, not a style preference — §2.
3. **A 4-hour poll would rotate every link minutes after its invitation** without the third clause
   of the scheduling rule. That clause also excludes the wizard's placeholder dates for free — §3.
4. **The manual button is deliberately independent of the column**, and the column is named
   `autoReminderSentAt` to make that a promise rather than a comment — §4.
5. **The reminder copy states the link rotation out loud.** A voter holding two emails previously
   had no way to know which link was live — §5.
6. **The reminder email names the closing date, never "24 hours left"** — which keeps it true when
   the sweep catches an election late — §5.

---

## 1. Why the column exists

`sendReminders` mints new tokens on the way out. That is not incidental: raw tokens are
unrecoverable by design (the DB stores only `SHA-256`), so *any* resend must re-mint, which revokes
the previously emailed link. That is acceptable once, on purpose. It is not acceptable on every
sweep tick.

The cron sweep is idempotent everywhere else because the DB row itself records that the work is
done — `status` for the open and close passes, `prunedAt` for the archive sweep. Reminders had no
such marker, and **could not borrow one**:

- Voter status is unusable: `sendReminders` flips PENDING → INVITED but leaves INVITED voters
  INVITED, so after one reminder the population looks exactly as it did before.
- A token timestamp is unusable for the same reason it is being rewritten.

So the feature requires `Election.autoReminderSentAt` (nullable timestamp). Without it, a sweep
pinged every minute would email a stream of invitations of which only the last one works.

Migration `20260808141618_add_auto_reminder_sent_at` — one additive column, no default, no index
(the sweep's `WHERE` is already narrowed by `status` and `endsAt`).

---

## 2. Gate → claim → send

The pass in `src/app/api/cron/activate-elections/route.ts` runs three steps per candidate election,
and each ordering decision is load-bearing.

```
resolveEntitlement()   →  skip Free orgs
updateMany(… autoReminderSentAt: null)  →  claim; count IS the check
sendReminders()        →  send
```

**Entitlement before the claim.** If the stamp came first, a Free organisation's election would be
marked as reminded without ever being reminded — and if that organisation upgraded the next day,
the reminder would never fire, silently. Gating first leaves `autoReminderSentAt` null, so the
election stays eligible. Verified live.

**Claim before the send.** The stamp is an `updateMany` whose `WHERE` carries the condition
(`status: "ACTIVE", autoReminderSentAt: null`), so the returned count *is* the check — the same
idiom as `startElection`, the close pass and `sealElection`. Two concurrent sweeps cannot both pass
through. The reverse order (send, then stamp) reopens exactly the race the column exists to close.

**The cost of this direction, accepted deliberately:** a crash between the claim and the send eats
that reminder. A missed reminder is a non-event; a burst of emails each killing the previous one's
link is the failure being prevented. The manual *Send reminder* button is unaffected and remains the
escape hatch. For the same reason the stamp is **not** cleared when a send fails — clearing it would
restore the race and re-mint on every subsequent tick.

The whole pass is nested inside the existing sweep rather than given its own route: one endpoint,
one `CRON_SECRET`, one pinger. That is the route's own stated reasoning for the close and prune
passes.

---

## 3. The scheduling rule

`autoReminderDue(election, now)` in `publication.service.ts` — pure, exported, unit-tested, kept out
of the route so the route's query is only a pre-filter (the same split the close pass uses).

Three clauses, ANDed:

| Clause | Rule | Why |
| --- | --- | --- |
| still open | `endsAt > now` | past the deadline, a token minted now is born expired — nobody is reachable and everyone's link dies |
| within the lead | `endsAt - now <= REMINDER_LEAD_MS` | earlier than that is not a reminder, it is a second invitation |
| long enough | `endsAt - startsAt > REMINDER_LEAD_MS` | see below |

The third clause is the one that is easy to miss. Without it, an election open for four hours
qualifies the moment it activates — its `endsAt` is already inside the 24-hour window — so every
voter's magic link would be rotated minutes after the invitation email landed, and the voter would
hold two emails of which the first is already dead. There was never a moment "24 hours before
close" while that election was open, so no reminder is the only true answer.

The same clause excludes the wizard's placeholder dates (`endsAt <= startsAt`, meaning "close not
scheduled") for free: that duration is zero or negative, which fails `> REMINDER_LEAD_MS`. One rule,
three jobs.

**The two boundaries deliberately point in opposite directions** — clause 2 is `<=`, clause 3 is
`>`. An election closing in *exactly* 24 hours should be reminded on this tick rather than missed; a
*window* of exactly 24 hours had its "24 hours before close" moment at the instant it opened, when
the invitation was already being sent. Both are pinned by tests, and both were mutation-checked.

---

## 4. The manual button is independent

`sendElectionReminders` (the *Send reminder* modal's action) **neither writes nor reads**
`autoReminderSentAt`. This was a decision, and it is documented at both call sites.

Sharing the column would mean an admin who sends one manual reminder five days before close has
silently disabled the automatic reminder they enabled in the wizard — a Pro feature switched off by
using a Pro feature, with nothing in the UI saying so. Reading the column would mean the sweep can
block a human making a deliberate choice.

They answer different questions, so they get different mechanisms:

- `autoReminderSentAt` = *"the automatic 24-hour reminder has fired."*
- The manual button = *"remind them now"*, always allowed.

**Naming deviation from the spec:** the spec calls the column `reminderSentAt`. Shipped as
`autoReminderSentAt`, because under this decision the generic name would mislead the next reader
into assuming manual sends stamp it. Nothing else referenced the name.

**Consequence, left open on purpose:** the manual cooldown gap recorded 2026-07-25 — repeat clicks
leaving a trail of dead links — is *not* closed by this slice. It needs its own `lastReminderAt` or
a rate limit; folding it into this column would recreate the problem above.

---

## 5. Reminder copy

The reminder previously reused the invitation email verbatim, so a reminded voter received what
reads as a duplicate invitation. An automatic reminder makes that worse — it arrives unprompted.

New `voter.reminderEmail` namespace in both catalogs, and `sendReminderEmails` in
`email.service.ts`. Two properties worth preserving:

**It states the rotation.** *"Only the most recent link you received works — this one replaces any
earlier ones."* A voter holding an invitation and a reminder previously had no way to know the first
link was dead; they would click it, hit the invalid-link screen, and reasonably conclude the system
is broken.

**It names the closing date, not a countdown.** The subject says *closes soon* and the body gives
the date — never "24 hours remain". This stays true when the sweep catches an election late, which
it will: if `voterReminder24h` is switched on after the window has already been entered, the
reminder fires on the next tick, possibly three hours before close.

`{closes}` is formatted **inside** the email service, via the shared `formatVotingDateTime` (UTC),
so the locale that selects the catalog is the same one that formats the date — they cannot drift.

Both reminder paths — manual and automatic — go through `sendReminderEmails`, so the copy cannot
differ by who triggered it.

### `sendInChunks` takes the sender as a parameter

Rather than branching inside, the chunker now receives a send function:

```ts
sendInChunks(minted, (batch) => sendReminderEmails(batch, reminder));
```

Invitation and reminder share chunking (≤100 per Resend batch), the per-chunk INVITED flip and the
failed-chunk accounting, and differ only in copy. Adding a third ballot-link email later costs one
closure, not a second copy of the retry semantics.

---

## 6. Tests

**513 passing** (+12). Nine cover `autoReminderDue`; the rest adjust the existing `sendReminders`
suite to the new sender and assert the invitation sender is *not* called.

Every boundary was mutation-checked — a guard is not proven until flipping it turns a **specific**
test red:

| Mutation | Test that went red |
| --- | --- |
| `end > t` → `end >= t` | *stays quiet at the deadline itself* |
| `end - t <= LEAD` → `<` | *includes the exact lead-time boundary* |
| `end - start > LEAD` → `>=` | *stays quiet for a window of exactly the lead time* |

The claim-once behaviour is **not** unit-tested — it lives in a route handler, which is outside the
project's Vitest scope (`src/actions/` and `src/lib/` only). It was proven live instead; see below.

---

## Files changed

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `Election.autoReminderSentAt DateTime?` |
| `prisma/migrations/20260808141618_add_auto_reminder_sent_at/` | new, one `ALTER TABLE ADD COLUMN` |
| `src/lib/services/publication.service.ts` | `REMINDER_LEAD_MS`, `autoReminderDue`; `sendInChunks` takes a sender; `sendReminders` uses reminder copy and selects `endsAt` |
| `src/lib/services/email.service.ts` | `sendReminderEmails` + `ReminderElection`; shared private `sendBallotLinkEmails` |
| `src/app/api/cron/activate-elections/route.ts` | fourth pass; response gains `reminded` + `reminders` |
| `src/actions/elections.ts` | comment recording why the manual action ignores the column |
| `messages/{hr,en}.json` | `voter.reminderEmail` (8 lines each) |
| `src/lib/services/publication.service.test.ts` | +12 tests |

Catalogs were injected by a script that aborts unless a parse → serialise round trip reproduces the
file byte-for-byte first — 8-line diffs instead of the ~900-line rewrite a stray LF produces.

---

## Verification

`npm run lint` clean · `npx tsc --noEmit` clean · `npx vitest run` **513 passed** ·
`npm run build` clean (44 routes) · migration applied to the Neon **development** branch.

Live against the dev DB, fixture = a 7-day window closing in 12 hours with two INVITED voters
(live tokens) and one PENDING voter:

| Step | Result |
| --- | --- |
| ping without `Authorization` | **401** |
| run 1 | `reminded: 1`, `sent: 3, failed: 0`; `autoReminderSentAt` stamped; **both existing token hashes rotated**; PENDING voter flipped to INVITED and received a token |
| run 2 (identical ping) | `reminded: 0`; **all three hashes byte-identical**; stamp unmoved |
| gate run (`BILLING_ENABLED=true`, admin `isPro: false`) | skipped, and `autoReminderSentAt` **still null** — the Free org was not burned |

Run 2 is the point of the whole slice: without the column that ping would have rotated all three
links again, and so would every ping after it.

Fixture destroyed (0 leftovers), `.env.development` restored byte-for-byte, dev server stopped, all
temporary scripts deleted.

### Side effect during verification, recorded

Run 1's **activation** pass — untouched by this feature — found an existing throwaway election
sitting `SCHEDULED` with a start time already in the past, opened it, and sent a real invitation
email to its single voter. Any cron ping does this; it is the sweep working correctly on stale data.
The election was restored to `SCHEDULED`, its voter to `PENDING`, and the minted token deleted (so
the emailed link is dead). Nothing else in the dev DB moved.

**Carry-forward:** pinging the sweep against a dev database runs *all four* passes. Check for
`SCHEDULED` elections with past start times before pinging, or expect real email sends.

### Not verified

- **No browser pass** — this slice has no UI surface.
- **The rendered reminder email was never opened in a mail client.** The send round trip and the
  catalog wiring are verified; how `{closes}` and the rotation sentence look in Gmail is not.
- **Production has never executed this pass** — it runs only when the pinger runs.

---

## Action required outside the code

**The cron pinger must actually be configured**, and the app cannot verify that it is. This pass
inherits the existing sweep's trigger, so if that trigger is not running in production, reminders
silently never fire — the same class of silent no-op that previously left elections ACTIVE past
their deadline. `CRON_SECRET` must be set in Vercel.

**Ping frequency matters more than before.** The reminder fires on the first tick inside the
24-hour window. A pinger running every 1–5 minutes is fine. A pinger that is down for the whole
final day of an election misses that reminder permanently — the window closes, the election closes,
and the stamp is never set.

---

## Still open in the parent spec

- **§1 live results during voting** — launch blocker; carries the decision to collapse
  `resultsVisible` / `resultsMode` / `sealedResults` into one enum, which also fixes the public
  `/results/[id]` page being unreachable for every wizard-created election.
- **§3 admin turnout emails** — ships as "Uskoro" + disabled, not removed.
- **The manual reminder cooldown** (2026-07-25) — see §4; deliberately not closed here.

With §2 shipped, one of the two launch-blocking Pro claims in
`marketing.pricing.pro.features` and the `/settings` plan grid is now true. §1 is the other.
