# Resend as the Transport of Record (Phase 1)

**Branch:** `feature/resend-transport` · **Version:** 0.9.25 · **Date:** 2026-08-09
**Spec:** `context/features/email-delivery-and-admin-turnout-spec.md` — Phase 1 of 4
**Phases 2 (hosted templates) and 3 (admin turnout emails) build on this and are not shipped.**

No copy changed, no new email exists, and nothing a user can see behaves differently. This is the
plumbing every email now stands on.

---

## 1. What was wrong

All five emails (OTP · password reset · delete-account · voter invitation · voter reminder) live in
`src/lib/services/email.service.ts`, and each one built its own `resend.emails.send` / `batch.send`
call. That meant:

| Finding | Consequence |
| --- | --- |
| Zero webhooks, no route to receive one | A bounced invitation was **invisible**. The voter stayed `INVITED` forever and silently dragged turnout down |
| `RESEND_FROM_EMAIL` fell back to `onboarding@resend.dev` | An unset variable in production ships real mail from a Resend sandbox domain — deliverable, wrong, undetectable by the app. Same silent-no-op class as Upstash and R2 |
| No tags | Resend's logs could not be filtered, and a future webhook had nothing to correlate on |
| No idempotency keys | A retry above the DB-claim layer double-sends |

Five call sites were also five chances for those to drift apart.

---

## 2. One transport, five senders

`email.service.ts` now has a single private `send()` / `sendBatch()` pair. Every sender goes through
it, and it is the only place three things live: the `from` resolution, the tags, and the idempotency
key.

```
sendOtpEmail ─┐
sendResetPasswordEmail ─┤
sendDeleteAccountEmail ─┼─→ send()      ─→ resend.emails.send(body, options)
sendInvitationEmails ─┐ │
sendReminderEmails ───┴─┴─→ sendBatch() ─→ resend.batch.send(bodies, options)
```

`EmailBody` (`to` / `subject` / `text` / `html`) is deliberately its own type: **Phase 2 replaces it
with `template` + variables**, and the SDK types those as mutually exclusive branches, so keeping the
shape in one place makes that a one-spot change.

---

## 3. The sender fails loudly, at first send

```ts
function sender(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not set — refusing to send from a fallback domain");
  return from;
}
```

Two decisions worth keeping:

- **No fallback.** The old default silently shipped production mail from a sandbox domain.
- **Resolved at first send, not at module load** — the `stripeClient()` posture. `email.service.ts` is
  imported by BetterAuth, which is imported by `requireSession()`, which every signed-in page
  imports. A top-level throw would 500 the entire app for a missing variable instead of failing the
  one send that actually needs it.

---

## 4. Tags

`type` (`otp` · `reset` · `delete-account` · `invite` · `reminder` · `turnout`) plus `electionId`
where one exists.

**Never a voter address in a tag.** A cuid is not personal data and is the only thread that leads a
bounce back to a voter row; Resend's logs are not a place to keep a list of who voted. Tags come
*back* on the webhook payload (`data.tags`), which is what makes the correlation work at all.

`turnout` is declared now and has no sender until Phase 3.

---

## 5. Idempotency keys — read this before changing them

The key lives on the **request options** (second argument), not in the payload. `sendInChunks` sends
a whole chunk in one `batch.send`, so it is **one key per chunk, never one per recipient.**

```
invite:{electionId}:{sha256(sorted token hashes).slice(0,16)}
reminder:{electionId}:{…}
```

**Why it is derived from tokens and not from voters.** Both ballot senders re-mint tokens on every
call (delete + create), so a retry of a failed chunk legitimately carries *different* magic links. A
key derived from voter ids would be **stable across a re-mint** and would suppress exactly the retry
that invariant #7 depends on ("sends never roll back, status is the retry queue") — silently, and
only on the failure path, which is the last place anyone looks.

Two corrections were needed against the spec, both worth knowing:

1. The spec said `sha256(sorted tokenIds)`. **Token ids do not exist to the caller** — `mintTokensFor`
   writes via `createMany`, which returns a count, not rows. Getting ids means N single `create` calls
   or a follow-up query.
2. The **token hash** is used instead. It is already computed inside the minter, it is a pure function
   of the raw token (so it changes on exactly the event the rule cares about), and it costs no extra
   query. It is also not the raw token, so nothing secret enters the derivation (invariant #2).

**Auth mail carries no key at all.** OTP, reset and delete-account are user-triggered; "resend" there
is a request for a *new* message, and a key would suppress it.

Resend's idempotency TTL is **24 hours**, keys max 256 chars (ours are ~49). Confirmed 2026-08-09.

---

## 6. Delivery webhook

`POST /api/resend/webhook`, outside `[locale]` (no next-intl context needed — nothing user-facing is
rendered).

- Signature is verified over the **raw body**. Parsing and re-stringifying changes bytes and breaks it.
- **Not rate-limited.** A 429 to a delivery webhook is a lost fact nobody resends — the same reasoning
  that keeps the Stripe webhook out of the limiter.
- Subscribed to **four events only**: `email.bounced` · `email.complained` · `email.failed` ·
  `email.suppressed`.
- Never deletes a voter or touches a vote. It is a source of truth about *delivery*, not about the
  right to vote.

### The `verify()` signature is not what it looks like

`resend.webhooks.verify()` does **not** accept the request's `Headers`. Its `headers` field is
Resend's own interface, `{ id, timestamp, signature }`, mapped internally onto `webhook-id`,
`webhook-timestamp` and `webhook-signature` (standard-webhooks format). It is also **synchronous** —
it returns the payload, it does not return a promise.

```ts
const id = request.headers.get("webhook-id");
const timestamp = request.headers.get("webhook-timestamp");
const signature = request.headers.get("webhook-signature");
if (!id || !timestamp || !signature) return 400;      // trust boundary, checked explicitly
resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret });
```

### The decision half is pure, and lives in `src/lib`

`src/lib/delivery-feedback.ts` holds `isDeliveryFailure` · `readDeliveryFailure` · `parseEventTime` ·
`stampsVoters`. The route only verifies and writes.

Same split as `archive-prune.ts` is to the cron sweep, and the same reason: tests cover
`src/actions/` and `src/lib/` only (invariant #8) and a route handler is neither. The module is
dependency-free — its single import is `type`-only — so it pulls in neither the SDK nor the Prisma
singleton (`dashboard-paths.ts` precedent).

`stampsVoters` is the guard that matters: OTP, reset and delete-account mail goes to admins, who have
no row in `voters` and whose emails carry no `electionId`. Without it, an admin bounce would fire a
voter update with no election in its `WHERE`.

Recipient matching is **exact**, deliberately: the address in the webhook is the address we sent to,
which is the address on the voter row, byte for byte. No case-folding needed.

---

## 7. Migration

`20260809134612_add_voter_delivery_failed_at` — one nullable `Voter.deliveryFailedAt`.

It is **not** a new `VoterStatus` variant. Status is the retry queue (invariant #7) and a bounced
voter is still `INVITED`; folding delivery into status would make the retry queue lie.

The column is written only by the webhook. Nothing reads it yet — surfacing "invitation bounced" in
the voter roster is Phase 4.

---

## 8. Two rules that constrain all future work here

1. **Click tracking must stay off, forever.** Resend's click tracking rewrites every `href` through
   Resend's domain — and the voter invitation's href **is the raw magic-link token**. Enabling it
   would put every voter's single-use token into a third party's click logs, against invariant #2.
   Open tracking is milder but still records that a *named voter* opened a ballot at a given moment.
   This is enforced in two places: the domain setting, and the webhook's event subscription. Both must
   stay as they are.
2. **Transactional mail is not subscribable.** Emails 1–5 pass no `topicId`, carry no unsubscribe link
   and are never blocked by a preference. A voter who once unsubscribed must still receive their
   ballot. Only the Phase 3 admin turnout email gets a topic.

---

## 9. Verification

- `npm run lint` · `npx tsc --noEmit` · `npm run test` (**577**, up from 518) · `npm run build` — clean
- **All five new guards mutation-checked**, each failing exactly one *named* test: the sandbox-domain
  fallback, a voter-derived key, `stampsVoters` losing its `electionId` requirement, a tracking event
  treated as a failure, and `parseEventTime` keeping an `Invalid Date`
- **Webhook, live against a dev server:** forged signature → 400 **and no write**; missing headers →
  400 and no write; valid signature → `stamped:1` with the stamp carrying the **event's** timestamp
  rather than the processing time; a valid `email.delivered` → acknowledged, no write
- **Sends, live against the real Resend account:** `publishElection` → `{sent:2, failed:0}` with
  `PENDING → INVITED`; `sendReminders` → every token rotated (which is why its key differs from the
  invitation's); two identical invitation calls produced **exactly one** email, proving the
  idempotency key dedupes for real
- **Tags read back from the live API:** auth mail carries `type` and no election; voter mail carries
  `type` + `electionId`; no address in any tag. (Resend's REST `GET /emails/:id` returns tags — the
  MCP formatter does not display them, which is misleading.)
- Dev DB restored to baseline and SQL-verified; open/click tracking re-asserted `false` **after** the
  work

---

## 10. Not done — do not assume otherwise

- **A real bounce has never reached the route.** Two genuine bounces were produced
  (`bounced@resend.dev`, both recorded `bounced` by Resend), so the events fired and delivery was
  attempted — but the endpoint 404s until this branch is deployed. **Re-run `bounced@resend.dev` after
  the first deploy** and confirm the voter row is stamped.
- Resend's `/events` API returned an empty list, so the stored event body could not be inspected. The
  payload shape rests on the SDK typings plus a locally-signed test.
- Every outbound email is still Croatian — no caller passes a locale. That is a recorded ceiling, and
  it is the honest home of Phase 4, not a bug introduced here.

### Needs a human

`RESEND_WEBHOOK_SECRET` and `RESEND_FROM_EMAIL` must both be set in **Vercel**. The app cannot detect
either. Without the webhook secret the deployed route answers **500 to every event**; without the
sender, every send throws. The secret is in `.env.development` and `.env.production` locally and is
**not** recorded in this document — Resend shows a webhook signing secret once, at creation.

Webhook: `a5573272-719c-4c9f-9d33-93d29a36972a` → `https://dashboard.electius.com/api/resend/webhook`.

---

## 11. What Phases 2 and 3 inherit

- **Phase 2 (hosted templates)** swaps `EmailBody` for `template: { id: alias, variables }`. `send()`
  and `sendBatch()` do not otherwise change. Keep `escapeHtml()` — Resend's `{{{triple-brace}}}` does
  not escape, and election titles and organization names are admin-controlled strings going into
  voter inboxes. Decision taken: **copy lives in Resend**, locale in the alias
  (`electius-voter-invite-hr`), which means the five email blocks leave `messages/{hr,en}.json` and
  all ten templates become a launch-review surface.
- **Phase 3 (admin turnout emails)** adds one `EmailType` (`turnout`, already declared), a
  `turnout:{electionId}:{milestone}` idempotency key, and the cron sweep's fifth pass. It depends on
  this phase only.
