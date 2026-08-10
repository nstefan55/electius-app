# Per-Recipient Delivery Failure — Phase 4 of the email delivery work

**Branch** `feature/per-recipient-delivery` · **Version** 0.9.27 → **0.9.28** (patch, one per phase)
**Spec** `context/features/email-delivery-and-admin-turnout-spec.md` § Phase 4
**Follows** phase 1 (v0.9.25, `docs/2026-08-09/resend-transport.md`), phase 2
(v0.9.26, `docs/2026-08-09/resend-templates.md`) and phase 3
(v0.9.27, `docs/2026-08-10/admin-turnout-emails.md`)

Phase 4 is marked *optional, post-launch* and is six independent items. **Two were built.** The
other four were each checked against the live SDK and the live schema and deferred with a reason —
two of them because the spec's premise no longer holds.

What shipped closes one loop from both ends: **at send time**, Resend now refuses individual
recipients instead of the whole batch; **after delivery**, the webhook's `Voter.deliveryFailedAt`
stops being a column nothing reads. One column, both channels, one question answered — *who did not
get this*.

**No migration, no new route, no new dependency, no schema change.**

---

## Findings index

| # | Finding | Where |
| --- | --- | --- |
| F1 | **Proven live, and it is the whole branch:** the same 3-recipient batch with one bad address sends **0 of 3** under `strict` and **2 of 3** under `permissive`, with `errors:[{index:1,…}]`. Today's production behaviour is the first row | §5 |
| F2 | **`resend@6.17.2` exposes no `suppressions` resource.** The spec's suppression-list sync is not a typed SDK call — only a raw `fetchRequest`. Checked against the client surface, not assumed | §2 |
| F3 | **No locale column exists on `User` or `Organization`.** `/profile`'s language card only navigates; nothing persists. Locale threading needs its own migration and its own "who owns locale" decision | §2 |
| F4 | **`inviteVoter` would have silently lied.** A permissive rejection is not a throw, so the single-voter path would have flipped a rejected voter to INVITED — status asserting an invitation that was refused | §4 |
| F5 | **A row marker alone would have been useless.** At `ROSTER_PAGE_SIZE = 10`, a 285-voter roster is 29 pages. Proven live: page 1 badges **1** of **2** failures | §3 |
| F6 | The `as const` on `batchValidation` is load-bearing, not style: `Batch.send<Options>` narrows the response with `Options['batchValidation'] extends 'permissive'`, so without the literal the `errors` field **does not exist on the type** | §4 |
| F7 | Success now **clears** an earlier stamp. Acceptance is not delivery, but the webhook re-stamps within seconds, so the marker answers *"is this address broken now"* rather than *"was it ever"* | §4 |
| F8 | The `/tmp` bash-vs-Node divergence and the Turbopack HMR `ChunkLoadError` both recurred. Neither is application code | §7 |
| F9 | **Found at `review`:** the stamp write sat inside the shared `try`, so a failed *annotation* was reported as a failed *send* — 99 voters already flipped to INVITED could still be counted in `failed` | §4 |
| F10 | **Found at `review`:** the count chip's accessible name was the count alone, so a screen reader announced a button without announcing what it does | §3 |

---

## 1. Decisions taken at `start`

| # | Decision | Taken |
| --- | --- | --- |
| P4-1 | Build **`batchValidation: 'permissive'`** + **bounce in the roster**; defer the rest | user |
| P4-2 | A permissive per-index rejection **stamps `deliveryFailedAt`** too — one column, both channels | user (recommended) |

P4-2 is the one that shaped the design. A send-time rejection produces **no webhook** — Resend never
accepted the message, so there is nothing to report later. Without it the roster would have had two
different silences for the same practical problem: a bounced voter marked, a refused voter merely
stuck at PENDING and indistinguishable from one whose invitation is still in flight.

The voter still stays **PENDING**. Invariant #7 is untouched: status remains the retry queue, and the
column only annotates it.

---

## 2. What was deferred, and why it is not laziness

Each was checked against the installed SDK or the live schema before being set aside.

**Suppression-list sync (F2).** `resend@6.17.2`'s client exposes `segments` · `apiKeys` ·
`automations` · `batch` · `broadcasts` · `contactProperties` · `contacts` · `domains` · `emails` ·
`events` · `logs` · `oauthGrants` · `templates` · `topics` · `webhooks`. **There is no
`suppressions`.** The MCP connector has the tools; the runtime SDK does not, so the app could reach
it only through the generic `fetchRequest`. It is also largely subsumed: a suppressed address fires
`email.suppressed`, which the phase-1 webhook already stamps, and `permissive` now refuses it
per-recipient at send time rather than killing the chunk.

**`List-Unsubscribe`.** Blocked on phase 3's F2 — `RESEND_UNSUBSCRIBE_URL` renders **empty** for a
non-contact, and upserting admins as Resend contacts was declined in phase 3 (a new persistent PII
location in a third party, needing a place in the GDPR erasure path). Nothing has changed since.

**Locale threading, §2.5 (F3).** The spec treats it as plumbing. It is not: **no locale column
exists anywhere**, and the cron sweep has no request context, so voter mail cannot read a request
locale even in principle. It needs a migration, a decision about whether locale belongs to the
`User` or the `Organization`, and it is the same work that would finally make `/profile`'s language
choice persist. It is a feature. It is also what still gates `/en` and the five `-en` templates
phase 2 authored and nobody can reach.

**Delivery stats per election.** New read surface, no design, no value before real volume.

---

## 3. Making a dead column reachable (F5)

`Voter.deliveryFailedAt` was written by the webhook in v0.9.25 and **read by nothing** — the same
shape `resultsVisible`, `resultsMode` and `adminTurnoutReminder` were each caught in.

Rendering a marker on the row is the obvious fix and, on its own, close to useless. The roster pages
at 10 rows; the seeded election has 285 voters, i.e. 29 pages. A failure on page 19 is not
information anybody will ever encounter. **Live proof:** with two stamped voters, page 1 badges
exactly one.

So three things ship together, and only the first is the marker:

1. **The row badge** — beside the *address*, not the status chip, because it is the address that is
   broken. The status still reads "Pozivnica poslana"; verified live, and that is invariant #7 made
   visible.
2. **A count chip in the summary row** — `Neisporučeno: 2`. Rendered only when the count is above
   zero, so a healthy election carries no new noise at all.
3. **The chip *is* the control.** It is a button that applies the filter, so discovery and reach are
   one element rather than two.

**F10 — the chip needed an accessible name for its action.** Its visible label is a count, so the
computed name was `Neisporučeno: 2` and a screen reader announced a button without announcing what
pressing it does. The same class of call this codebase has made three times before (the gated
locale, the customizations card, the plan badges' `sr-only` suffixes). Fixed with an `aria-label`
that carries the action — and deliberately **keeping the visible text as a prefix of it**, so voice
control ("click Neisporučeno") still matches the button.

The filter reuses the **existing** status dropdown, URL parameter and server-side `WHERE` — one
control that means "narrow this list", no second parameter, no second code path. `"FAILED"` is
deliberately not folded into the status branch:

```ts
if (status === "FAILED") where.deliveryFailedAt = { not: null };
else if (status) where.status = status;
```

A voter whose invitation was refused is still `PENDING` or `INVITED`. Collapsing the two would put a
value the enum does not know into `where.status`. A test pins it, and mutating the branch turns that
named test red.

**The timestamp never crosses the boundary.** `getVoterRoster` projects
`deliveryFailedAt → deliveryFailed: boolean`. The row renders only *that* the address is broken, and
a date nobody prints has no business in the RSC payload — the same reasoning that keeps per-ballot
timestamps off the public results page. Verified live by searching the whole document, script
payload included: no `deliveryFailedAt`, no timestamp.

---

## 4. The transport change

`sendBatch` now asks for `batchValidation: "permissive"` and returns the rejected input **indices**.

Indices rather than addresses because the caller supplied the array, so the mapping is unambiguous
even when two people share a mailbox. **A whole-call failure still throws** — "Resend never received
the call" and "Resend received the call and refused recipient 7" are different facts, and only the
first justifies putting a hundred voters back in the queue.

```ts
const rejected = new Set(await send(batch));
const accepted = batch.filter((_, i) => !rejected.has(i));
const refused  = batch.filter((_, i) =>  rejected.has(i));
```

Splitting by index makes the accounting exact **by construction**: the two sides always partition the
chunk, so even a bogus index out of range cannot make `sent + failed` disagree with `batch.length`.

**F6 — the `as const` is not style.** `Batch.send<Options>` narrows its response with
`Options['batchValidation'] extends 'permissive' ? { errors } : Record<string, never>`. Drop the
literal and `errors` is not on the type at all, so the rejected recipients become unreadable. The
first clean `tsc --noEmit` was the confirmation that the inference lands.

**F4 — `inviteVoter` had to change or it would have lied.** It is the single-voter path (roster
resend, voter-flow "email me a link") and it does not go through `sendInChunks`. A rejection there is
no longer a throw, so without an explicit branch the one refused recipient would still have been
flipped to INVITED — a status asserting an invitation Resend had just refused. It now returns
`"rejected"`, stamps, and leaves the status alone; `resendVoterInvite` maps it to a named toast,
because "the address was rejected" is not a server error and clicking again will not fix it.

**F7 — a successful send clears an earlier stamp.** It rides the `updateMany` that already flips the
accepted voters, so it costs nothing. Acceptance is not delivery — but if this message also bounces,
the webhook re-stamps within seconds. The marker therefore answers *"is this address broken now"*.
The alternative, never clearing, is accurate and useless: it means "something failed at some point",
which stays true forever.

**`sendAdminTurnout` counts what was sent, not what was intended.** The milestone is claimed in the
database *before* the send and deliberately never released, so under `strict` one bad admin address
would have swallowed the notification for every other admin, permanently.

**F9 — the stamp gets its own `catch`, and that is a semantic fix rather than defensiveness.** It
first sat inside the shared `try`, so if the stamp write threw *after* the accepted voters had
already been flipped to INVITED, the outer `catch` reported `sent: 0, failed: <whole chunk>` — the
database correct, the number shown wrong. The rule the codebase already applies to R2 deletes in
`sealElection` / `deleteElection` covers it exactly: **cleanup that fails must not fail work already
done.** A failure to *annotate* the retry queue is not a failure to *send*. The consequence was
mild and self-correcting (a retry targets PENDING, so the already-invited are skipped anyway), which
is precisely why it would never have been noticed in production.

---

## 5. Verification

`npm run lint` · `npx tsc --noEmit` · `npm run build` all clean. **621 tests passing (+15 from 606),
34 files** — including the first test file in `src/lib/db/`, which had none.

### Every new guard mutation-checked

Twelve mutations, each turning a **named** test red — not the whole file:

| Mutation | Named test it kills |
| --- | --- |
| `batchValidation` back to default | *traži permissive provjeru na svakom skupnom slanju* |
| never report rejected indices | *vraća indekse odbijenih primatelja* |
| flip the whole chunk to INVITED | *keeps only the rejected recipients PENDING…* |
| do not stamp the rejected | *keeps only the rejected recipients PENDING…* |
| count the whole chunk as sent | *counts a fully refused chunk as failed…* |
| `inviteVoter` ignores a rejection | *does not flip a rejected voter to INVITED…* |
| success no longer clears the stamp | *flips only the successful chunk's voters to INVITED* |
| turnout reports intended, not sent | *ne broji administratore koje je Resend odbio* |
| `FAILED` collapsed into the status branch | *gađa stupac dostave, a status ostavlja na miru* |
| the failure count picks up the search filter | *broji neisporučene na cijelim izborima…* |
| spread the row instead of projecting | *nosi činjenicu, ne datum* |
| stamp back inside the shared `try` (F9) | *still reports the accepted recipients as sent when the stamp write fails* |

The runner **asserts the search string was found before writing**. One pattern had the wrong
indentation and was reported as `SEARCH STRING NOT FOUND` rather than as a surviving mutation — the
CRLF trap this repo has hit twice, where a mutation that fails to apply is indistinguishable from one
no test catches.

### F1 — live, against the real Resend account

The one claim types cannot settle. Same 3-recipient batch, one deliberately invalid address, sent to
`delivered@resend.dev`:

| mode | `error` | sent | `errors` |
| --- | --- | --- | --- |
| **strict** (today) | ``Invalid `to` field…`` | **0 of 3** | `null` |
| **permissive** (this branch) | `null` | **2 of 3** | `[{index: 1, message: "Invalid \`to\` field…"}]` |

The first row is what production does right now: one dead address returns a hundred voters to PENDING
and the retry re-mints a hundred magic links to fix one.

### Browser pass — hr + en, 0 console errors

On a throwaway org (the demo org untouched, so its admin count and therefore `sendAdminTurnout` are
unmoved): 14 voters over 2 pages, two stamped — one on each page.

- Page 1 shows the chip `Neisporučeno: 2` and badges **1** row (F5).
- Clicking the chip → `?status=FAILED`, 2 rows, both badged, *Prikazano 2 od 14*.
- Badge computed `#B45309` on `#FFFBEB` — design-system `warning-700` / `warning-50`.
- **Status chips still read "Pozivnica poslana"** — a delivery failure never leaves the retry queue.
- No `deliveryFailedAt` and no timestamp anywhere in the document, script payload included.
- Healthy election: no chip, no badge; the filter option is still present (a permanent control).
- `?status=BOGUS` falls back to no filter.
- `/en`: `Not delivered: 2` · `Delivery failed` · `Not delivered`, no Croatian leftovers.

Fixture destroyed; dev DB SQL-proven back to baseline — 1 org · 1 user · 19 elections · 3993 voters ·
**0 stamped** · 3 tokens · 2087 votes · 0 fixture rows.

### Not verified, stated rather than implied

- **A real bounce still has never reached the route.** Phase 1 recorded this; the endpoint 404s until
  deployed. The *webhook* half of `deliveryFailedAt` is therefore proven only by a locally-signed
  payload, while the *send-time* half is now proven end to end.
- **The permissive path was not driven through the app's own send** — the probe called
  `resend.batch.send` directly. Doing it through `publishElection` means putting an invalid address
  on a real voter row; the wiring between the two is unit-tested and mutation-checked.
- No `purchased` entitlement path exists to exercise.
- **The two `review` fixes (F9, F10) landed after the browser pass and were not re-verified in a
  browser.** F9 is covered by a mutation-checked test; F10's `aria-label` is static markup that
  `lint` / `tsc` / `build` accept, but the *computed* accessible name was not re-read live.

---

## 6. Ceilings and handover

- **The retry still re-mints.** A refused voter stays PENDING, so the next publish or reminder mints
  a fresh token for them — correct under invariant #7, but it means a permanently dead address is
  re-attempted on every send. The roster now makes that visible, which is the point; removing the
  voter is the admin's call and nothing does it automatically. A webhook must **never** delete a
  voter or alter a vote (§1.6).
- **No bulk action on the filtered view.** Filtering to the failures gives a list, not a "remove all"
  button. Deliberate — removal is only permitted on DRAFT/SCHEDULED elections, and a bulk destructive
  action over a filter is its own decision.
- **`RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` and `RESEND_TURNOUT_TOPIC_ID` must be set in
  Vercel**, and the app cannot detect any of them. Unchanged from phases 1–3; repeated because the
  webhook half of this feature is inert in production until the secret is set.
- **The cron pinger and `CRON_SECRET`** are still unconfigured infrastructure.
- `.env.development` still declares **`BILLING_ENABLED` twice** (pre-existing; dotenv takes the last).

---

## 7. Environment notes

- **`/tmp` differs between bash and Node on Windows** — a `cp` to bash's `/tmp` was invisible to
  `node`, which resolved `C:\tmp`. Use repo-relative temp paths. (Third recorded occurrence.)
- **Turbopack `ChunkLoadError` on the HMR client chunk** produced a page that never settled while the
  server logged a steady stream of `200`s — the recorded reload-loop signature, and *not* application
  code. A fresh browser context cleared it; the session cookie has to be re-established afterwards.
- `npm run build` clobbers the `.next` a running dev server serves from; `TaskStop` again left a
  process holding port 3000, killed by PID.
- `package.json` carries uncommitted WIP (`db:seed`, `db:seed:pro`, `cron:sweep`) pointing at
  **untracked** files, so the version was bumped on a clean copy from `HEAD` and staged alone, then
  the WIP restored on top with the new version.
