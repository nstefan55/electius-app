# Election Publication — Tokens & Invitation Emails

> Branch: `feature/election-publication` · v0.8.0 · Spec: election-publication-spec
> The pipeline between "election becomes ACTIVE" and "every voter holds a live magic link" — for both manual start and scheduled start.

## What shipped

Before this feature, `startElection` only flipped DRAFT → ACTIVE: no tokens existed, no emails went out, and the start screen's "sends emails immediately" warning was an over-promise. Now it's true:

1. **`src/lib/services/token.service.ts`** (new, `server-only`) — mints a 256-bit CSPRNG token (`crypto.randomBytes(32)`, base64url) per **PENDING** voter and stores only the **SHA-256 hash** in `voter_tokens`. The raw token exists only in the in-memory return value and the outbound email.
2. **`src/lib/services/publication.service.ts`** (new, `server-only`) — `publishElection(electionId)`: mint tokens → chunk voters ≤100 → sequential `resend.batch.send` → per **successful** chunk flip voters `PENDING → INVITED` → return `{ sent, failed }`.
3. **`src/lib/services/email.service.ts`** (extended) — `sendInvitationEmails(recipients, election, locale)` reuses the branded action-email template via Resend's batch API. CTA = `voteUrl(rawToken)` (apex magic link). Copy in the new `voter.inviteEmail` i18n namespace (hr + en).
4. **Manual start wiring** — `startElection` keeps its atomic DRAFT→ACTIVE guard, then publishes. New `resendInvitations(id)` server action (org-scoped, ACTIVE-only). The start-card success state shows real sent/failed counts with a Retry button.
5. **Scheduled start wiring** — `POST /api/cron/activate-elections` activates due SCHEDULED elections and publishes each. Secured by `Bearer ${CRON_SECRET}` with a timing-safe compare.

## How the retry model works (read this before touching it)

**Voter status is the queue.** There is no job table and no background worker:

- Publication only ever targets `PENDING` voters.
- A successful Resend chunk flips its voters to `INVITED`.
- A failed chunk (Resend batch calls succeed/fail whole) leaves its voters `PENDING`.
- Therefore *any* re-invocation of `publishElection` — the admin Retry button, a resumed timeout — picks up exactly where the last run stopped. `INVITED`/`VOTED` voters are never re-emailed.

**Resend = revoke + re-mint.** Raw tokens are unrecoverable by design (hash-only storage), so a retry deletes the voter's leftover token row and mints a fresh one. Side effect (deliberate security feature): every resend invalidates the previously emailed link.

**Activation never rolls back.** If the flip succeeds but sends fail, the election stays ACTIVE and the action still returns `success: true` with the failed count — emails cannot be unsent, so send failures are a retry problem, never a rollback problem.

## Token rules

| Rule | Value |
| --- | --- |
| Raw token | 32 bytes CSPRNG, base64url (43 chars) |
| Stored | SHA-256 hex hash only (`voter_tokens.hash`, unique) |
| Per voter | Exactly one (1:1 `voterId` unique) |
| Expiry | `election.endsAt`; if `endsAt <= startsAt` (wizard "unscheduled" placeholder) → activation + 30 days |
| Single-use | `used` flag — flipped by the future vote transaction (voter-flow spec) |

## Sweep endpoint

`POST /api/cron/activate-elections` (outside `[locale]`; the proxy matcher skips `/api`).

- **Auth:** `Authorization: Bearer ${CRON_SECRET}` — timing-safe compare, 401 otherwise. No session, no rate-limit dependency.
- **Logic:** find SCHEDULED elections with `startsAt <= now()`, flip each with a per-row atomic `updateMany` status guard (same idiom as `startElection` — concurrent sweeps can't double-publish), then `publishElection` each. `startsAt` is NOT touched (the admin's scheduled time stands).
- **Idempotent:** a quiet sweep matches 0 rows; already-ACTIVE elections are never re-published. Safe to ping every minute.
- **Trigger is infrastructure config, never app code:** currently an external pinger (cron-job.org, every 1–5 min, with the Authorization header). On a future self-hosted setup, a real crontab/systemd timer hits the same endpoint — zero code change.

### Deployment checklist

- Generate a production `CRON_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`), add to production env. Use a **different** value than dev.
- Configure the pinger: `POST https://<host>/api/cron/activate-elections`, header `Authorization: Bearer <secret>`, every 1–5 minutes.
- The app cannot verify a pinger exists — if SCHEDULED elections aren't activating, check the pinger first.

## Security notes

- Raw tokens never appear in logs, Prisma args (test-pinned), or admin-facing responses.
- Election title / org name are **HTML-escaped** before interpolation into the email HTML body (admin-controlled data is a trust boundary); subject + plain-text stay raw.
- Worst case of a leaked `CRON_SECRET`: a due election starts a few minutes early. No data access, no duplicate sends.
- This is **stage 1** of the chain of custody documented in the spec's Security & Integrity Model; the voter-flow spec (vote cast) and archive spec (Merkle seal) implement stages 2–3 against it.

## Testing

- **Vitest (70 total, 26 new):** `token.service.test.ts` (hash vector, expiry fallback, delete+re-mint, raw-token-never-in-Prisma-args), `publication.service.test.ts` (chunking, per-chunk INVITED math, failed-chunk-stays-PENDING), `email.service.test.ts` (payload-per-recipient, token-in-CTA, HTML escaping, throw-on-error), `elections.test.ts` (start guard + publish wiring, resend org/ACTIVE guard).
- **Live (dev server + dev DB):** Playwright manual start with real Resend sends to test addresses — DB verified via SQL (ACTIVE, 3× INVITED, 64-hex hashes, `expiresAt = endsAt`); sweep curl matrix (no auth 401 / wrong secret 401 / correct → activated+sent / second ping no-op). Smoke rows cleaned up.

## Recorded ceilings

- **Chunk-level failure granularity** (not per-recipient) — fine at the Free 50-voter cap; revisit with the background-job spec for Pro unlimited voters.
- **Sync in-request sends** — bounded by the serverless timeout; per-voter INVITED tracking makes a cut-short send resumable via Retry.
- If a chunk's emails send but the INVITED flip fails (DB error between the two), a retry re-emails that chunk — accepted by the rollback-free design.
- **Invite locale defaults `hr`** — thread the voter/org locale through when `en` ships.
- **QR payload still encodes `electionVoteUrl(electionId)`** which 404s — the election-level ballot entry route is the voter-flow spec's call.

## Files

| File | Change |
| --- | --- |
| `src/lib/services/token.service.ts` | new |
| `src/lib/services/publication.service.ts` | new |
| `src/lib/services/email.service.ts` | extended (template helpers + batch invitations) |
| `src/actions/elections.ts` | `startElection` publishes; new `resendInvitations` |
| `src/components/elections/start-election-card.tsx` | success state: real counts + Retry |
| `src/app/api/cron/activate-elections/route.ts` | new sweep endpoint |
| `messages/hr.json` / `messages/en.json` | `voter.inviteEmail` + start-card success/retry keys |
| `*.test.ts` (4 files) | 26 new cases |
