# Profile & Settings Phase 4 — Account Deletion (GDPR)

**Branch:** `feature/settings-phase-4` · **Version:** stays **0.9.8** (bump skipped at the owner's request)
**Spec:** `context/features/profile-settings-phase-4-spec.md` (index: `profile-settings-spec.md`)
**Design:** `Settings.dc.html` → "Account management" section + delete modal

The **"Account management"** card on `/settings`, which lets an admin permanently erase their account,
their organization, and every election under it. GDPR Art. 17 — voters' names and emails live in our
tables, so this is in MVP scope, not deferred.

**This feature destroys data irreversibly.** Read §"Why the flow has two hops" before changing anything
in it.

**No schema change. No new dependency. No server action** — BetterAuth owns the endpoints.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/services/account-deletion.service.ts` + `.test.ts` | **new**, `server-only` — the cascade, the guards, the audit log, the R2 cleanup |
| `src/lib/auth/index.ts` | `user.deleteUser` block: `sendDeleteAccountVerification` · `beforeDelete` · `afterDelete`; rate-limit hook now supports `withUser` |
| `src/lib/services/email.service.ts` | **+`sendDeleteAccountEmail`** — a fourth caller of the shared branded template, no new layout |
| `src/components/settings/account-management-card.tsx` | **new** — the card + the type-`DELETE` modal |
| `src/app/[locale]/(auth)/confirm-deletion/page.tsx` + `src/components/auth/confirm-deletion-panel.tsx` | **new** — where the emailed link lands; owns every outcome |
| `src/app/[locale]/(auth)/account-deleted/page.tsx` | **new** — the post-deletion confirmation |
| `src/lib/urls.ts` + `.test.ts` | **+`confirmDeletionUrl(token)`** |
| `src/lib/rate-limit.ts` | **+`deleteAccount`** limiter, 3/1h, own prefix |
| `src/lib/auth/rate-limit-rules.ts` + `.test.ts` | **+`withUser`** flag; `/delete-user` uses it |
| `src/lib/dashboard-paths.ts` | `/confirm-deletion` + `/account-deleted` added to `PUBLIC_AUTH_PATHS` |
| `src/app/[locale]/(app)/settings/page.tsx` | mounts the card; one narrow query for the Pro gate |
| `messages/{hr,en}.json` | `dashboard.settings.account` · `auth.deleteAccountEmail` · `auth.confirmDeletion` · `auth.accountDeleted` |

---

## Why the flow has two hops

Nothing in the app deletes anything. The modal **sends an email**; the emailed link **is the second
factor** — possession of the inbox proves identity even if a session was hijacked.

```
/settings  → type DELETE → "Obriši trajno"
              │
              └─ POST /api/auth/delete-user     (rate-limited, 3/1h per USER)
                   → mints a token, sends the email, deletes NOTHING
                   → modal closes to a toast

email → /{locale}/confirm-deletion?token=…      (our page, public)
              │
              ├─ no session   → "Sign in to continue"  (token NOT spent)
              ├─ no token     → "This link is incomplete"
              └─ signed in    → confirm button
                                 │
                                 └─ GET /api/auth/delete-user/callback?token=…
                                      ① session required
                                      ② token consumed (single-use)
                                      ③ token.value must equal session.user.id
                                      ④ beforeDelete → the cascade
                                      ⑤ user + sessions + accounts deleted
                                      ⑥ session cookie cleared
                                      ⑦ afterDelete → avatar object
                                 │
                                 └─ → /{locale}/account-deleted
```

**Three independent gates at ④**: a valid session, *and* a valid token, *and* the token must belong to
that session's user. A leaked link is useless without the owner's session; a stolen session is useless
without the link. Do not remove any one of them.

### The email must not link at the API route

`GET /api/auth/delete-user/callback` **requires a session**, and every rejection is JSON. Point the
email straight at it and a failure renders `{"message":"Failed to get user info"}` on a blank white
page — which reads to a user as "the delete button is broken".

This happened during development: an attempt logged `POST /delete-user 200` followed by two
`callback 404`s and no `[account-deletion] purging` line. The account was never deleted and the person
had no way to know why.

In dev the cause is compounded — BetterAuth builds its link from `BETTER_AUTH_URL`
(`localhost:3000`) while the session cookie lives on `dashboard.localhost:3000`, and browsers treat
`localhost` as a public suffix, so the two origins share no cookies. **Production loses the host
mismatch but keeps the session requirement**: opening the email on a phone reproduces it exactly.

So `sendDeleteAccountVerification` ignores BetterAuth's `url` and builds its own via
`confirmDeletionUrl(token)`. The page then calls the callback **without `callbackURL`** — with that
param the route answers `302` (opaque to `fetch`); without it, `200 {"success":true}` or a JSON error
code, which is the only shape a client can branch on.

**Recovery works because of ordering**: BetterAuth checks the session *before* consuming the token, so
a session-less click leaves the link valid. "Sign in, then open the link again" is real advice, not a
hope. Verified against the `verifications` table.

---

## The cascade (`account-deletion.service.ts`)

`purgeOrganizationData(userId)` runs inside `beforeDelete`. Order is dictated by foreign keys, not
preference:

| FK | Behaviour | Consequence |
| --- | --- | --- |
| `elections_createdById_fkey` | `RESTRICT` | Elections **must** go before the user — which `beforeDelete` guarantees, since BetterAuth deletes the user after it |
| `users_organizationId_fkey` | `SET NULL` | Deleting the org clears the admin's link automatically inside the transaction |

One `$transaction`, four steps, in this order:

```ts
archive.deleteMany({ electionId: { in: ids } })   // no cascade — anonymity/integrity
vote.deleteMany({ electionId: { in: ids } })      // no cascade — same reason
election.deleteMany({ organizationId })           // cascades voters → tokens, options → junction
organization.delete({ id: organizationId })
```

A half-deleted organization is worse than a failed deletion, which is at least retryable. The test pins
the **array order**, not just the step count — Prisma executes the array as written, not in call order.

`User`, `Account` and `Session` are deleted by BetterAuth after the hook returns.

### R2 objects: DB first, storage second, split across both hooks

R2 cannot join a Postgres transaction, so objects are removed **after** the commit, and each object
outlives its own row by nothing:

| Object | Bucket | Deleted in |
| --- | --- | --- |
| Stored election reports (`Election.reportKey`) | `private` | `beforeDelete`, after commit |
| Organization logo (`Organization.logoUrl`) | `public` | `beforeDelete`, after commit |
| Admin avatar (`User.image`) | `public` | `afterDelete` — the user row is gone by then |

Keys are read **before** the rows are deleted; afterwards there is nowhere to read them from. Every R2
failure is `console.error`-logged and swallowed **only** at that point — erasure has already committed,
so it must not report failure — but it is never silently dropped.

> The **avatar is not in the spec's §3 table.** That table predates the R2 upload feature, which
> explicitly assigned this erasure to this phase. Without it, the admin's photograph outlives the
> account at a permanent unauthenticated URL — an Art. 17 miss.

### Guards

| Guard | Behaviour |
| --- | --- |
| `subscriptionBlocks(user)` — `isPro && stripeSubscriptionId` | Throws `subscriptionActive`. Re-checked here, not just in the UI: time passes between requesting the email and clicking the link. Stripe would keep billing an account that no longer exists. |
| Another admin in the organization | Throws `sharedOrganization`. **Refuses rather than partially deleting** — the spec says "delete only the user", but `elections_createdById` is `RESTRICT`, so that path fails at the database anyway. The correct fix is an ownership-transfer flow that does not exist. Unreachable today: `/setup` creates orgs 1:1, and every org in the database has exactly one admin. |

Both throw `DeleteAccountError`, which `beforeDelete` converts to an `APIError("BAD_REQUEST")` carrying
the code. A throw there aborts the whole BetterAuth flow, so **nothing is deleted**.

### Audit log

Written **before** erasure — afterwards there is nothing left to derive it from:

```
[account-deletion] purging { userId, organizationId, at, elections, voters, votes, archives }
```

Ids and counts only. No names, no emails. A test asserts the payload contains no `@`.

---

## Rate limiting

| | |
| --- | --- |
| Limiter | `deleteAccount` — sliding window, **3 per hour**, own Upstash prefix |
| Endpoint | `POST /api/auth/delete-user` (the send) |
| Key | **the session's user id** (`user:<id>`), falling back to the IP when no session resolves |
| Not limited | `GET /api/auth/delete-user/callback` |

**Why per-user, not per-IP.** The rules map grew a `withUser` flag for routes that already require a
session. IP keying punishes the wrong person: everyone behind one NAT — a university campus, the
demo case — shares a single budget, and a brand-new admin on a brand-new organization inherits an
exhausted window from an unrelated account.

Per-user keying is safe **here for a specific reason**: the email only ever goes to `user.email`, an
address sign-in already required to be verified. The worst an attacker achieves with N accounts is
mailing their own N inboxes, and account creation is itself capped at 3/h per IP. Had this endpoint
mailed an attacker-supplied address, per-user keying would have opened a spam relay. **The key should
follow whoever bears the cost of abuse.**

**Why the callback is unlimited.** The token is 32 chars of `[0-9a-z]`, single-use, and must match the
session's user id — there is nothing to brute-force, and a limit there would break a legitimate second
click on the only step that actually erases. A test pins that absence so nobody "fixes" it.

**Fails open.** Without `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` there is no limit at all,
silently — the app-wide posture. **Those must be set in Vercel**, or production ships unlimited sends.

Client handling: `error.status === 429` → localized toast. Sliding windows are *not* "3 per clock
hour" — the current bucket plus a decaying fraction of the previous one. Four requests passing in an
hour can be correct. Read the bucket counts, not the request log.

---

## UI notes

- The card uses **ordinary card chrome**, not an error-tinted "danger zone" — a red frame at the bottom
  of a settings page warns about the page, when only one action is dangerous. Destruction is signalled
  by the button, the modal and the copy.
- The confirm word is the literal **`DELETE`**, supplied by code and **never translated** (the i18n
  message is `Za potvrdu upišite <word></word>`). A locale-dependent confirmation word would make the
  gate depend on which language the browser happened to load. Matching is `.trim().toUpperCase()`.
- **Phase 6 (data export) has not shipped**, so the modal's "consider a data export first" clause is
  omitted rather than linking to nothing. Add it when phase 6 lands.
- With an active subscription the button is replaced by an inline notice + billing link. That is
  **explanation, not protection** — the gate is server-side.
- `/confirm-deletion` and `/account-deleted` are in `PUBLIC_AUTH_PATHS`: the first must open without a
  session (the phone-inbox case), the second is reached when the session no longer exists.

---

## Verification

`npm run lint` clean · `npm run test` **381 passing** · `npm run build` clean · 0 console errors.

Full destructive E2E on throwaway users and organizations (never the seed), with real R2 objects and
real Resend sends:

- arming gate exact — `DELET` / `OBRIŠI` / `DELETE!` stay disabled; `delete` and `  DeLeTe  ` arm
- **confirm deletes nothing** — every row still present after the toast; only an email is sent
- **server-side Pro gate** — with `isPro` + `stripeSubscriptionId` set, the callback returns
  `400 {"code":"subscriptionActive"}` and the fixture is untouched
- signed-out click on the emailed link → the sign-in panel, **token still valid** in `verifications`
- completion → user, org, elections, voters, tokens, options, votes, archives, sessions, accounts all
  **0**; seed restored to 22 elections / 1660 votes
- all three R2 objects gone (private report, public logo, public avatar)
- reused link → "link no longer valid"; missing token → "link incomplete"
- session dead (protected route → `/login`), re-login `401`
- rate limiting: account A `200 200 200 429`, account B **`200` on the same IP** — keys confirmed as
  `ratelimit:delete-account:user:<id>:<window>`
- `/en` complete; apex `307`s both new routes to the dashboard host, preserving the token

---

## Known limitations

| | |
| --- | --- |
| A Pro account can still trigger the **email** | The block fires at the callback, where `beforeDelete` runs. Nothing is destroyed; the UI hides the button, so reaching it needs a direct API call. |
| A rejection after the token is consumed **burns the link** | `subscriptionActive` / `sharedOrganization` destroy nothing but still spend the token — a fresh email is required, costing another of the 3/hour. The session-less case is the exception (it fails before the consume). |
| `/account-deleted` is unconditional | A public static page: anyone can visit it and be told their account was erased. It asserts something it never verifies. |
| Multi-admin organizations are **refused** | Not partially deleted. Needs an ownership-transfer flow. |
| No grace period / undo | No soft delete, no retention window. `ponytail:` add a 7-day grace only if support load demands it. |

---

## For the next phase

- **Phase 6 (data export)** — restore the "consider a data export first" clause in the modal.
- **Phase 7 (Stripe)** — the Pro gate is already written against `isPro` + `stripeSubscriptionId`;
  it is inert only because nothing writes those columns yet. Nothing to add on this side.
- Deleting a **Stripe customer** is deliberately out of scope — invoices are legal records
  (Art. 17(3)(b)). The subscription must be cancelled first; the customer object stays.
