# Stripe Webhook Testing — Local

**Branch** none · **Version** unchanged (0.9.29) — verification is not a feature
**Spec** `context/features/stripe-local-testing-spec.md`
**Sibling** `stripe-production-testing-spec.md` (same route, deployed app — not yet runnable)
**Authority for behaviour** `stripe-integration-phase-1-spec.md` · `stripe-integration-phase-2-spec.md`

This run is the **inbound** half of billing: Stripe tells us something and we write entitlement.
Phase 2's 2026-08-06 E2E proved the *purchase* path (Checkout → Portal → cancel) as a side effect of
driving the UI. Here the webhook is the subject — signature handling, dispatch, idempotency under
replay, and the exact rows written.

**Result: 8/8 passed, no code defects.** Five findings, all of them corrections to the spec text or
risks worth recording — none produced a `fix/*` branch.

Everything ran in Stripe **test mode** against the Neon **development** branch. `stripe.ts` refuses a
`sk_live_` key outside production, so a live key cannot reach this procedure even by mistake.

---

## Findings index

| # | Finding | Where |
| --- | --- | --- |
| F1 | **T1's card step does not exist.** "complete Checkout with `4242 4242 4242 4242`" never happens — D4's `payment_method_collection: "if_required"` plus a 14-day trial means Stripe requests **no card at all**. The app is correct; the spec sentence is wrong | §4 |
| F2 | **§1 contradicts T1/T2.** §1 forbids changing `BILLING_ENABLED`, but with it off `/settings` renders `prelaunch`, which by design has no Upgrade CTA and no plan states — so T1's entry point and T2's amber assertion are both unreachable | §2 |
| F3 | **`onSubscriptionCreated` never fired.** T1 expects `checkout.session.completed` **and** `customer.subscription.created` to both project; only `complete` did. Net effect correct, but that hook stays **unproven** — do not read T1 as covering it | §4 |
| F4 | **A redelivered stale event resurrects Pro**, and nothing reconciles it. Archives are safe anyway, because the prune sweep re-derives entitlement instead of trusting the stamp | §4 |
| F5 | **Proven beyond the spec:** with a **second admin** on the fixture org, the org-wide `isPro` write and the customer-row-only `stripeSubscriptionId` write became distinguishable. Both behaved — the P2002 an org-wide write of the `@unique` column would cause never fired. T1 as written cannot test this | §5 |
| F6 | **14 webhook POSTs, all 200, three writes.** The count divergence *is* the evidence. A completely inert webhook returns exactly the same 200s | §3 |
| F7 | **`stripe trigger` proves nothing**, for two independent reasons in the plugin. Real Checkout creates the state; the CLI drives it; fixtures cover only signatures | §3 |
| F8 | Environment: the `/tmp` bash-vs-Windows split recurred (4th time), `TaskStop` again left a process holding :3000, and the Stripe CLI's stdout capture is polluted by a plugin hint line that breaks `JSON.parse` | §7 |

---

## 1. What this run was, and what it was not

It was **not** a re-run of the purchase path, and it was **not** a test of money.

It was the webhook: `POST /api/auth/stripe/webhook`, a **virtual path** inside the BetterAuth
catch-all (`src/app/api/auth/[...all]/route.ts`), registered by the plugin mounted in
`src/lib/auth/index.ts`. **There is no route file to read** — which is why a mount control matters
(§3).

Nothing in the codebase changed. No branch, no version bump, no migration.

---

## 2. Preconditions, and the one that contradicts the spec

§1 requires every precondition to be *read*, not remembered — three had been wrong in project history
within two weeks. All eight were green this time:

| # | Precondition | State |
| --- | --- | --- |
| 1–2 | `STRIPE_SECRET_KEY` (`sk_test_`), `STRIPE_WEBHOOK_SECRET` set | ✅ and the secret **matches** `stripe listen --print-secret` — verified by comparison, never by eye |
| 3–4 | `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY`, names matching `billing.ts` | ✅ both present, both `price_`, and they **differ** |
| 5 | `stripeConfigured` ⇒ plugin mounts | ✅ proven by the 404 control in §3 |
| 6 | Stripe CLI | ✅ 1.45.1 |
| 7 | Dev server on **:3000** | ✅ single listener, no 3001 split |
| 8 | Neon **development** branch | ✅ `subscriptions` present; every query passed `branchId` explicitly |

A bonus check: **`.env.development` has no duplicate keys.** The `BILLING_ENABLED` duplication
recorded on 2026-08-10 is gone. Worth re-running whenever that file is touched — dotenv silently
takes the last assignment, the class of bug that also bit `R2_ACCOUNT_ID`.

### F2 — the spec conflict, and how it was resolved

§1: *"`BILLING_ENABLED` is irrelevant to this spec and **must not be changed for it**."*
T1: *"sign in → `/settings` → **upgrade**."* T2: *"`/settings` shows the amber canceling state."*

These cannot both hold. `src/app/[locale]/(app)/settings/page.tsx` selects `prelaunch` whenever the
flag is off, and that state deliberately renders **no Upgrade button and no plan states at all** —
so T1's stated entry point and T2's UI assertion do not exist with the flag off.

**Resolved by the user at `start`: flip it on for the whole run.** `.env.development` was backed up
first and restored byte-identical afterwards (sha256 confirmed). Recorded here as a deliberate
deviation, not an oversight.

The webhook itself is indifferent either way, which is why this is safe: the plugin mounts on
`stripeConfigured`, and `projectEntitlement` writes `users.isPro` unconditionally. The flag only
decides whether anything downstream *reads* it.

> **For the spec:** say which of §1 and T1/T2 wins.

---

## 3. The trap, and the number that catches it

`stripe trigger customer.subscription.updated` returns **200 and writes nothing**, silently — twice
over (F7). The plugin's `resolvePlanItem` finds no configured price on a CLI-invented fixture and
returns; and even with the price forced, the handler looks up a **local `subscriptions` row** that a
fixture subscription does not have. `--override` can fake the price but cannot invent the row.

So the operating rule for the whole procedure:

> **A real Checkout creates the state; the CLI drives it. Fixtures are for signatures only.**

**F6 is the same lesson as a measurement.** Across the run:

```
14 webhook POSTs   → all 200, zero 5xx anywhere
 5 projections     → complete ×1, update ×2, deleted ×2
 1 retention stamp
```

Completing Checkout alone forwarded **eight** events — `customer.created`, `customer.updated`,
`invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_succeeded`,
`customer.subscription.created`, `checkout.session.completed` — every one a 200, and **one** of them
wrote anything. A webhook that did nothing at all would have produced an identical row of 200s.

**Mount control.** Because there is no route file, "is the plugin actually mounted?" needs its own
check. `POST /api/auth/stripe/nonsense` → **404**, while the real path answers 400. The catch-all is
live and only genuine plugin paths resolve.

---

## 4. The matrix

Fixture per §4: a throwaway organization and admin — **never the seeded demo org**, whose `isPro` has
been hand-flipped and restored several times in this project's history. Its value was recorded
(`false`) *before* starting and re-checked at the end.

The fixture also carried **two archives with `expiresAt = null`**, because `stampArchiveRetention`
stamps *only where null* — without them T3's stamping assertion would have been vacuously true. One
was dated **2023-03-01** so its one-year interval crosses **29 February 2024**.

### T1 · Checkout completes → entitlement granted ✅

| assertion | result |
| --- | --- |
| `subscriptions.referenceId` is the **organization** id, not a user id | ✅ — phase 1 D1 holds |
| `status` | `trialing` |
| `users.isPro` | true |
| `periodEnd` | `2026-09-04` (14-day trial) |
| log | `[billing] entitlement projected { hook: 'complete', status: 'trialing', isPro: true }` |

The `referenceId` check is the one that matters most: if it were a user id, every later assertion in
the spec would be meaningless.

**F1 — no card is ever requested.** Checkout rendered *"14 dana besplatno … Započni probno
razdoblje"* with **zero input fields**, because `getCheckoutSessionParams` sets
`payment_method_collection: "if_required"` alongside `missing_payment_method: "cancel"` (D4). The
spec's `4242 4242 4242 4242` step is not reachable and never was. This also means the 2026-08-06
note that "the second payment was not completed because Stripe's card fields are iframed" describes
a problem this configuration does not have.

**F3 — only one hook fired.** `customer.subscription.created` *was* forwarded and *did* return 200,
but produced no projection: the plugin's `onSubscriptionCreated` path is for subscriptions opened
outside Checkout (e.g. from the Stripe dashboard). The net effect is correct — the spec's own design
note says "the point of the hooks all calling one projection" — but **that hook remains
unexercised**, and T1 should not be read as covering it.

### T2 · Cancel at period end → Pro is retained ✅

Driven with `stripe subscriptions update <sub_id> -d "cancel_at_period_end=true"`.

| assertion | result |
| --- | --- |
| `cancelAtPeriodEnd` | true |
| `cancelAt` | set (`2026-09-04`) — **both fields read**, per the defect found 2026-08-06 |
| `users.isPro` | **still true** on both admins |
| `/settings` | amber `#B45309` on `#FFFBEB` (design-system `warning-700`/`warning-50`), chip *"Otkazuje se 4. rujna 2026."*, and **Switch + Cancel both hidden** — only *Upravljanje naplatom* remains |

This is the row most likely to regress into "cancel revokes immediately", which would take a paid
period away from a paying customer. It did not.

One nuance: cancelling **via the CLI with an explicit flag** sets `cancelAtPeriodEnd` *and*
`cancelAt`. The 2026-08-06 defect was that cancelling a **trialing** subscription *through the
Portal* sets `cancel_at` and **not** `cancel_at_period_end`. Different path — the code reads both, so
either shape is handled, but the Portal-specific shape was not re-exercised here.

### T3 · Subscription deleted → entitlement drops, archives stamped ✅

| assertion | result |
| --- | --- |
| `isPro` | false — on **both** admins (org-wide) |
| `stripeSubscriptionId` | null (`stripeCustomerId` retained — the plugin owns that column) |
| archive **row count** | **unchanged**: 2 fixture, 5 total = 3 demo + 2 |
| normal archive | `2026-08-21` → `2027-08-21` |
| **leap-crossing archive** | `2023-03-01` → **`2024-03-01`** |
| log | `[billing] archive retention stamped { archives: 2 }` |

The leap-crossing row is the point. That interval is **366 days**, so a
`365 * 24 * 60 * 60 * 1000` implementation lands on **29 February 2024** and this run would have
caught it. `archiveExpiresAt` adds a calendar year; asserted in SQL as
`expiresAt = createdAt + interval '1 year'`, true for both rows.

**No archive row disappeared**, which is the spec's explicit fail condition —
`stampArchiveRetention` deletes nothing, because there is no archive clawback.

### T4 · Replay → no second effect ✅

`stripe events resend <evt_id>` on the T3 `customer.subscription.deleted`. It reached the local
listener directly; the dashboard-endpoint fallback the spec allows was not needed.

| assertion | result |
| --- | --- |
| second delivery | 200 |
| `users.isPro` | unchanged |
| **`archives.expiresAt`** | **identical** — and `expiresAt = createdAt + interval '2 years'` is **false** on both rows |
| row counts | identical |
| log counters | `projected` 3 → 4, but **`stamped` stayed at 1** |

That last line is the cleanest evidence in the run. The hook re-ran (as an absolute-state write
should), while `stampArchiveRetention` found zero null-expiry rows and returned before logging. The
spec calls `expiresAt` its sharpest assertion for good reason: a non-idempotent stamp would push a
retention date a year further out on every Stripe retry, and **nothing else in the system would
notice**.

### T5 · Out-of-order delivery — documented ✅

Resent the **older** `customer.subscription.updated` (body `status: trialing`) *after* `deleted` had
landed.

Observed: 200, no crash, no 5xx. The projection re-derived from the event's own body —
`isPro` back to **true** on both admins, `stripeSubscriptionId` restored, and the local
`subscriptions.status` reverted to `trialing` (the plugin's own write). Archives untouched, because
stamping only runs on the `deleted` hook.

That satisfies the spec's bar — *"what must not happen is a crash, a 500, or a write that
contradicts the event body"* — and is the honest cost of absolute-state projection: a stale event
legitimately carries stale truth.

**F4, stated plainly for whoever reads this next: a redelivered stale event can resurrect Pro, and
nothing reconciles it afterwards.** There is no reconciliation job; entitlement stays wrong until
another event arrives.

The resulting mixed state — `isPro true` while archives still carry `expiresAt` stamps — is **not**
dangerous, and not by luck. `pruneExpiredArchives` treats `expiresAt <= now` as *candidate
selection only* and re-derives entitlement at prune time (the 2026-08-07 decision: "a destructive
operation verifies entitlement when it destroys, never from a stamp written months earlier"). That
decision was made about upgrade/downgrade races; it covers webhook reordering for free.

If this risk is ever judged worth closing, the two known mitigations are a stored watermark on the
event's `created` timestamp, or re-fetching subscription state from Stripe inside the hook rather
than trusting the event body. Neither is currently justified.

### T6 · Forged signature → 400, nothing written ✅

`curl` with `stripe-signature: t=1,v1=deadbeef`.

- **400** `FAILED_TO_CONSTRUCT_STRIPE_EVENT`
- dev log: `[Better Auth]: No signatures found matching the expected signature for payload…`
- **zero** billing writes, SQL-confirmed

### T7 · Missing signature header → 400 ✅

Same call without the header.

- **400** `STRIPE_SIGNATURE_NOT_FOUND` — a **different code** from T6, which is what the spec asks be
  asserted rather than "it failed"
- no accompanying log error (the request is rejected before construction is attempted)
- **zero** billing writes

> Both were re-run against a dev server whose stdout was captured, specifically so the *log* half of
> the assertion could be checked and not just the response body.

**Why a 400 is ambiguous and you must read the log.** Per §2, a handler throwing — including a
database failure inside `projectEntitlement` — also surfaces as **400**, because Stripe reads 400 as
"retry me". So a 400 alone does not distinguish "bad signature" from "our write threw".

### T8 · Cross-org `referenceId` → 401 ✅

Signed in as the fixture admin, `POST /api/auth/subscription/upgrade` with **another organization's**
id:

| input | result |
| --- | --- |
| the demo org's id | **401** `UNAUTHORIZED` |
| a garbage string | **401** `UNAUTHORIZED` |
| demo admin afterwards | untouched — `isPro false`, no Stripe ids |
| subscriptions for demo org | 0 |

This is `authorizeReference` in `src/lib/auth/index.ts`. Without it, any signed-in admin could manage
any organization's subscription, because phase 1 D1 made `referenceId` a client-supplied value.

---

## 5. What the run proved that the spec cannot

**F5.** T1 asks that `stripeSubscriptionId` be set on *"the customer row only"* — an assertion that is
**untestable with a single admin**, since one row is trivially "only". So a **second admin** was added
to the fixture organization before T2.

That makes the two writes in `projectEntitlement` distinguishable, and both behaved:

| | admin 1 (the Stripe customer) | admin 2 |
| --- | --- | --- |
| after T2 (`trialing`) | `isPro` true, `stripeSubscriptionId` set | `isPro` **true**, `stripeSubscriptionId` **null** |
| after T3 (`canceled`) | `isPro` false, `stripeSubscriptionId` null | `isPro` **false**, `stripeSubscriptionId` null |

`isPro` moves org-wide because entitlement is organizational; `stripeSubscriptionId` does **not**,
because that column is `@unique` and an org-wide write of the same id would hit **P2002** — which
would have surfaced as a 400 on the webhook and a lost entitlement write. It didn't. The reasoning in
`billing.service.ts` is now backed by an observation rather than only by argument.

**Add a second admin to the fixture when re-running this.** It costs one insert and converts a
vacuous assertion into a real one.

---

## 6. What is still not proven

| Item | Why |
| --- | --- |
| **`onSubscriptionCreated`** (F3) | Never fires on a Checkout purchase; needs a subscription created from the Stripe dashboard |
| **`past_due` reaching the app** | `invoice.payment_failed` is **not handled**, so `past_due` can only arrive as a `customer.subscription.updated`. Reaching it needs a **test clock**, which must be attached at customer creation — something the app's own Checkout cannot do. Stays covered by `isProStatus` unit tests |
| **Portal-shaped cancel** | T2 was driven by CLI. The 2026-08-06 defect (a *trialing* subscription cancelled *via the Portal* sets `cancel_at` and not `cancel_at_period_end`) was not re-exercised; the code reads both fields |
| **Portal plan switching** | Stripe Customer Portal has plan switching `enabled: false`. **A human must enable it in test mode, and again in live mode** — separate configurations. Tracked in `production-readiness-spec.md` §11 |
| **The deployed route** | This spec is local only. A failure here is a code defect; a failure in production is a config defect, and you cannot tell them apart if local was never green — which is why this one runs first. `stripe-production-testing-spec.md` is the sibling |
| **Entitlement enforcement** | Out of scope by §7 — `resolveEntitlement` short-circuits while `BILLING_ENABLED` is off |
| **The `purchased` variant** | No producer exists anywhere in the codebase |
| **Live mode / real money** | No legal entity; `stripe.ts` refuses `sk_live_` outside production |

---

## 7. Environment traps hit (F8)

Three recurred and one is new. None are application code.

- **`/tmp` differs between bash and Windows binaries** — `curl -o /tmp/x` wrote to `C:\tmp` where
  bash's `cat` could not find it. Fourth occurrence in this project. **Use repo-relative temp paths.**
- **`TaskStop` on `npm run dev` leaves a process holding :3000.** Kill by PID via
  `Get-NetTCPConnection -LocalPort 3000`. A second `npm run dev` otherwise moves silently to 3001,
  and BetterAuth origins are pinned to :3000, so auth breaks in a way that looks like an auth bug.
- **A dev-server restart is required after any `.env` change** — Next reads env at boot.
- **New: the Stripe CLI's stdout, when captured, is prefixed by a plugin hint line**
  (`<claude-code-hint …/>`), which breaks a naive `JSON.parse` and silently corrupts
  `$(command)` substitution. Write to a file and slice from the first `{`.

---

## 8. Re-running this

```bash
# terminal 1
npm run dev                                                    # must land on :3000

# terminal 2
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

The secret `stripe listen` prints **must equal** `STRIPE_WEBHOOK_SECRET`, or every event 400s with
`FAILED_TO_CONSTRUCT_STRIPE_EVENT` — which looks exactly like a code bug and is not one. Compare it
without printing it:

```bash
stripe listen --print-secret > .tmp && node -e '…compare…' && rm .tmp
```

Then: create a throwaway org + admin (**plus a second admin**, §5) and at least one archive with
`expiresAt = null`, one of them dated to cross a 29 February. Drive T1 through the real UI, T2–T5
with the CLI, T6–T7 with `curl`, T8 with a `fetch` from a signed-in page.

**Assert with SQL against `branchId` explicitly** — `production` is the default Neon branch, so an
unqualified query hits it.

### Cleanup is mandatory (§6)

Delete the fixture org, its admins, elections, archives and `subscriptions` rows; confirm the demo
admin's `isPro` matches what you recorded *before* starting; restore `.env.development`
byte-identical.

This run finished SQL-proven back to baseline — **1 org · 1 user · 0 `isPro` · 0 Stripe ids · 0
subscriptions · 19 elections · 3993 voters · 2087 votes · 3 archives · 3 tokens · 0 fixture
leftovers** — with `git status` unchanged and the env file's sha256 matching its pre-run backup.

Per §6.4 the Stripe **test-mode** customer was deliberately left in place rather than deleted, since
test data is free and deleting it destroys the evidence trail: **`cus_V7A9FboZmFHBc2`**, subscription
`sub_1U6vpERTBzPUhNiwe0q2DAuF` (status `canceled`).

---

## 9. If a finding ever becomes a fix

Per finding, not per run: `/fix start` → `fix/<kebab-name>` → implement →
`npm run lint && npx tsc --noEmit && npm run test && npm run build` → patch bump →
pathspec-limited commit → `merge --no-ff` → dev doc in `docs/<date>/`.

**A green `npm run test` is not evidence the build compiles** — Vitest strips types without checking
them. `npx tsc --noEmit` is the cheap check, and unlike `npm run build` it does not clobber the
`.next` directory a running dev server is serving from.

None of F1–F8 needs a branch. F1–F3 are corrections to the spec text; F4 is a risk to record; F5 is
an improvement to the procedure; F6–F8 are notes for the next person who runs it.
