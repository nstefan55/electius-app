# Stripe Webhook Testing — Deployed

**Branch** none · **Version** unchanged — verification is not a feature
**Prerequisite** the §1 mode-guard fix, shipped separately as **v0.9.30** (`stripe-mode-guard-vercel-env.md`)
**Spec** `context/features/stripe-production-testing-spec.md`
**Sibling** `stripe-local-testing.md` — run first, 8/8, and a hard precondition
**Authority for behaviour** `stripe-integration-phase-1-spec.md` · `stripe-integration-phase-2-spec.md`

This is the **deployed** half of the webhook: the route reached over the public internet, signed by a
real Stripe **dashboard** endpoint, writing to a real Postgres branch. Stripe stayed in test mode —
there is no legal entity, so no live key exists and no money moved.

**Result: 7 clean passes, 1 partial, 1 deferred. No code defects found.** Everything that failed to
be proven failed for an environmental reason, not a behavioural one.

---

## Findings index

| # | Finding | Where |
| --- | --- | --- |
| PF1 | **The spec's central premise was false.** §2 chose Preview over Production because "the production Neon branch has no migrations applied". It has all 13, verified physically. The run moved to Production | §1 |
| PF2 | **F4 from the local run reproduces on the deployed app.** A redelivered *stale* event restores Pro to an account whose subscription is gone, and nothing reconciles it | §3, P5 |
| PF3 | **A trialing subscription sets `cancel_at`, not `cancel_at_period_end`** — reproduced deployed. This is the asymmetry behind the 2026-08-06 defect | §3, P2 |
| PF4 | **Only two of the spec's three evidence sources were obtainable.** Vercel runtime logs could not be queried — full-text search times out and `group_by` returns results inconsistent with the ungrouped listing | §2 |
| PF5 | **The cron pinger is live on production** — `POST /api/cron/activate-elections` 8× in 40 minutes, returning 200. Several project notes still list this as outstanding | §5 |
| PF6 | **P3's archive half was vacuous**, because the production branch had been wiped and holds 0 archives | §3, P3 |
| PF7 | **F2 still blocks the UI entry point.** With `BILLING_ENABLED=false` the `/settings` card renders `prelaunch` — no Upgrade CTA. Resolved by calling the endpoint directly rather than by flipping the flag, which would have armed the mode guard and 500'd the site | §2 |
| PF8 | **Production's posture now deliberately diverges from the spec.** It holds Stripe test keys and the plugin is mounted; §2/§6.4 assume all five keys empty | §5 |

---

## 1. Where this ran, and why it moved (PF1)

The spec calls for a **Preview** deployment against the Neon development branch. It ran on
**Production** against the production branch instead. Two things forced the change:

**The premise for Preview was stale.** §2's first and strongest argument was that production had no
migrations, so `subscriptions` would not exist there. Checked before anything else:

```
$ NODE_ENV=production npx prisma migrate status
13 migrations found in prisma/migrations
Database schema is up to date!

$ NODE_ENV=production npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
No difference detected.
```

The second command is the load-bearing one — `migrate status` only reads `_prisma_migrations`, while
`migrate diff` compares the **physical** schema. Gate 8 was already done.

**A preview alias cannot serve the admin UI anyway.** `src/proxy.ts:12-13` decides the admin host
with `host.startsWith("dashboard.")`. A bare `*.vercel.app` alias fails that test, so the proxy
treats it as the apex and 307s every admin path to `NEXT_PUBLIC_APP_URL`. P1 and P2 need the
dashboard UI. The webhook itself is indifferent — it lives under `/api`, which the proxy skips — so
the spec, written around the webhook, never had to think about it.

Before the run, the production branch was **wiped** under one-off user authorization: it held the
June demo seed (1 org, 1 admin, 8 elections, 3837 voters, 2554 votes, 2 archives), not customer data.
`TRUNCATE ... RESTART IDENTITY CASCADE` over the thirteen business tables, deliberately excluding
`_prisma_migrations`. The standing `CLAUDE.md` guardrail was restored immediately afterwards, so all
SQL in this run was executed by the user and pasted back.

---

## 2. Evidence, and the source that was missing (PF4, PF7)

The spec requires three sources to **agree**: Stripe's delivery log, Vercel runtime logs, and SQL.
Only two were available.

**Vercel runtime logs could not be retrieved.** Page-view lines come back fine, but every full-text
query (`billing`, `stripe`) timed out server-side, and `group_by: requestPath` returned a set
*inconsistent* with the ungrouped listing — omitting `/hr/*` pages the ungrouped view clearly showed.
Absence in a source that contradicts itself is not evidence of absence, so the `[billing] entitlement
projected` lines are **not claimed**. This does not weaken the results: `status trialing` + `isPro
true` + `stripeSubscriptionId` set can only be written by `projectEntitlement`, whose sole caller is
the webhook. The database *is* the proof the events landed.

**The UI entry point does not exist under the flag (PF7).** `BILLING_ENABLED=false` makes `/settings`
render the `prelaunch` state, which by design has no Upgrade CTA — the local run's F2. Flipping the
flag was not an option here: it arms the mode guard against the test key, and the throw is at module
evaluation, so it would have 500'd every signed-in page.

Resolved by treating the UI as what it is — a trigger — and calling the endpoint directly from the
browser console on the dashboard host:

```js
await fetch("/api/auth/subscription/upgrade", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    plan: "pro",
    referenceId: "<organizationId>",
    successUrl: "/hr/settings?checkout=success",
    cancelUrl: "/hr/upgrade",
  }),
}).then((r) => r.json());
```

Cookies and `Origin` ride along automatically, which matters — the plugin origin-checks both URLs and
a bare `curl` gets 403.

---

## 3. The matrix

### P1 · Checkout → entitlement granted ✅

An intermediate snapshot was taken **before** completing Checkout, and it is worth knowing: the
plugin writes a local row at session creation with `status incomplete`, a **null `periodEnd`**, and
the Stripe customer already created — while `isPro` is still false. That is the exact shape behind
the 2026-08-06 ordering defect: Postgres sorts NULLs *first* in `DESC`, so an abandoned checkout's
row won `findFirst` and a paying user silently lost their renewal date. The fix was `nulls: "last"`.

After completing (**no card requested** — `payment_method_collection: "if_required"` plus the 14-day
trial, confirming local finding F1):

| assertion | result |
| --- | --- |
| `referenceId` = **organisation** id, not user id | t / f ✅ |
| `status` | `trialing` ✅ |
| `stripeSubscriptionId` written | ✅ |
| trial window | `2026-08-21 20:38:28` → `2026-09-04 20:38:28` = **exactly 14 days** ✅ |
| `users.isPro` | **true** ✅ |
| subscription rows | **1** ✅ |

**This closes the §0 axis a local run can never reach.** Stripe signs the **raw** body; a junk
signature fails identically whether the body arrived intact or was re-serialised by some layer in
between. Only a *valid* signature discriminates. It verified — the body survived Vercel unmodified.

Not proven: the org has **one admin**, so the org-wide `isPro` write and the customer-row-only
`stripeSubscriptionId` write are indistinguishable here. The local run covered that with a second
admin (F5).

### P2 · Cancel at period end → Pro retained ✅

Driven through the **Billing Portal** (`POST /api/auth/subscription/cancel` returns the portal URL).

`cancelAt` = `2026-09-04 20:38:28` **set**, `cancelAtPeriodEnd` **false**, `status` still `trialing`,
1 row — and **`isPro` still true**, which is the assertion that decides the test. A scheduled
cancellation must not revoke entitlement two weeks early.

**PF3:** the boolean staying false while `cancelAt` carries the date is the trialing asymmetry that
produced the 2026-08-06 defect — a UI reading only the boolean told a just-cancelled user they would
be charged on 4 September. The shipped code reads both fields; this run confirms the condition still
occurs on the deployed app, so that code is still load-bearing.

`/settings`' amber state was **not verifiable** (PF7).

### P3 · Deleted → entitlement drops ◐

`isPro` **false**, `stripeSubscriptionId` **null**, `stripeCustomerId` **kept** — the intended split,
so a returning subscriber reuses the same Stripe customer rather than creating a second one. Status
`canceled`, `cancelAt` self-cleared, still **1 row**: the hook *updated* the row rather than deleting
it, which matters for P5.

**PF6 — the archive half was vacuous.** P3 also asserts that every archive with a null `expiresAt` is
stamped `createdAt` + one calendar year while the row count stays unchanged. The wipe left **0
archives**, so there was nothing to act on. That half remains covered by the local run (2 archives,
including the leap-crossing `2023-03-01 → 2024-03-01`) and by mutation-checked unit tests, **not by
this run**.

### P4 · Replay → no second effect ✅

The delivered `customer.subscription.deleted` resent from the dashboard — the real retry path, better
evidence than the CLI. **Nothing changed.** Replay is a no-op because the projection sets absolute
state from the event body rather than incrementing anything. The spec's sharpest P4 assertion
(`archives.expiresAt` must not move) was vacuous at 0 archives.

### P5 · Out-of-order → documented ✅ (PF2)

Resending the **older** `customer.subscription.updated` — body still `trialing` with `cancel_at` set
— *after* `deleted` had landed restored `status trialing`, `cancelAt`, **`isPro` → true**, and
`stripeSubscriptionId`. On an account whose subscription no longer exists.

This satisfies the spec (no crash, no 500, the write agrees with the event body) and is the
documented cost of absolute-state projection — but **nothing reconciles it afterwards**.

The property that makes P4 safe is the property that makes P5 possible: the handler has no notion of
"this event is older than what I already applied", so a late redelivery of a stale body is
indistinguishable from a fresh one. Idempotency and ordering-safety are different guarantees. A fix
means persisting the event's `created` and refusing to move backwards — a real change, not a tweak.

Archives are safe regardless, because `pruneExpiredArchives` re-derives entitlement at prune time
instead of trusting the stamp.

### P6 · Forged signature → 400, nothing written ✅

`400 FAILED_TO_CONSTRUCT_STRIPE_EVENT`.

**The payload was chosen to make "no write" falsifiable.** The body was
`customer.subscription.deleted` while live state was `isPro true / has_sub_id true`, so a processed
forgery would have flipped both to false and been plainly visible. A body that could not have changed
anything would have proven nothing. SQL after: unchanged.

### P7 · Missing signature header → 400, nothing written ✅

`400 STRIPE_SIGNATURE_NOT_FOUND` — a **distinct** code from P6, which is what §P7 asks you to assert
rather than merely observing "it failed". Same falsifiable payload; SQL after: unchanged.

### P8 · Cross-org `referenceId` → 401 ✅

**401 `UNAUTHORIZED`** for a foreign `referenceId` against the deployed
`/api/auth/subscription/upgrade`. `authorizeReference` requires it to equal the session's own
`organizationId` — the guard that makes phase 1's decision to put an org id in a client-supplied
field safe rather than a hole.

### P9 · Handler failure → retries → writes once ⏸ deferred

Deliberately deferred. Two reasons: forcing the failure means breaking something real (the spec's
"unreachable database" is an outage of the live domain), and it does not complete in one sitting —
Stripe's retries are spaced over hours with backoff. The gentler variant the spec offers
(`ALTER TABLE subscriptions RENAME TO …`, containing the blast radius to billing writes and the
`/settings` card) was offered and also deferred.

What *we* control — a handler throw surfacing as a retryable 400 rather than a swallowed 200 — is
evidenced by P6/P7. The retry cadence is Stripe's behaviour, not ours. **Re-run before charging real
cards.**

---

## 4. What a deployed run proved that local could not

| Axis | Evidence |
| --- | --- |
| The route is reachable at all — public URL, TLS, no platform auth wall | The junk-signature probe returned a JSON error body, not an HTML SSO page |
| Env vars actually present on Vercel | A missing webhook secret would 500 `STRIPE_WEBHOOK_SECRET_NOT_FOUND`; a missing secret key would leave the route **404** |
| **Body reaches the handler unmodified** | **P1** — a valid signature verified. Nothing else can show this |
| Dashboard-endpoint signatures (a different secret from the CLI's) | Every delivered event verified |
| Real retry path | P4 used the dashboard's own **Resend** |

**The single cheapest check, and the one to run first after any redeploy:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://dashboard.electius.com/api/auth/stripe/webhook \
  -H "stripe-signature: t=1,v1=junk" -H "content-type: application/json" \
  -d '{"id":"evt_probe","type":"ping"}'
```

**404 → 400 is the mount proof.** 404 means `stripeConfigured` is false and one of the two keys did
not take. Confirm `/hr/login` still returns 200 in the same pass — that is the mode guard *not*
firing.

---

## 5. State left behind — read before launch

| # | Item | State |
| --- | --- | --- |
| 1 | **`users.isPro` is `true` on an account with no live subscription** | The P5 residue. Do not carry this into launch |
| 2 | Fixture admin + organisation on the **production** branch | The user is cleaning the database before launch |
| 3 | Stripe test-mode endpoint on `dashboard.electius.com` | Kept. The spec's reason for deleting it (a preview alias that later vanishes, producing a permanent stream of failed deliveries) does not apply to a stable production domain. **Live mode needs its own endpoint and its own secret — they are per-mode** |
| 4 | **Production holds Stripe test keys and the plugin is mounted (PF8)** | Deliberate, and a divergence from §2/§6.4, which assume all five empty. Safe only because `BILLING_ENABLED` is not `"true"` — see the mode-guard doc's F5 |
| 5 | Deployment Protection | Never disabled; production is public. Not applicable |
| 6 | **The cron pinger is live (PF5)** | `POST /api/cron/activate-elections` 8× in 40 minutes, 200 — so a pinger exists and `CRON_SECRET` matches. Harmless today (the wiped branch has no elections), but the sweep is running against production every few minutes |

---

## 6. Still not covered

| Item | Why |
| --- | --- |
| Live mode, real money | No legal entity. A separate document at cutover |
| P9, retry behaviour | Deferred, §3 |
| P3's archive stamping | 0 archives after the wipe; covered locally only |
| The org-wide vs customer-row write split | One admin on the fixture org; covered locally by F5 |
| `onSubscriptionCreated` | Local F3 found a Checkout purchase never fires it; not re-tested here, so it stays **unproven** |
| `past_due` | Needs a test clock attached at customer creation, which Checkout cannot do. Unit-tested via `isProStatus` |
| Portal plan switching | `enabled: false` in Stripe. Needs a human, **in test mode and again in live mode** |
| The webhook's rate-limit exclusion | Standing note only |
| Production **environment** env parity | `production-readiness-spec.md` §11 |
