# Stripe Integration Phase 1 — Core Infrastructure

**Branch:** `feature/stripe-phase-1` · **Version:** 0.9.13 → **0.9.14** (patch)
**Spec:** `context/features/stripe-integration-phase-1-spec.md`
**New files:** `src/lib/stripe.ts` · `src/lib/entitlements.ts` (+ test) · `src/lib/billing.ts` (+ test)
**Changed:** `prisma/schema.prisma` · `package.json` / `package-lock.json`
**Migration:** `20260806091149_add_subscription_table`
**New dependencies:** `stripe@22.4.0` · `@better-auth/stripe@1.6.26`

> **This phase moves no money, writes no entitlement, and mounts no plugin.** It builds the offline
> half of billing: the SDK singleton, the table the plugin needs before it can run at all, the plan
> configuration, and the pure entitlement module every future gate reads through. Nothing here calls
> Stripe, no endpoint goes live, and nothing is browser-verifiable — that is the point of the split.

---

## 1. The rule the whole design rests on

> **The `Subscription` table is the source of truth from Stripe. `users.isPro` stays the projection
> the rest of the app reads. Nothing outside phase 2's hooks writes either.**

This is what keeps the blast radius at zero:

- `requireSession()`, the GDPR delete gate in `account-deletion.service.ts`, the narrow
  `select: { isPro, stripeSubscriptionId }` in `(app)/settings/page.tsx` and every future gate keep
  reading `isPro` — **untouched, this phase and the next**.
- The plugin keeps `Subscription` in sync with Stripe on its own.
- Phase 2 adds the one-way projection `Subscription.status → users.isPro` in the plugin's lifecycle
  hooks, via `isProStatus()`.

The alternative — deriving `isPro` from a join at every call site — means editing the erasure path,
`requireSession` and five gates in the same diff that introduces billing. Two destructive surfaces in
one review is how a reviewer stops being able to review either.

**If you are touching billing, do not "tidy up" `subscriptionBlocks()` or that `select`.** They need
no edit, and that is deliberate.

---

## 2. Why the plugin instead of hand-rolled Stripe code

Decided 2026-08-06, reversing an earlier recommendation. Two committed roadmap items in
`future-updates-spec.md` §Billing — **extra admin seats** and **Electius Max** — are exactly the shape
`@better-auth/stripe` solves (`seatPriceId` + automatic quantity sync; `plans[]` + proration +
`stripeScheduleId`) and exactly the shape hand-rolled Stripe code does worst.

Adopting it now costs **one migration**. Adopting it after a hand-rolled webhook is already writing
`isPro` costs a migration **plus a backfill plus a rewired GDPR delete path**. This was the cheap
moment.

**What the plugin does not decide:** `entitlements.ts` stays ours. The plugin offers a per-plan
`limits: {}` bag — **do not use it.** Limits there are keyed by plan name, which cannot express the
deferred `purchased` (per-election) entitlement, and would put the voter cap in two places the day it
lands.

---

## 3. `src/lib/stripe.ts` — the SDK singleton

Same shape as `src/lib/prisma.ts` and `storage.service.ts`: `import "server-only"`, module-level
singleton, throws at init on misconfiguration.

**The guard is bidirectional on purpose:**

| Condition | Result | Why |
| --- | --- | --- |
| no `STRIPE_SECRET_KEY` | throws | loud failure at boot, not at checkout |
| `sk_test_` **and** `NODE_ENV=production` | throws | stops a deploy that takes no money |
| `sk_live_` **and** not production | throws | stops a local test that takes **real** money |

The third row is the one a one-directional guard misses, and it is the strictly worse failure. The
sandbox/live boundary is enforced by code, not by discipline.

> ⚠ **Nothing imports this file in phase 1, and that is deliberate.** The plugin is not mounted until
> phase 2. Importing the singleton early would make `STRIPE_SECRET_KEY` a hard boot requirement for
> the whole app — `npm run build` in CI included — before anything needs it.

`ponytail:` no API-version pin — the SDK follows the account's dashboard version, which is what a
single-integration project wants. Pin it the day the plugin's expected version and ours diverge.

---

## 4. The `Subscription` model — the one migration

Authored **by hand** in `schema.prisma`, applied with `prisma migrate dev`. It is not generated: this
repo owns its migrations. `@better-auth/cli generate` was used only to **diff** what the plugin
expects against what we wrote (§8).

### Four things that are not style choices

1. **`referenceId` is not unique.** A customer who cancels and resubscribes gets a **second row**. A
   unique constraint here turns "customer comes back" into a 500. The migration creates a plain
   index, not a unique one — verify that if you ever re-generate.
2. **`referenceId` holds an `organizationId`, not a `userId`** (decision D1). `project-overview.md`
   states the subscription is *billed per organization*, and the seats roadmap is org-scoped by
   definition. Today 1 org ↔ 1 admin, so both behave identically — which is exactly why it was free
   to choose correctly now. Attaching it to a person means a data migration the day a second admin
   exists. **Cost: phase 2 must add `authorizeReference` (~10 lines) verifying the session user
   belongs to that org.** Without it, any signed-in admin could reference any organization's id.
3. **No foreign key to `User` or `Organization`.** The plugin expects a plain string in that column.
   An FK would foreclose the org-scoped future and break the plugin's own writes.
4. **`seats` and `stripeScheduleId` ship unused.** They are the plugin's contract, not ours. Removing
   them to "keep the table clean" means a migration on the day seats ship — which is the roadmap item
   that justified this whole architecture.

Model name `Subscription` → Prisma client accessor `prisma.subscription` → the plugin's default
`subscription`. The `@@map("subscriptions")` (house convention, plural snake_case) does **not** affect
that resolution — the adapter reads the model name, not the table name.

---

## 5. `src/lib/entitlements.ts` — the entitlement seam

Pure. No Prisma, no `process.env`, no Stripe types, no plugin import, and **deliberately not
`server-only`** — a client component has to render "42 of 50 voters used".

```ts
export const FREE_VOTER_CAP = 50;
export const PRO_VOTER_CAP  = 500;

export type Entitlement =
  | { kind: "free" }
  | { kind: "pro" }
  | { kind: "purchased"; voterCap: number };   // out of MVP — do not remove

voterCap(e)                     // free → 50 · pro → 500 · purchased → its own ceiling
canBrandReports(e)              // free → false, otherwise true
archiveExpiresAt(e, sealedAt)   // free → +1 calendar year · pro / purchased → null
```

### Three rules this file encodes

1. **`purchased` exists from day one, unused.** Pay-per-election is out of MVP; when it lands it adds
   a *resolver branch*, not a type. A two-case union today means every `switch` written in phase 2
   silently becomes non-exhaustive later.
2. **Every function is an exhaustive `switch` with a non-nullable return type**, so adding a union
   variant is a **compile error** — not a `!== "free"` shortcut that would silently accept it.
3. **`archiveExpiresAt` adds a calendar year, never `365 * 24 * 60 * 60 * 1000`.** That exact bug was
   caught at review in `archive.service.ts`; it lands a day early in a leap year and **nothing would
   notice**, because no job reads `expiresAt` yet.

**Resolution order is not in this file.** `resolveEntitlement(electionId | null, orgId)` is the
`server-only` half and belongs to phase 2 / phase 8.

`ponytail:` `archive.service.ts` still has its own private `oneYearFrom`. Folding the two needs
`resolveEntitlement`, and touching the seal path inside a billing diff is the objection from §1.
The comment at `archiveExpiresAt` names the fold-in.

---

## 6. `src/lib/billing.ts` — plan configuration and status mapping

Everything about Stripe decidable without calling Stripe. Separate from `stripe.ts` so it is testable
without the SDK; separate from `entitlements.ts` so entitlement logic stays free of billing vocabulary.

### `requiredPriceId(cycle)` throws — it never falls back

This function is **why `billing.ts` still exists under the plugin.** The plugin's plan config accepts
`priceId: process.env.STRIPE_PRICE_PRO_MONTHLY!` directly — and a missing var then produces a plan
with `priceId: undefined`, which fails at *checkout time, on a customer*. Routing both IDs through a
throwing accessor moves that failure to startup.

There is no safe fallback for a price: defaulting to the other cycle charges a yearly customer
€9/month or a monthly customer €86. So there is no fallback.

### `proPlan()` — yearly is a discount, not a second plan

The plugin models yearly billing as `annualDiscountPriceId` on the **same** plan, selected by
`annual: true` at upgrade time. This matches `project-paywall-spec.md` (one Pro tier, two billing
cycles) and is why the settings card's cycle toggle maps to a boolean, not a plan name.

`freeTrial: { days: 14 }` lives on the plan. D4's `trial_settings.end_behavior` is **not** a plan
field — it goes through `getCheckoutSessionParams` in phase 2.

### `isProStatus(status)` — the one place a Stripe status is interpreted

| Stripe status | `isPro` | Why |
| --- | --- | --- |
| `active` | `true` | paying |
| `trialing` | `true` | a trial that does not grant the feature is not a trial |
| `past_due` | `true` | **grace** — see below |
| `canceled` · `unpaid` · `incomplete_expired` | `false` | over |
| `incomplete` · `paused` | `false` | never started / suspended |
| anything else | `false` | a status this table has never seen is not a paying one |

**`past_due` keeping Pro is a deliberate revenue-vs-goodwill call** (D5). Revoking on the first failed
charge punishes an expired card; Stripe's own retry schedule reaches `canceled` or `unpaid` on its
own, at which point this table revokes it. We add no dunning behaviour. **Phase 2's hook must log it**
so a dunning problem is visible rather than silent.

> `cancel_at_period_end: true` is **not a status.** Stripe keeps such a subscription `active` until
> the period ends — correctly, the customer paid for it. The card's amber "canceling" state derives
> from `cancelAtPeriodEnd`, never from this table.

---

## 7. Environment variables

**Never commit a real key or price ID.** The values below are placeholders; the live ones live only in
gitignored `.env.development` / `.env.production` and in Vercel.

| Var | Development | Production | Needed from |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` | phase 1 |
| `STRIPE_PRICE_PRO_MONTHLY` | test-mode `price_…` | live-mode `price_…` | phase 1 |
| `STRIPE_PRICE_PRO_YEARLY` | test-mode `price_…` | live-mode `price_…` | phase 1 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from `stripe listen` | `whsec_…` from the dashboard endpoint | **phase 2** |

Price IDs are **never hardcoded**: test and live mode have different IDs by nature, which is what makes
accidental cross-environment charging structurally impossible.

`.env.example` was **not** created (decision D3) — it does not exist in this repo, and creating one
honestly means backfilling ~20 existing keys, a repo-wide chore riding on a billing branch. This table
is the contract instead.

### Two vars that exist and are read by nothing

`STRIPE_PUBLISHABLE_KEY` and `STRIPE_TRIAL_PRICE_ID` are present in the env files and are **not used
by this design**. Checkout and Portal are redirect-based, so the publishable key is not needed at all;
the 14-day trial is `freeTrial.days` on the plan, not a separate price. Left in place deliberately —
**do not wire a client-side Stripe call to justify the publishable key.**

### ⚠ Production values in Vercel are user-side work the app cannot verify

The same silent-no-op class that caught Upstash (rate limiting) and R2 (image upload). A missing or
wrong-mode **secret key** throws at init, which is the loud failure. A missing **price ID** throws only
when `requiredPriceId` is called — which, in phase 2, is at plan configuration time.

---

## 8. The `@better-auth/cli generate` diff (D7), and how it actually has to be run

Its only job is to prove the hand-authored model matches what the plugin will query. **A mismatched
field name is a runtime failure on a paying customer's checkout, and neither `tsc` nor the build
catches it.**

**The spec's instructions do not work as written.** The CLI refuses any config that reaches
`import "server-only"` — and `src/lib/auth/index.ts` does, transitively, via `@/lib/prisma`. So
scratch-*mounting* the plugin there is not enough; removing the top-level `server-only` import is not
enough either.

**What worked:** a throwaway root config isolating only the plugin (a `betterAuth()` with
`prismaAdapter({} as never, …)` and the stripe plugin, nothing else), generated to a temp path, read,
then deleted. `src/lib/auth/index.ts` was verified byte-identical to `HEAD` afterwards.

Also note: **the CLI versions independently of core.** `@better-auth/cli@latest` is `1.4.21`; there is
no `1.6.26` to pin it to.

### The one divergence it found

The CLI emits `status String?`; our model has `status String @default("incomplete")`.

Traced to the plugin source: `status` is declared with `defaultValue: "incomplete"` but **no
`required: true`**, and BetterAuth's generator treats a missing `required` as optional. All four
plugin write sites pass a concrete string (`subscription.status` from Stripe, `"incomplete"`,
`"canceled"`), and Stripe's own `status` type is never null.

**Kept NOT NULL** — safe, stricter, and it means phase 2's `isProStatus(status)` needs no null branch.
A null arriving would throw loudly rather than storing a billing row nobody can interpret.

Other differences are all benign: our two `@@index`es are additive; `@default(cuid())` on `id` is an
unused fallback (BetterAuth supplies the id); the table name differs by the deliberate `@@map`.

---

## 9. What phase 1 deliberately does **not** build

The plugin makes each of these a one-liner, and "just adding it while I'm here" is the whole risk of
this phase:

| Not built | Belongs to |
| --- | --- |
| Mounting `stripe()` in `src/lib/auth/index.ts` | phase 2 §2 |
| Any lifecycle hook writing `isPro` | phase 2 §3 |
| `authorizeReference` (required by D1 — see §4) | phase 2 §2 |
| Wiring the settings card's four CTAs | phase 2 §4 |
| Reading `Subscription` in `(app)/settings/page.tsx` | phase 2 §4.2 |
| Voter caps, branded-PDF gate | phase 2 §5, behind a flag |
| `resolveEntitlement()` — the `server-only` half | phase 2 / phase 8 |

**The boundary is not arbitrary.** The moment the plugin is mounted, `/api/auth/stripe/webhook` is a
live endpoint and `authClient.subscription.upgrade` is callable from the browser. Phase 1 stops short
so nothing can take money before the projection hooks exist to record it.

The build output confirms it: no `/api/auth/stripe/*` route appears, and `/api/auth/[...all]` is
unchanged.

---

## 10. Verification

- `npm run lint` · `npx tsc --noEmit` · `npm run build` — clean. **`npm run test` 452 passing** (+22).
- `npx prisma migrate status` clean after the migration; the `subscriptions` table confirmed live on
  the Neon **`development`** branch (17 columns, both indexes, `referenceId` indexed **not** unique,
  `status` NOT NULL DEFAULT `'incomplete'`). Always pass `branchId` explicitly — `production` is the
  default branch and is off-limits.
- `users.isPro` / `stripeCustomerId` (unique) / `stripeSubscriptionId` (unique) re-verified live before
  writing anything. The plugin expects the user column to be named exactly `stripeCustomerId`,
  camelCase — it already is, so **no migration for that column**.
- **The startup guard exercised for real, not asserted** — all four branches: live-key-outside-prod,
  test-key-in-prod, missing key, correct test key → loads.
- **A throwaway script against the real env** confirming the two price IDs actually differ and both
  begin `price_`. A copy-paste that puts the monthly ID in both vars passes every unit test and charges
  yearly subscribers €9/month; only reading the live env catches it. Script deleted.

### The startup guard cannot be exercised by starting the app in this phase

The spec asks for it, but §3 forbids importing `stripe.ts` anywhere — so nothing loads the module and
`npm run dev` never reaches the guard. It was exercised by importing the module directly under each env
condition (`npx tsx --conditions react-server` — plain `tsx` cannot resolve `server-only`), which runs
the identical module-level code that will run at boot once the plugin is mounted. **The spec's §3 and
§10 contradict each other.**

### Mutation-checking found a bad test in the spec

Every load-bearing assertion was mutation-checked — break the implementation, confirm a **specific**
test goes red. Two of the three behaved as expected (swapping the two price env vars fails 6 tests
including the separate `proPlan()` assertions; removing the throw fails 3).

**The third did not.** The spec's headline leap-year case, `2027-02-28 → 2028-02-28`, passes under
**both** the calendar-year implementation and `365 * 86_400_000` — 29 Feb 2028 falls *after* 28 Feb
2028, so that interval is exactly 365 days and the two implementations agree. It is a false pin.

A case that actually bites has to **cross** a 29 February. Added:

```
sealed 2027-03-01  →  calendar year: 2028-03-01   ·   365 days: 2028-02-29   ✗
```

Both cases are kept — the spec's one still pins the year offset — and the spec's is annotated in the
test so nobody re-derives this. **`stripe-integration-phase-1-spec.md` §9 needs amending.**

---

## 11. Things to know before phase 2

- **`better-auth` moved `1.6.23` → `1.6.26`** in the lockfile: `@better-auth/stripe@1.6.26`
  peer-requires `^1.6.26`, and `package.json` already carried `^1.6.23`, so the range allowed it.
  `package.json` itself is unchanged. Lint, `tsc`, 452 tests and the build are clean and no auth code
  changed — but a login/OTP smoke test is cheap insurance after an auth-library bump.
- **D1 creates an obligation:** `referenceId` holds an organization id, so phase 2 **must** implement
  `authorizeReference`. Without it the reference is attacker-supplied.
- **D6 — `createCustomerOnSignUp: false`.** Otherwise every signup creates a Stripe customer, including
  the ones that never open the billing card: junk in the dashboard and a write on a path with nothing
  to do with billing. The customer is created at first checkout, which is when one is needed.
- **D4 — trial `missing_payment_method: "cancel"`.** With no card collected there is nothing to charge
  on day 15. `create_invoice` bills someone who never gave payment details and starts a dunning cycle;
  `pause` leaves a zombie subscription reporting neither active nor cancelled. `cancel` drops them
  cleanly to Free, and Free is a real product. Applied via `getCheckoutSessionParams`.
- **`BILLING_ENABLED` is still read directly** in `(app)/settings/page.tsx`. Its intended home is
  `entitlements.ts`, but that file is pure by design (no env), so the fold-in belongs with
  `resolveEntitlement` in phase 2 — one call site to move.
- Live keys remain blocked by the missing legal entity (`pre-incorporation-billing-spec.md`). **Stripe
  test mode needs no business verification**, which is why this entire phase was buildable today.

---

## Related

- `context/features/stripe-integration-phase-2-spec.md` — mounting the plugin, the projection hooks,
  UI wiring, gating
- `context/features/entitlement-enforcement-spec.md` — phase 8; §3 is the seam §5 above ships the pure
  half of
- `context/features/profile-settings-phase-7-spec.md` — the Plan & billing card (shipped v0.9.13); its
  four CTAs are the seams phase 2 fills
- `context/project-paywall-spec.md` — tiers, prices, the never-gated list. **Authority.** Nothing is
  restated here.
- `docs/2026-08-05/settings-phase-7-plan-billing.md` — the UI this eventually powers
