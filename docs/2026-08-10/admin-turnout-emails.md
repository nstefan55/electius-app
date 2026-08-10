# Admin Turnout Emails — Phase 3 of the email delivery work

**Branch** `feature/admin-turnout-emails` · **Version** 0.9.26 → **0.9.27** (patch, one per phase)
**Spec** `context/features/email-delivery-and-admin-turnout-spec.md` §4 + §6 Phase 3
**Follows** phase 1 (v0.9.25, `docs/2026-08-09/resend-transport.md`) and phase 2
(v0.9.26, `docs/2026-08-09/resend-templates.md`)

The email that was promised and never built. `Election.adminTurnoutReminder` had been written by
the wizard since the wizard shipped, carried into the archive snapshot and the GDPR export — and
**nothing had ever sent anything**. Worse, unlike its sibling `voterReminder24h`, the value was
never shown again after creation, so an admin could not even discover what they had chosen.

Because phase 2 landed first, the turnout email is **born as a hosted template** rather than
written inline and migrated later. That was the whole point of D1's `1 → 2 → 3` ordering.

**One migration (one additive column), one cron pass, no new route, no new dependency.**

---

## Findings index

| # | Finding | Where |
| --- | --- | --- |
| F1 | **The topic MUST be `opt_in`, and it is immutable after creation.** Resend delivers to a non-contact *only if* the topic default is `opt_in`; org admins are not contacts, so `opt_out` would have silently delivered nothing to everyone | §3 |
| F2 | **`RESEND_UNSUBSCRIBE_URL` renders EMPTY for a non-contact.** §4.4's premise — that a topic hands you a working unsubscribe link for free — holds only for contacts. Found by sending, not by reading | §7 |
| F3 | **Template + `topicId` is expressible.** `CreateEmailBaseOptionsWithTemplate` omits only `from`/`subject`, so `topicId` survives onto the template branch. Had it not, §4.4 and phase 2 were in direct conflict | §3 |
| F4 | Deviation: **`CLOSES` (a date), not the spec's `TIME_LEFT` (a countdown)** — a countdown is wrong the moment the email is read. Same reasoning `sendReminderEmails` recorded one phase earlier | §4 |
| F5 | Resend's **idempotency dedupe was observed at the transport level**: a deliberately re-run send on the same `turnout:{id}:50` key produced no second email, even with the DB claim artificially cleared | §6 |
| F6 | The **entitlement gate leaves the column at `0`**, proven live — so an org that upgrades tomorrow still gets its milestone. This is what "gate before claim" buys | §6 |
| F7 | `.env.development` declares **`BILLING_ENABLED` twice** (pre-existing, not introduced here). dotenv takes the last assignment — same duplicate-key class the cleanup pass fixed for `R2_ACCOUNT_ID` | §8 |
| F8 | The sweep's **fifth** pass now rides the same `CRON_SECRET` and pinger as the other four. Pinging it against dev opens any overdue SCHEDULED election and sends **real invitations** | §6 |

---

## 1. What was decided, and what was already settled

All eight spec decisions (D1–D8) were taken at phase 1's `start`; none were reopened. The four
that land here:

| # | Decision | Shipped as |
| --- | --- | --- |
| D3 | Milestones **25 / 50 / 75** | `TURNOUT_MILESTONES` in `elections-view.ts`. At most three emails per election, ever |
| D4 | Recipients are **org admins**, not `election.createdBy` | `organization.admins`, deduped by lowercased email |
| D6 | The email links the **overview**, never the results page | `electionOverviewUrl(id)` — a sealed election has no results page, and a link that 404s on some elections is worse than one that never does |
| D8 | A **new** `canUseAdminTurnout`, not a reuse of `canUseAutoReminders` | Exhaustive `switch` in `entitlements.ts` |

**D8 is the one worth understanding.** The pricing copy sells voter reminders and turnout updates
on one bullet, so sharing `canUseAutoReminders` is *defensible*. It is still wrong: these are two
columns with two separately-toggled switches, so a shared gate means a future tier change to voter
reminders silently moves admin turnout with it. A test pins the two as distinct functions, so
nobody can later "tidy up" one into an alias of the other.

### One thing the spec left as an "if", resolved as yes

§4.5 says *"If the wizard is to gate the toggle too… that is the same predicate, read in one more
place."* It is gated. `liveResults` and `voterReminder24h` are both Pro and both gated in
`step-settings.tsx` **and** re-enforced in `create-election.ts`; leaving admin turnout ungated
recreates exactly the silent failure the gating branch closed — a Free admin ticks it, the value
persists, the config card reports it enabled, and the sweep quietly skips forever with no error
and no trace.

So the predicate is read in **three** places: the wizard (locked row + upgrade link),
`createElection` (the trust boundary — the client supplies the payload), and the sweep.

---

## 2. The column, and why it is a column

Migration `20260809153332_add_admin_turnout_notified_pct` — one additive column:

```sql
ALTER TABLE "elections" ADD COLUMN "adminTurnoutNotifiedPct" INTEGER NOT NULL DEFAULT 0;
```

A column and **not** a key inside a JSON blob, for the reason `Archive.prunedAt` records: a
negated Prisma JSON path filter returns `NULL` on a row lacking the key, so `NOT(NULL = true)`
excludes it — the sweep would match nothing and prune nothing, invisibly. A destructive or
send-bearing job that fails by doing *nothing* is the worst failure mode available.

### ⚠ The column is monotonic. Turnout is **not**.

The spec's own justification for milestones was "turnout only goes up", and its review pass
corrected that to false. `addVoters` accepts voters on an ACTIVE election still inside its window
(`mutationsFrozen` freezes only CLOSED / ARCHIVED / window-over), which raises the **denominator**
— so `turnoutPct` can fall. That is deliberate: adding mid-election lowers turnout in the
conservative direction.

The mechanism survives because the stamp only ever ratchets upward. After a 50 % email, a drop to
30 % sends nothing; a later climb past 75 % sends once. **The `lt` guard is what makes this work
— do not read the milestone ladder as licence to drop it.** A test pins exactly that sequence.

### Where the column does NOT go

Neither `organization-export.ts` nor `ElectionSnapshot`, and **`EXPORT_VERSION` stays 3**. The
precedent is exact: `autoReminderSentAt`, the analogous idempotency marker from v0.9.19, is in
neither. Both record what the *system* did, not what the *organization* configured — and the
export versions the payload **shape**, so gratuitously adding a field costs a version bump for no
portability gain.

---

## 3. Resend: the topic, and two things checked before building

Live account state was re-read at `start` rather than carried forward (§0.5 forbids trusting the
2026-08-08 reading): domain verified, **open + click tracking both `false`**, 10 published
templates, 1 webhook, **0 topics**.

### F1 — `opt_in` is forced, and you get one shot

Resend's rule for `topicId`, from the docs:

> If a recipient has opted out of a topic, the email will fail. **If they are not yet a contact,
> delivery depends on the topic's default subscription setting** — the email is sent only if the
> default is `opt_in`.

Org admins are **not** Resend contacts. With `opt_out`, every turnout email would have been
silently dropped for every admin — the feature would look built and deliver nothing.
`defaultSubscription` is **immutable after creation**, so this had to be right the first time.

```
Topic: "Obavijesti o izlaznosti"
ID:    291027cb-0d99-432b-be84-68c12810fe15
Default subscription: opt_in     ← mandatory, cannot be changed
```

Per §3.2 the topic applies to **this email only**. Emails 1–5 are transactional and pass no
`topicId`: a voter who once clicked "unsubscribe" must still receive their ballot, or the product
has silently disenfranchised them. A test asserts an invitation carries no `topicId`.

### F3 — template and topic are not mutually exclusive

Worth confirming before designing around it, since a conflict here would have forced the turnout
email back to raw content and undone phase 2 for one message:

```ts
interface CreateEmailBaseOptionsWithTemplate
  extends Omit<CreateEmailBaseOptions, 'from' | 'subject'> { … }
```

The omit drops only those two, so `topicId` survives. `CreateBatchEmailOptions` is
`Omit<CreateEmailOptions, 'attachments' | 'scheduledAt'>`, so batch keeps it too.

### The two templates

`electius-admin-turnout-hr` and `-en`, both **published** (a draft is not sendable). The shell is
ported from phase 2's `voter-reminder` template byte-for-byte — same navy header, same dark-mode
block, same `#1D4ED8` CTA — so the five emails cannot drift apart visually.

`-en` is authored even though **it is unreachable today**: every send defaults to `hr`, because no
caller threads a locale (§2.5, phase 4's job). It exists because `templateId()` appends the locale
unconditionally, so the invariant "every alias in `TEMPLATE` resolves in both locales" must hold or
an `en` send 404s the moment locale threading lands.

Phase 2 left `TEMPLATE` typed as `Record<Exclude<EmailType, "turnout">, string>` **specifically** so
that adding a turnout sender without a template would be a compile error rather than a runtime send
to an alias Resend does not know. That `Exclude` is now removed, which is the intended way to
discharge it.

---

## 4. Content: five scalars, and the one field that cannot exist

### §3.3 is enforced by the type, not by review

```ts
interface TurnoutEmailVars {
  TITLE; TITLE_HTML; ORG; ORG_HTML;
  MILESTONE; TURNOUT_PCT; VOTES_CAST; VOTERS_TOTAL;
  CLOSES; QUORUM; URL;
}
```

**No candidate field, so adding one is a compile error.** Same technique as `VoterExportRow` (no
token) and `ElectionSnapshot` (no voter PII).

This is not fussiness. For an `AFTER_CLOSE` election the tally is sealed **from the admin too** —
`resultsAccess()` returns `"sealed"` for any ACTIVE election that is not LIVE — so per-candidate
counts in an inbox would deliver exactly what every screen refuses to show. The transport enforces
it independently: Resend variables are `string | number` only, so a candidate list is not even
expressible.

A test serialises the outgoing variables and asserts the key set exactly, plus the absence of
`candidate` / `kandidat` / `option` / `winner`.

### F4 — `CLOSES`, not `TIME_LEFT` (deviation from §4.3)

The spec lists `TIME_LEFT` from `timeLeftParts`. Shipped is `CLOSES` from the shared
`formatVotingDateTime`. Two reasons, pointing the same way:

1. **A countdown is wrong the moment the email is read.** "2 days left" becomes a lie six hours
   later in an inbox. This codebase already decided this one phase ago: `sendReminderEmails`
   "names the closing date rather than a countdown", precisely so it "stays true when the sweep
   catches an election late". Same medium, same failure.
2. `timeLeftParts` returns `{days, hours, minutes}` and the unit strings live in the catalogs as
   ICU templates — which would have meant **resurrecting the `fill()` interpolation helper phase 2
   deliberately deleted** when copy left the code.

Invariant #5 is satisfied either way: `formatVotingDateTime` is the same UTC formatter the screen,
the report and the reminder email use.

### The quorum row is word-free on purpose

`QUORUM` is `"140/200"` (required voters out of total, via the shared `quorumRequiredVoters`) or
**`"—"`** when no quorum is set. No words, so no translation and no escaped twin; the labels live
in the template where phase 2 put copy.

The dash matters: Resend templates have **no conditionals**, so an empty value would render an
empty table cell that reads as a rendering bug. And a "no quorum" election must not display a
fabricated `0 % (0/200)`.

### Raw/escaped pairs, unchanged from phase 2

`TITLE`/`TITLE_HTML` and `ORG`/`ORG_HTML`. `{{{triple-brace}}}` does **not** escape (proven by
sending in phase 2), and one template fills subject + text + HTML from one variable set — so an
admin-controlled value cannot be a single variable: escaped would print `&#39;` in plain text, raw
would put live markup in an inbox. `CLOSES` and `QUORUM` have no twins because they are our own
output, not admin text.

---

## 5. The sweep's fifth pass — gate → claim → send

Carried verbatim from the v0.9.19 reminder pass. Every position is load-bearing:

```
ACTIVE, adminTurnoutReminder = true, adminTurnoutNotifiedPct < 75   ← pre-filter ONLY
→ pct       = turnoutPct(votes, voters)          the shared derivation
→ milestone = turnoutMilestoneDue(pct, notified) the pure rule
→ resolveEntitlement + canUseAdminTurnout        GATE BEFORE CLAIM
→ updateMany where { …, adminTurnoutNotifiedPct: { lt: milestone } }   the count IS the check
→ sendAdminTurnout
```

1. **Entitlement before the claim.** A Free org is never stamped, so an org that upgrades tomorrow
   still gets its milestones. Stamping first would mark the election as notified without notifying
   it — silently, permanently. **Proven live in §6.**
2. **Claim before send.** The status and `lt` conditions live in the WHERE clause, so two
   concurrent sweeps cannot both pass. *Accepted cost:* a crash between claim and send eats that
   milestone. A missed turnout update is a non-event; a duplicate stream is not.
3. **A failed send does not clear the stamp.** Clearing restores the race the stamp exists to
   prevent, on a sweep pinged every minute.

The pass has its **own `catch`**, so a turnout failure never blocks activation or closing — those
are time-critical and turnout can wait for the next ping.

`turnoutMilestoneDue` returns the **highest** milestone reached, not the next in sequence: an
election jumping 10 % → 80 % gets one email about 75 %, not three. The sweep sends at most one per
pass anyway, so "next in sequence" would mean three passes and two emails quoting stale figures.

### Response shape changed

`{ activated, closed, reminded, notified, elections, reminders, turnout, archives }` — `notified`
and `turnout` are new. §8 pings this endpoint and reads its shape.

---

## 6. Live verification

Against the real Resend account and the Neon **development** branch, with a throwaway org + admin
on `delivered@resend.dev` (Resend's sink) so nothing reached a real inbox and no demo data moved.

> **F8 — read this before pinging the sweep against dev.** One SCHEDULED election had a start time
> already in the past. Any ping opens it and sends **real invitations** — this has happened before
> (2026-08-08). It was parked at setup and restored at teardown.

| Check | Result |
| --- | --- |
| Unauthorized ping | **401**, no work done |
| Run 1 | `notified: 1`, milestone **50**, `sent: 1`, delivered |
| Column after run 1 | `adminTurnoutNotifiedPct = 50` |
| **Run 2, identical ping** | `notified: 0`, `turnout: []`, **column unmoved**, and **no second email at Resend** |
| Highest-milestone rule | stamp cleared at 60 % turnout → picked **50, not 25** |
| Second rung | votes pushed to 80 % → milestone **75**, figures `80 %`, `8 od 10`, quorum `7/10` |
| Email content | overview link (not results), no candidate data, correct closing date |
| **Entitlement gate** | `BILLING_ENABLED=true` + Free → `notified: 0` **and column still `0`** (F6) |
| Tracking, after all template work | open `false`, click `false` |

**F5, observed rather than designed:** after clearing the stamp and re-pinging, the sweep reported
`sent: 1` but **no new email appeared at Resend** — the idempotency key `turnout:{id}:50` was
unchanged, so Resend deduped it inside its 24 h window. Seeing the new template required a genuinely
different milestone. Unlike the ballot senders, a stable key is *correct* here: nothing re-mints
between passes, so the same election at the same milestone is the same message.

**Cleanup, SQL-proven:** 19 elections · 2087 votes · 3993 voters · 1 org · 1 user · 0 fixture rows ·
0 stamped · parked election restored to `2026-08-07 11:56`. Temp scripts deleted, `.env.development`
restored.

### Bar

`npm run lint` · `npx tsc --noEmit` · `npm run build` (47 pages) · `prisma migrate status` — all
clean. **606 tests** (from 580, +26).

### Mutation check — 9 guards, 9 caught

Every mutation turned a **named** test red, not the whole file. The script asserted each search
string was **found** before writing, because a mutation that silently fails to apply looks exactly
like a mutation no test catches — the CRLF trap this repo has hit twice.

| Mutation | Caught by |
| --- | --- |
| `m > notifiedPct` → `>=` | "ne ponavlja već javljenu prečku" + the fall/rise case |
| `turnout >= m` → `>` | "javlja prečku točno na granici" |
| descending loop → ascending | "javlja NAJVIŠU dosegnutu prečku" |
| `canUseAdminTurnout` allows Free | 3 tests, wizard + action + predicate |
| `topicId` dropped | 2 tests |
| idempotency key dropped | key-stability test |
| quorum `"—"` → `""` | quorum-formatting test |
| admin dedup removed | dedup test |
| `createElection` guard removed | 2 tests |

---

## 7. ⚠ F2 — the unsubscribe link, and the decision it forced

The first real send rendered this in the footer:

```html
<a href="">isključiti</a>          <!-- and in plain text: "…možete isključiti: " -->
```

**`RESEND_UNSUBSCRIBE_URL` resolves to nothing for a recipient who is not a contact.** The docs
frame the unsubscribe URL and preference page as contact-scoped throughout (audiences, broadcasts,
segments). So a topic gives you two separable things, and only one of them works here:

| | Non-contact recipient |
| --- | --- |
| Delivery gating (`opt_in` default) | ✅ works — the email is delivered |
| Unsubscribe token / preference page | ❌ empty — there is no contact record to attach one to |

§4.4's premise — *"the unsubscribe page, the preference column and the token are all things this
product does not build"* — holds **only if the admin is a contact**. Only sending revealed this;
no test could have.

**Resolution (user decision):** the sentence is removed from both templates and the footer now
points at the per-election setting, which is true and reachable. The **topic stays** and keeps
gating delivery, so the machinery is ready the day contacts exist. The alternative — upserting
every org admin as a Resend contact — was declined: it puts admin email into a persistent
third-party contact store (a new PII location beyond the send logs), needs an audience, and would
have to join the GDPR erasure path in `account-deletion.service.ts`.

> **Open ceiling: there is no per-person opt-out today.** The per-election wizard toggle is the
> admin's only control, and §4.4 is explicit that a per-election toggle **is not an opt-out** — they
> answer different questions ("send updates for this election" vs "stop sending me these at all").
> Phase 4's natural home, alongside the `List-Unsubscribe` header item already listed there.
>
> This is defensible for now: the recipient is an org admin who enabled the feature themselves and
> has full dashboard control, not a marketing list. An **empty link** was the only unacceptable
> option, and it is gone.

---

## 8. Handover — things the app cannot detect

**`RESEND_TURNOUT_TOPIC_ID` must be set in Vercel.**
`RESEND_TURNOUT_TOPIC_ID=291027cb-0d99-432b-be84-68c12810fe15` is in both local env files. The
sender **throws** when it is missing — deliberately, following `requiredPriceId`: there is no safe
fallback, because sending without the topic id delivers while ignoring an unsubscribe, and the
topic exists precisely to honour one. Missing in production means turnout emails stop, loudly in
logs and silently to the admin. Same silent-no-op class as Upstash, R2 and `RESEND_FROM_EMAIL`.

**The cron pinger must be configured**, with `CRON_SECRET` set. This pass rides the same trigger as
the other four. Closing is self-healing (the first ping after an outage closes everything overdue);
**turnout milestones are not** — a pinger down while an election crosses 75 % misses that milestone
permanently, because a later ping sees a stamp that was never set but a turnout that already
passed… and will send the *highest* reached milestone once. (So it degrades to "one email instead of
three", not "nothing".)

**F7 — `.env.development` declares `BILLING_ENABLED` twice** (line 56 `false`, plus another
assignment further down). Pre-existing, not introduced here; dotenv takes the last. Same
duplicate-key class the 2026-08-02 cleanup pass fixed for `R2_ACCOUNT_ID`. Worth resolving.

**The turnout templates join the launch-review surface.** Phase 2 made copy a dashboard artifact
rather than a code artifact, so it no longer passes through code review. There are now **twelve**
published templates to read before `BILLING_ENABLED=true`, tracked the same way the marketing Proof
section is.

---

## 9. Not verified, stated rather than implied

- **No browser pass.** The wizard toggle (now live and gated) and the new "Obavijesti o izlaznosti"
  row on the overview config card were not opened in a browser. Both render from existing patterns
  and both type-check and build, but the visual result is unconfirmed.
- **The `-en` template is unreachable today.** Authored, published and locale-selection unit-tested,
  but every send defaults to `hr` until phase 4 threads a locale.
- **The cron route has no unit tests.** Invariant #8 keeps tests to `src/lib` and `src/actions`, and
  a route handler is neither — so the pass's gate → claim → send ordering rests on the live
  idempotency and gate runs in §6, not on a test.
- **No `purchased` entitlement path exists to exercise.** The variant is in every `switch` (and the
  exhaustiveness test) with no producer.
- **Rendering was read from the API's stored HTML/text**, not opened in a mail client. Cross-client
  rendering — Outlook especially — is unverified for these two templates, same as phase 2's ten.

---

## Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` + `migrations/20260809153332_…` | `Election.adminTurnoutNotifiedPct Int @default(0)` |
| `src/lib/elections-view.ts` | `TURNOUT_MILESTONES`, `TurnoutMilestone`, `turnoutMilestoneDue` |
| `src/lib/entitlements.ts` | `canUseAdminTurnout` (D8) |
| `src/lib/services/email.service.ts` | `TEMPLATE` loses its `Exclude`; `turnoutTopicId()`; `EmailBody` gains `topicId` + numeric variables; `TurnoutEmailVars`; `sendTurnoutEmails` |
| `src/lib/services/publication.service.ts` | `sendAdminTurnout` — org admins, deduped, figures from `_count` |
| `src/app/api/cron/activate-elections/route.ts` | the fifth pass + `notified`/`turnout` in the response |
| `src/actions/create-election.ts` | `adminTurnoutLocked` guard, outside `if (!draft)` |
| `src/components/elections/wizard/step-settings.tsx` | `soon: true` removed; entitlement lock added |
| `src/components/elections/wizard/election-wizard.tsx` | `adminTurnoutLocked` → jump back to step 4 |
| `src/lib/upgrade-context.ts` | new `adminTurnoutReminder` upgrade feature |
| `src/lib/urls.ts` | `electionOverviewUrl` (D6) |
| `src/lib/db/elections.ts` + overview page + `election-overview.tsx` | surface `adminTurnoutReminder` in the config card |
| `messages/{hr,en}.json` | wizard error + upgrade context + 4 config-card keys (round-trip guarded, CRLF preserved) |

Tests: `elections-view.test.ts` · `entitlements.test.ts` · `email.service.test.ts` ·
`publication.service.test.ts` · `create-election.test.ts`.

**Resend artifacts:** topic `291027cb-0d99-432b-be84-68c12810fe15` ·
`electius-admin-turnout-hr` (`149b5ac6-…`) · `electius-admin-turnout-en` (`2388db07-…`), both published.

---

## Related

- `context/features/email-delivery-and-admin-turnout-spec.md` — §4, §6 Phase 3, §7 decisions, §8 bar
- `docs/2026-08-09/resend-transport.md` — phase 1, the transport this stands on
- `docs/2026-08-09/resend-templates.md` — phase 2, why this email is a template from birth
- `docs/2026-08-08/automatic-voter-reminders.md` — the pass this one is modelled on
- `docs/2026-08-08/admin-turnout-emails-deferred.md` — what shipped instead, and the flag deleted here
