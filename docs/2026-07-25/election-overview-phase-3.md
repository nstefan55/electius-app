# Election Overview Phase 3 — Send Reminder Modal

> Branch: `feature/election-overview-phase-3` · version unchanged (**v0.9.4**, bump skipped at the user's request) · Spec: `election-overview-phase-3-spec` (Election Spec Files) · Design: `context/design/electius-app-design-prototype/project/Election Overview.dc.html` § "Send reminder (Phase 3)"
> Final phase of the overview trilogy. Phase 1 shipped the chrome, phase 2 the body; this replaces the **Send reminder** button's `comingSoon` toast with a real confirm modal that emails voters.

## What shipped

Clicking **Pošalji podsjetnik** in the Actions card opens a two-panel dialog: a review panel with a live recipient count and two "skipped" rows, then a sent panel with the real number delivered. Confirming mints fresh magic-link tokens for every reachable voter and sends them the invitation email.

| Surface | File |
| --- | --- |
| Modal (both panels) | `src/components/elections/send-reminder-dialog.tsx` *(new)* |
| Button wiring | `src/components/elections/election-overview.tsx` (`ActionsCard`) |
| Server actions | `src/actions/elections.ts` (`reminderPreview`, `sendElectionReminders`) |
| Recipient rule + send | `src/lib/services/publication.service.ts` |
| Bulk minting | `src/lib/services/token.service.ts` (`mintTokensForVoters`) |
| i18n | `messages/{hr,en}.json` → `dashboard.election.overview.reminder` |

The old `actions.reminderSoon` key is gone from both catalogs. No new dependency, no schema change — the modal reuses the `@base-ui/react` `Dialog` already used by the QR dialog.

## Who gets a reminder — read this before changing the filter

**Every voter who has not voted and still has a reachable link.** Decided 2026-07-25; the spec's literal wording ("voters who have a magic link valid") would have excluded `PENDING` voters, and since `publishElection` flips `PENDING → INVITED` on every successful send, a healthy election has zero `PENDING` voters — the modal would have read "Send to 0" in the normal case.

| Voter state | Outcome |
| --- | --- |
| `INVITED`, token not yet expired | reminded — token re-minted, new link |
| `PENDING` (send previously failed) | reminded — token minted, status flips to `INVITED` |
| `VOTED` | skipped → *Skipped (already voted)* |
| token already past `expiresAt` | skipped → *Skipped (expired link)* |

An expired link is **not** revived by re-minting: token expiry is derived from the election (`tokenExpiry(startsAt, endsAt)`), so a replacement inherits the same dead date. `partitionReminderTargets` therefore also takes a `windowOver` flag — when the election's own expiry is already in the past (an `ACTIVE` election sitting past `endsAt`, waiting for the auto-close sweep), **nobody** is reachable and every non-voted voter is counted as expired. This is why the seeded demo elections all show 0 recipients: their `endsAt` dates are in the past.

### One rule, two callers

`partitionReminderTargets` is a pure function, and both the preview count and the actual send go through it via `getReminderTargets`. This is deliberate: if the modal counted with one filter and the send used another, the button would promise "Send to 42" and deliver 39. When changing who qualifies, change the partition — nothing else decides.

`sendElectionReminders` re-derives its own recipient list server-side. The count the client received is display only and is never sent back.

## Reminders rotate the magic link

The raw token exists only in `token.service`'s return value and the outbound email — the DB stores `SHA-256(token)`. There is no way to re-send the *original* link, so a reminder necessarily mints a new one and **the previously emailed link stops working**.

That is a security property, not a workaround (it is the same delete-and-re-mint `resendVoterLink` has always done), but it has a user-visible consequence: a voter who goes back to the older email hits the voter flow's invalid-link screen. That screen offers a fresh link, so it degrades rather than dead-ends. The modal's note text states the rotation explicitly — do not remove that sentence without changing the behaviour first.

## Failure posture

`sendInChunks` was extracted from `publishElection` and is now shared by both paths, so reminders inherit the publication pipeline's semantics unchanged:

- ≤100 recipients per Resend batch call, chunks sent sequentially (Resend's 2 req/s limit).
- A batch succeeds or fails whole. A failed chunk leaves its voters' status untouched — **voter status is the retry queue**, so pressing Send again resumes instead of double-sending.
- Nothing ever rolls back. Emails cannot be unsent.

`{ sent, failed }` comes back to the modal; a non-zero `failed` raises an error toast alongside the sent panel, which reports the real delivered count.

## Guards

Both actions call `requireSession()` and then `assertOwnedActive(id, organizationId)` — a single `findFirst` whose WHERE carries org ownership **and** `status: "ACTIVE"`. A cross-org id, a closed election and a missing row all collapse into one `invalidStatus` error; nothing distinguishes them to the caller, which is intentional (no existence oracle). The Send reminder button is also disabled client-side on any non-`ACTIVE` election, but that is UX — the action is the boundary.

## Testing

`npm run test` → **120 passing** (19 new).

- `publication.service.test.ts` — the partition table (voted / expired / reachable, the exactly-now expiry boundary, `windowOver` reaching nobody), plus `sendReminders` re-minting for exactly the reachable ids, no-op when everyone has voted, the `INVITED` flip, and a failed chunk counting as failed instead of throwing.
- `elections.test.ts` — both actions: empty-id short circuit, the org + `ACTIVE` WHERE shape, counts-not-ids in the preview payload, and error mapping.

Browser-verified against the dev DB with a temporary 3-voter fixture: review counts exact with correct Croatian paucal forms, a real Resend send, token rotation and the `PENDING → INVITED` flip proven by SQL, reopen recounts, the past-deadline election showing 0 recipients with the button disabled, `CLOSED` disabling the button, `/en` copy complete, 0 console errors. Fixture removed afterwards; zero leftovers confirmed.

## Known gaps

Both are logged in `docs/post-mvp-feature-list.md` under Elections:

- **No cooldown.** Repeat clicks re-mint every recipient's token each time, so a burst of sends leaves a trail of dead links. Marked `ponytail:` at the call site in `src/actions/elections.ts`.
- **Reminder reuses the invitation email verbatim** (`voter.inviteEmail`), so a reminded voter receives what reads as a duplicate invitation. A `voter.reminderEmail` namespace plus a branch in `email.service.ts` is all it needs.
