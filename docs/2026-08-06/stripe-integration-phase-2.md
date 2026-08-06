# Stripe Integration — Phase 2: Mounting the Plugin, the Projection & the CTAs

**Branch:** `feature/stripe-phase-2` · **Version:** 0.9.14 → **0.9.15** (patch — the 0.9.x lock holds)
**Spec:** `context/features/stripe-integration-phase-2-spec.md`
**Depends on:** phase 1 (`stripe.ts`, `entitlements.ts`, `billing.ts`, the `Subscription` migration) and
settings phase 7 (the Plan & billing card, shipped v0.9.13 with stubbed CTAs)

Phase 1 built the offline half. This phase mounts `@better-auth/stripe`, writes the **single writer of
entitlement**, and replaces the four stubbed CTA bodies. **No migration, no new route file, no proxy
change, no server action.**

---

## Read this first — the findings that matter

1. **Mounting the plugin naively would have taken production down.** `stripe.ts` threw at module
   scope; `auth/index.ts` is imported by nearly the whole app via `requireSession()`; production has
   empty Stripe values and *cannot* fill them until there is a legal entity. Fixed structurally —
   see [§1](#1-the-conditional-mount).
2. **`users.stripeSubscriptionId` is `@unique`.** The spec's "write both columns to every user in the
   org" is a P2002 the day a second admin exists. Split — see [§2](#2-the-projection).
3. **Three defects were found only by running real Stripe**, not by any test — see
   [§6](#6-defects-found-during-the-e2e).
4. **One Stripe Dashboard setting is still wrong** and the app cannot detect it —
   see [§7](#7-what-still-needs-a-human).

---

## 1. The conditional mount

`src/lib/stripe.ts` changed shape. It used to build the SDK at module scope and throw there:

```ts
const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY nije postavljen");   // module scope
export const stripe = new Stripe(key);
```

Phase 1 got away with that because **nothing imported the file**. Phase 2 mounts the plugin in
`src/lib/auth/index.ts`, which `require-session.ts` imports, which every `(app)` page imports. A
top-level throw would therefore 500 **every signed-in page** in an environment without Stripe keys —
and `.env.production` has `STRIPE_SECRET_KEY=""` today, by design.

Now:

```ts
export function stripeClient(): Stripe    // memoised; guards run on FIRST CALL
export const stripeConfigured: boolean    // secret AND webhook secret both present
```

The guards are unchanged and still fail loudly — just at first use rather than at import. In phase 1
those were the same moment; they diverge now, and this is the safe direction.

The plugin is then spread in conditionally, and `nextCookies()` stays last:

```ts
plugins: [
  oAuthProxy({ … }),
  emailOTP({ … }),
  ...(stripeConfigured ? [billingPlugin()] : []),
  nextCookies(),          // ⚠ must remain last
]
```

**`stripeConfigured` requires the webhook secret too.** A missing `STRIPE_WEBHOOK_SECRET` does not
stop the plugin mounting — it silently rejects every incoming signature, i.e. a webhook that fails
100 % of the time with a convincing 400. Better not to mount at all.

**`plans` is passed as a function**, not an array:

```ts
plans: () => [proPlan()],
```

`requiredPriceId()` throws on an empty price id. As a function that breaks a *checkout attempt*; as
an array it would break *module load*.

Verified both directions with a throwaway script:

| Environment | `stripeConfigured` | Routes | Stripe routes |
| --- | --- | --- | --- |
| no Stripe keys (production shape) | `false` | 40 | **0**, no throw |
| keys present | `true` | 47 | **7**, incl. `/stripe/webhook` |

---

## 2. The projection

`src/lib/services/billing.service.ts` — **the only place `users.isPro` is written.**

```ts
projectEntitlement(hook, referenceId, sub)   // called by all five lifecycle hooks
stampArchiveRetention(referenceId)           // onSubscriptionDeleted only
```

`Subscription` is Stripe's truth; `users.isPro` is the projection everything else already reads.
Because of that, `requireSession()`, the GDPR delete gate and every future gate needed **zero
changes** — a billing bug cannot reach them.

### The `@unique` split (deviation from spec §3)

The spec says write `isPro` **and** `stripeSubscriptionId` to every user in the org. But:

```prisma
stripeSubscriptionId String? @unique
```

An org-wide write of the same id hits **P2002 the day a second admin exists** — the same
invisible-until-then failure the spec was trying to avoid, just relocated. So:

| Column | Scope | Why |
| --- | --- | --- |
| `isPro` | `where: { organizationId: referenceId }` — **whole org** | entitlement is organizational |
| `stripeSubscriptionId` | `+ stripeCustomerId: <customer>` — **customer row only** | column is `@unique`; customer identity belongs to one row |

No hole is opened: a second admin is already refused deletion by `purgeOrganizationData`'s
`sharedOrganization` guard, which fires before `subscriptionBlocks` is consulted.

Both writes land in **one `$transaction`**. `isPro = true` with a null subscription id makes
`subscriptionBlocks()` return false — i.e. an account with a live subscription becomes deletable.
They must not be able to land apart.

### Idempotency

Every write is an absolute state-set derived from the event's own `status` — no increments, no
read-modify-write. A replayed webhook is a no-op. Proven live (§5, step 10).

### The archive stamp

`stampArchiveRetention` stamps `expiresAt` **only where it is currently `null`**, using phase 1's
`archiveExpiresAt` (calendar year, never `365 * 86_400_000`).

> **Nothing is ever deleted here.** There is no archive clawback — that rule was removed 2026-08-03.
> `expiresAt` means *prune this row's payload later*; the sweep that acts on it is an `UPDATE` and
> belongs to `entitlement-enforcement-spec.md`. The unit test asserts `delete`/`deleteMany` are never
> called, and the E2E asserts the archive row count is unchanged.

---

## 3. The guards

**`authorizeReference`** — phase 1 D1 put an `organizationId` in `referenceId`, which is
client-supplied. Without this guard any signed-in admin could name any organization's id:

```ts
authorizeReference: async ({ user, referenceId }) => {
  const row = await prisma.user.findUnique({
    where: { id: user.id }, select: { organizationId: true },
  });
  return row?.organizationId === referenceId;
}
```

Deliberately a plain equality, not a role check — this codebase is 1 organization ↔ 1 admin and no
role model exists. When seats ship, the role check lands here and only here.

**`getCheckoutSessionParams`** — where phase 1 D4 lives:

```ts
subscription_data: { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } },
payment_method_collection: "if_required",
```

`trial_period_days` is **not** set here; the plugin derives it from `proPlan().freeTrial.days`.
Setting both silently changes the trial length.

**Rate limits (D4)** — `/subscription/upgrade`, `/subscription/billing-portal` and
`/subscription/cancel`, all `withUser: true`, 10 per 15 min. Cancel is included because it opens a
Stripe portal session exactly like billing-portal does.

> ⛔ **`/stripe/webhook` is NOT in `RATE_LIMIT_RULES` and must never be added.** The map is an
> allowlist (`if (!rule) return`), so the webhook is unlimited by default. **A 429 to Stripe is a lost
> entitlement write.**

---

## 4. Client wiring

`src/lib/auth/client.ts` gains `stripeClient({ subscription: true })` — this is what creates
`authClient.subscription.*` at all. Registered **unconditionally**: the client plugin reads no key, it
only adds calls to routes the server may or may not mount.

`billing-card.tsx` — four function bodies replaced, **no JSX and no copy touched**:

| CTA | Call |
| --- | --- |
| Upgrade to Pro | `subscription.upgrade({ plan, annual: cycle === "yearly", referenceId, successUrl, cancelUrl, locale })` |
| Switch to yearly | same **+ `subscriptionId`** |
| Manage billing | `subscription.billingPortal({ referenceId, returnUrl, locale })` |
| Cancel (modal confirm) | `subscription.cancel({ referenceId, subscriptionId, returnUrl })` |

Three rules baked in:

- **The client sends a plan name and a boolean, never a price.** The price id is resolved server-side
  from `proPlan()`, so a tampered request cannot invent a €0 subscription.
- **`subscriptionId` is the *Stripe* id (`sub_…`), not our row id.** Verified in the plugin source: it
  looks up `field: "stripeSubscriptionId"`. Omitting it on an already-subscribed user creates a
  **second subscription and bills twice**.
- **`successUrl` carries `?checkout=success`** so phase 7's processing banner renders. The redirect
  never flips entitlement — `isPro` changes only via a verified webhook.

`returnUrl` / `successUrl` are **origin-checked by the plugin**. A request without an `Origin` header
gets `403 MISSING_OR_NULL_ORIGIN` (hit this while testing with curl — it is a real control, not a bug).

### The server read

```ts
prisma.subscription.findFirst({
  where: { referenceId: session.organizationId },
  orderBy: { periodEnd: { sort: "desc", nulls: "last" } },
})
```

`findFirst`, not `findUnique` — `referenceId` is deliberately non-unique. See §6 for why `nulls:
"last"` is load-bearing. `subscription` stays **nullable**: between the checkout redirect and the
webhook there is no row yet, and the existing no-date copy is better than a wrong date.

---

## 5. Test-mode E2E — 11 of 12 steps proven

Stripe CLI 1.45.1 (`winget install Stripe.StripeCli`), listener on
`/api/auth/stripe/webhook`, Neon **development** branch read after each step.

| # | Step | Result |
| --- | --- | --- |
| — | mount control | `/subscription/upgrade` 400, `/stripe/webhook` 400, `/subscription/nonsense` **404** — the 404 proves the 400s mean "mounted" |
| 1 | Free state | limits grid, cycle toggle, 9 €/86 € |
| 2 | Checkout | `lang=hr`, "14 dana besplatno", **9,00 €** (monthly id), **no card requested** → `if_required` proven |
| 3 | Webhook | `subscriptions` row with `referenceId` = **organization id**; `users.stripeSubscriptionId` matches it; org-less user untouched |
| 4 | Trial | `trialing` → `isPro = true`; card reads *"prva naplata 20. kolovoza 2026"* |
| 5 | Portal | `billing.stripe.com`, `lang=hr-HR`, scoped to our customer |
| 6 | Cancel | amber `#B45309` chip, cancel/switch hidden, **`isPro` still true** |
| 7 | **At period end** | portal: *"Your plan stays active until August 20, 2026"*; config `mode=at_period_end` |
| 8 | Deleted | `isPro` false, sub id null, archive `expiresAt` = createdAt **+ exactly 1 calendar year**, **archive count unchanged** |
| 9 | Bad signature | 3 forged variants (none / garbage v1 / real HMAC wrong key) → **400**, **zero writes proven by SQL** |
| 10 | Replay | `expiresAt` unchanged, `isPro` unchanged — no double effect |
| 11 | Resubscribe | **two rows, same `referenceId`, no 500** — what the non-unique index exists for; yearly checkout `amount_total 8600` |
| 12 | `authorizeReference` | another org's id → **401** on upgrade *and* billing-portal; own org → 200 |

**Step 11 caveat:** proven structurally (second row created, no constraint violation). The second
payment was not completed — Stripe Checkout's card fields are iframed and it was not worth fighting
the harness for a claim already carried by the row.

**Restored afterwards, SQL-proven identical to baseline:** 0 subscription rows, `isPro` back to its
pre-test value, stripe columns null, 1 archive with `expiresAt` null, 1 org, 22 elections, 2 users.
`.env.development` restored byte-identical; fixture script deleted.

> Test-mode Stripe customers/subscriptions/events remain in the Stripe sandbox account. That is fine
> and expected; note that they exist.

---

## 6. Defects found during the E2E

All three were invisible to unit tests and to a code read. They are the argument for running the E2E.

### 6.1 A cancelled subscription said it would be charged

Stripe does **not** set `cancel_at_period_end` when you cancel a *trialing* subscription — it sets
`cancel_at`. The mapping only checked the boolean, so after cancelling, the card still rendered the
trialing branch: *"Besplatno probno razdoblje — **prva naplata** 20. kolovoza 2026."*

The user had just cancelled and was being told they would be billed.

```ts
status: subscription.cancelAtPeriodEnd || subscription.cancelAt ? "canceling" : …
renewsAt: subscription.cancelAt ?? subscription.periodEnd,
```

### 6.2 An abandoned checkout erased the renewal date

`orderBy: { periodEnd: "desc" }` — **Postgres puts NULLs FIRST in DESC order.** Starting a second
checkout creates an `incomplete` row with `periodEnd = null`, which then wins the sort, so
`subscription?.periodEnd` is falsy and the card falls back to the no-date copy.

Concretely: a Pro user who opens a second checkout and abandons it loses their renewal date.

Fixed with `orderBy: { periodEnd: { sort: "desc", nulls: "last" } }`, verified with both rows present.

### 6.3 Stripe's English errors surfaced in the Croatian UI

The first `fail()` preferred `error.message`, so a Croatian admin saw *"This subscription cannot be
updated because the subscription update feature in the portal configuration is disabled."* Now the
localized string is shown and the raw message goes to `console.error("[billing]", …)`.

---

## 7. What still needs a human

### 7.1 ⚠ Portal "Plan switching" is disabled

Checked via the API — three of the four §8.2 settings are already correct:

| Setting | Required | Actual |
| --- | --- | --- |
| Cancellation | enabled, at period end | ✅ `enabled=true, mode=at_period_end` |
| Payment method update | enabled | ✅ |
| Invoice history | enabled | ✅ |
| **Plan switching** | **enabled, Pro monthly + yearly** | ❌ **`enabled=false`** |

"Switch to yearly" therefore fails for real users. Fix in **Dashboard → Billing → Customer portal**,
in **test mode and again in live mode** — they are separate configurations and **the app cannot read
either**. Same silent-no-op class as Upstash and R2.

### 7.2 The guarantee this phase gives away

`subscription.cancel()` redirects to Stripe's Billing Portal instead of calling
`subscriptions.update` ourselves. **"Never `subscriptions.del`" is therefore no longer enforced by our
code** — whether cancellation is immediate or at period end is now a Dashboard setting. It is correct
today (verified above), and nothing in this repo will notice if it changes.

### 7.3 Production rollout is still blocked

Live keys need a registered legal entity (`pre-incorporation-billing-spec.md`). Until then
`BILLING_ENABLED` stays unset in production, every resolution returns Pro, and the plugin does not
mount because the production keys are empty. **This is the intended state, not an oversight.**

### 7.4 Minor: a 3-cent copy discrepancy

The card advertises **€7,20/month billed annually** (9 × 0.8); Stripe renders **€7.17** (86 ÷ 12).
Both defensible. It is a `project-paywall-spec.md` copy decision, not a phase-2 bug.

---

## 8. Tests

`src/lib/services/billing.service.test.ts` — 12 cases, **464 total** (+12).

Scoped-by-org projection · sub id only on the customer row · both writes in one transaction ·
`canceled` nulls the id · `trialing`/`past_due` stay Pro · unknown status is not Pro · no
`stripeCustomerId` → single write · replay produces identical args · stamp targets only null
expiries · per-row calendar year · **nothing is deleted** · empty set returns 0.

**All six guards mutation-checked** — each mutation fails a *specific* test, not the whole file:

| Mutation | Caught by |
| --- | --- |
| `organizationId` → `id` | scoping test |
| drop the `isPro ? … : null` ternary | canceled test |
| replace `$transaction` with sequential awaits | transaction test |
| drop `expiresAt: null` from the stamp filter | targeting test |
| calendar year → `365 * 86_400_000` | leap-year test (`2027-03-01`, which *crosses* 29 Feb) |
| stamp → `deleteMany` | deletion + targeting tests |

The plugin's own webhook handling (signature verification, event routing, `Subscription` writes) is
**not ours to test** — that surface is covered by §5 steps 9–11.

---

## 9. Gating is NOT in this phase

Spec §6 was **split out at `start` (D1)**. There is no `resolveEntitlement`, no voter cap on
`createElection`/`addVoters`, no branded-PDF line, no cap UI, no
`ENTITLEMENT_ENFORCEMENT_ENABLED`. `entitlement-enforcement-spec.md` ships next, unchanged.
E2E steps 13–14 dropped with it.

Two decisions were recorded for that branch:

- **Resolver goes in `src/lib/services/entitlement.service.ts`**, not the spec's
  `src/lib/entitlement.ts` — one character from the shipped client-safe `entitlements.ts` is a trap,
  and `services/` is this codebase's convention for `server-only` modules.
- **D2: publish does not re-check the cap.** Voters added under a valid entitlement stay valid.
  `project-paywall-spec.md` §4 was amended accordingly (was "checked at add-voter **and publish**
  time").

`BILLING_ENABLED` also stays read in `(app)/settings/page.tsx`. Spec §1 moves it into the entitlement
module — which D1 just moved to the next branch. Creating a module to hold one const would be the
move arriving without its reason.

---

## 10. Environment

| Variable | Dev | Prod |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | test key | **empty — intended** |
| `STRIPE_WEBHOOK_SECRET` | from `stripe listen` | empty |
| `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` | set | empty |
| `BILLING_ENABLED` | unset (add `"true"` to exercise the card) | unset |

Local webhook loop:

```bash
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
# paste the printed whsec_… into STRIPE_WEBHOOK_SECRET, then restart the dev server
```

Note the path — **`/api/auth/stripe/webhook`**, not `/api/stripe/webhook`. The plugin lives under the
BetterAuth catch-all.

`STRIPE_PUBLISHABLE_KEY` and `STRIPE_TRIAL_PRICE_ID` exist and are **read by nothing**. Checkout and
Portal are redirect-based and the trial is `freeTrial.days` on the plan. Do not wire a client-side
Stripe call just to justify the publishable key.

---

## 11. Environment gotchas hit this session

- **Git Bash mangles Stripe CLI API paths.** `stripe delete /v1/subscriptions/sub_…` becomes
  `/v1/C:/Program%20Files/Git/v1/…`. Prefix with `MSYS_NO_PATHCONV=1`.
- **`/tmp` differs between tools.** Bash redirects see the MSYS `/tmp`; Node and Python resolve it to
  `C:\tmp`, which does not exist. Use repo-relative temp files.
- **`npm run build` clobbers the `.next` a running dev server serves from** (eleventh occurrence).
  Kill the server, `rm -rf .next`, restart. Also check for a zombie holding port 3000
  (`Get-NetTCPConnection -LocalPort 3000`) — one had to be killed by PID here.
- Playwright's Firefox was not installed; `npx @playwright/mcp install-browser firefox`.

---

## Related

- `docs/2026-08-06/stripe-integration-phase-1.md` — the offline half
- `docs/2026-08-05/settings-phase-7-plan-billing.md` — the card this phase wired
- `context/features/entitlement-enforcement-spec.md` — the gating branch, next
- `context/features/pro-features-implementation-spec.md` — launch blocker **L2**: two advertised Pro
  features are not built
- `context/pre-incorporation-billing-spec.md` — why live mode is blocked
