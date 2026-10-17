# Admin welcome email + vote confirmation email

**Branch:** `feature/admin-welcome-email` · **Version:** 0.9.88 · **Date:** 2026-10-17

Two new transactional emails. Both are hosted Resend templates like the existing fourteen, so
the copy lives in Resend and the code only sends an alias plus variables. There are now
**18** published templates.

| Email | Alias | Sent from | Recipient |
| --- | --- | --- | --- |
| Admin welcome | `electius-welcome-{hr,en}` | `completeSetup` (`src/actions/setup.ts`) | the admin |
| Vote confirmation | `electius-vote-confirmation-{hr,en}` | `castVote` (`src/lib/services/vote.service.ts`) | the voter |

To change the wording, edit the template in Resend and **re-publish** it. A draft edit is
not live. Change both locales, or the two languages drift.

---

## 1. Admin welcome email

Sent once, when `/setup` creates the organization. That is the first moment an admin fully
exists: a first name, an organization and (on the email path) a verified address. It
covers both email signup and Google signup, because both end up at `/setup`.

- **Not** BetterAuth's user-create hook: before `/setup` there is no organization and no
  first name to greet.
- Later visits to `/setup` (profile edits) send nothing. Only the org-create branch sends.
- Best-effort. The organization is already created, so a failed send is logged and setup
  still returns success.
- Idempotency key `welcome:{userId}` absorbs a double form submit.
- Language: the admin's own `User.locale`, normalised by `resolveLocale`.

| Variable | Value |
| --- | --- |
| `NAME` / `NAME_HTML` | admin's first name, raw / HTML-escaped |
| `ORG` / `ORG_HTML` | organization name, raw / HTML-escaped |
| `URL` | `newElectionUrl(locale)`: `/{locale}/elections/new` on the dashboard host |

The URL carries a locale prefix on purpose. An unprefixed path redirects to `hr`, so an
English admin would land in the Croatian UI.

---

## 2. Vote confirmation email

Sent to the voter right after a ballot is recorded.

### When it is sent

`castVote` schedules the send with Next's `after()` **after** the vote transaction commits.

- The voter's confirmation screen never waits on Resend.
- A refused ballot (wrong selection, used token, closed election) schedules nothing.
  `after()` runs even when a request fails, so the call has to come after the commit, not
  before it.
- A failed send is caught: `console.error` plus a Sentry event tagged
  `route: api/vote, pass: confirmation` with the election id only. It can never change
  the vote result.
- No idempotency key. A token can succeed only once, so a repeat send cannot happen.
- Language: `election.createdBy.locale`, the same source the invitation uses, so the
  voter gets the confirmation in the invitation's language.

### What it contains, and what it never contains

| Contains | Never contains |
| --- | --- |
| Election title, organization name | The voter's choice |
| "Wasn't this you?" note with the organizer's contact | The verification code (`voteHash`) |
| Link to the public `/{locale}/verify/{electionId}` page | The voting token or any link that acts as a key |
| Privacy notice link (same footer as the invitation) | Any hash, key or secret |

The "Wasn't this you?" note is the point of the email: if someone else used a voter's
link, this is how the voter finds out.

The verify link carries only the election id, which is already printed on the
voting-QR posters. The voter types their code on that page themselves. Putting the code
in the email would give Resend an email → `voteHash` → choice mapping.

| Variable | Value |
| --- | --- |
| `TITLE` / `TITLE_HTML` | election title, raw / HTML-escaped |
| `ORG` / `ORG_HTML` | organization name, raw / HTML-escaped |
| `ORG_EMAIL` / `ORG_EMAIL_HTML` | organization contact email, raw / HTML-escaped |
| `NOTICE_URL` | `voterNoticeUrl(locale)` |
| `VERIFY_URL` | `verifyUrl(locale, electionId)`, new in `src/lib/urls.ts` |

This list is closed. `email.service.test.ts` asserts the exact set of variable names, so a
new variable (for example the code) fails a test instead of reaching an inbox.

### Bounces

The email carries the `electionId` tag, so a bounce goes through the existing delivery
webhook and stamps `Voter.deliveryFailedAt`. The roster then shows a delivery-failure badge
on a voter who has already voted. That is accurate: the vote counts, the address is broken.

### ⚠ Known limitations

- **Timing link to the ballot (accepted).** Resend logs the send time to the millisecond,
  and it matches `Vote.createdAt`. Someone with both the Resend logs and the database
  could work out how a voter voted. The schema deliberately stores no voter-side
  timestamp, and this email re-creates one outside the database. Sending right after the
  vote was a product decision taken knowing this. Two fixes for later, marked with a
  `ponytail:` comment in `castVote`:
  1. store `Vote.createdAt` rounded to the day, or
  2. send all confirmations in one batch when the election closes.
- **Large cohorts.** One send per vote. If hundreds of people vote at once, Resend's API
  rate limit can refuse some sends. The vote is unaffected, but that confirmation is lost
  (logged, not retried).
- **Privacy pages are out of date.** `/privacy` and `/privacy/voters` describe Resend as
  sending invitations and reminders only. They need a line about the confirmation, in
  both locales.
- **Local development sends real mail.** Every vote cast locally emails that voter. The
  seeded `@example.com` voters bounce, which counts against the sending domain's
  reputation.

---

## Shared change

The election variables used by every voter email (the `TITLE` / `ORG` / `ORG_EMAIL` pairs
and `NOTICE_URL`) now come from one helper, `electionVariables()` in `email.service.ts`.
The invitation, the reminder and the confirmation all use it. That means the raw/escaped
pairing cannot differ between them.

## Tests

| File | What it pins |
| --- | --- |
| `src/actions/setup.test.ts` | welcome sent once on org create, in the user's locale; not sent on revisit or refused terms; a send failure never fails setup |
| `src/lib/services/email.service.test.ts` | welcome: alias per locale, escaped pairs, `welcome:{userId}` key. Confirmation: alias per locale, the exact variable list, tags, no idempotency key |
| `src/lib/services/vote.service.test.ts` | confirmation scheduled once after a successful cast and carries no code, token or option id; nothing scheduled on a refused ballot or a lost race; a failed send never rejects |
| `src/lib/urls.test.ts` | `verifyUrl` is on the apex host with a locale prefix |

Both new templates were also sent once for real to Resend's test address with an
HTML-special title. The subject and plain text came through raw, the HTML body escaped,
and no variable was left unfilled.
