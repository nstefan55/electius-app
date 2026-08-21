# Stripe Mode Guard — VERCEL_ENV

**Branch** `fix/stripe-mode-guard-vercel-env` · **Version** 0.9.29 → **0.9.30** (patch)
**Commit** `26c32b0` · **Merge** `4340831`
**Spec** `context/features/stripe-production-testing-spec.md` §1 (prerequisite fix)
**Sibling** `stripe-local-testing.md` (the local run this unblocks the deployed half of)
**Authority for behaviour** `stripe-integration-phase-1-spec.md` · `stripe-integration-phase-2-spec.md`

One expression in `src/lib/stripe.ts`, plus the test file that expression never had. It exists
because the guard meant to stop a bad Stripe key from reaching production would instead have taken
**the entire signed-in app** down on the next deploy.

Nothing else moved: `stripeConfigured`, the plugin mount and the eager `stripeClient()` call are all
untouched, per the spec's scope note.

---

## Findings index

| # | Finding | Where |
| --- | --- | --- |
| F1 | **`npm run build` was already broken on `main`.** `.env.production` had been populated with Stripe **test** keys, so the guard fired during the build's page-data collection. Pre-existing, not caused by this fix | §1 |
| F2 | **The `NODE_ENV` fallback does not rescue local builds** — `VERCEL_ENV` is absent locally, so the fallback yields the same answer the bug had. The spec justified the fallback as preserving "local `next build`, CI, tests", written without knowing that file held keys | §2 |
| F3 | **The spec's central premise is false — production IS migrated.** §2.1 chose Preview over Production because "the `subscriptions` table does not exist there". It does: 13 migrations, and `migrate diff` reports **no difference**. Gate 8 is done | §4 |
| F4 | **The test-key check is now armed by `BILLING_ENABLED`** (user's decision), which is what makes the deployed procedure runnable on the real domain at all | §3 |
| F5 | ⚠ **The hazard is relocated, not removed.** Flipping `BILLING_ENABLED=true` while a test key is still in place re-arms the guard *at module load* and takes down every signed-in page. **Swap the keys before the flag** | §3 |
| F6 | **The spec asked to extend an "existing four-branch mode-guard test". There is none** — phase 1 exercised those branches with a throwaway script that was never committed | §5 |
| F7 | **Testing on Production collides with the Neon guardrail** — `CLAUDE.md` forbids touching the production branch even for reads, so SQL assertions and cleanup cannot run there | §6 |

---

## 1. The bug: two ordinary decisions

```ts
// before
const isProd = process.env.NODE_ENV === "production";
if (isProd && key.startsWith("sk_test_")) throw new Error("Test ključ u produkciji");
```

`NODE_ENV` answers *"am I an optimized build?"*, not *"am I live?"*. `next build` sets it to
`"production"` on **every** Vercel deployment — Preview, and a local `npm run build`, exactly as much
as real production. So the guard read any deploy as live and refused a test key on all of them.

That alone would be a nuisance. What makes it an outage is a second, unrelated decision:

- `src/lib/auth/index.ts:311` builds the plugin array **at module scope**
- `billingPlugin()` calls `stripeClient()` eagerly on line 56 — not lazily
- that module is imported by `require-session.ts`
- which every `(app)` page imports

So the throw happens while the module is being evaluated, and takes every signed-in page with it.
Not "billing unavailable" — **500 on `/home`, `/elections`, `/settings`, everything.**

The file's own comment describes preventing exactly this. The lazy `stripeClient()` it introduced is
real, but the eager call site at the mount neutralises it.

**F1 — this was already live on `main`.** `.env.production` had been filled with Stripe test keys, so
`stripeConfigured` was true, the plugin mounted, and `npm run build` died at *Collecting page data*
with `Error: Test ključ u produkciji`. Pre-existing; the pre-fix expression evaluates identically
with `VERCEL_ENV` absent, which one of the new tests pins.

---

## 2. The fix

```ts
const vercelEnv = process.env.VERCEL_ENV;
const isProd = vercelEnv ? vercelEnv === "production" : process.env.NODE_ENV === "production";
```

`VERCEL_ENV` is `production` / `preview` / `development` and is set only on Vercel, so it answers the
question the guard is actually asking. `NODE_ENV` remains the fallback for local builds, CI and
tests — the environments where `VERCEL_ENV` does not exist.

| environment | key | result |
| --- | --- | --- |
| Vercel production | `sk_test_` | refused *(when billing is on — see §3)* |
| Vercel preview | `sk_test_` | allowed ← the case this fix exists for |
| any deploy outside production | `sk_live_` | refused |
| local | `sk_live_` | refused |
| local `next build` | `sk_test_` | refused *(F2)* |

**F2:** that last row is why the build stayed broken after the fix. `.env.production` is gitignored
and never reaches Vercel, so the keys in it had exactly one effect — breaking local builds. Resolved
by setting all five values to `""` there, originals kept as comments in the same file. That restores
the posture the spec describes: plugin unmounted, route 404s.

**Rejected, recorded so they are not re-proposed:** `NODE_ENV=development` on the deployment (breaks
React's production build and every other consumer); making `stripeClient()` lazy inside the plugin
(fixes *when* the throw happens, not *that* it does, and the spec's scope note forbids touching the
mount path here); testing with live keys.

---

## 3. `BILLING_ENABLED` arms the test-key check (F4, F5)

With the fix alone, a test key on Vercel **Production** still throws — which blocks running the
deployed webhook procedure on the real domain. The decision taken was to couple the check to the
billing flag:

```ts
const billingLive = process.env.BILLING_ENABLED === "true";

if (isProd && billingLive && key.startsWith("sk_test_")) throw new Error("Test ključ u produkciji");
if (!isProd && key.startsWith("sk_live_")) throw new Error("Live ključ izvan produkcije");
```

The reasoning: a test key can only mislead someone once users can actually buy. While billing is off
there is no purchase flow exposed, and production is simply the only deployment with real domains.
The flag is read strictly (`=== "true"`), so absent or misspelled means *off*, matching how
`entitlement.service.ts` reads it.

**The live-key half is deliberately untouched by the flag.** `sk_live_` outside production still
throws unconditionally — that is the direction that costs real money, and no feature flag should
excuse it. A mutation that extends `billingLive` to that line is caught by its own named test.

**F5 — read this before launch.** The guard does not disappear, it re-arms. Setting
`BILLING_ENABLED=true` while a `sk_test_` key is still configured throws at module evaluation and
takes the whole signed-in app down, not just billing. **Swap the keys before flipping the flag.**
Marked at the code; belongs in `production-readiness-spec.md` §11 as a checklist ordering.

The trade is deliberate: a guard that fires during a routine deploy is a trap, the same guard firing
during a deliberate launch cutover is a checklist item. Downgrading the severity would mean making
`stripeClient()` lazy at the mount, which is a separate change.

---

## 4. What this cleared up about the spec (F3)

`stripe-production-testing-spec.md` §2 argues for a Preview deployment on three grounds. The first —
"the production Neon branch has **no migrations applied** — the `subscriptions` table does not exist
there" — is **false**:

```
$ NODE_ENV=production npx prisma migrate status
13 migrations found in prisma/migrations
Database schema is up to date!

$ NODE_ENV=production npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
No difference detected.
```

The second command matters more than the first: `migrate status` only reads `_prisma_migrations`,
while `migrate diff` compares the **physical** schema. Gate 8 has been done.

Consequences, all of which should be written back into the spec:

- **D2 loses its main reason.** Preview was chosen largely to avoid spending the irreversible
  migration; there is nothing left to spend.
- **The `dashboard.` host problem disappears.** `src/proxy.ts:12-13` decides "is this the admin host?"
  with `host.startsWith("dashboard.")`. A bare `*.vercel.app` preview alias fails that test, so the
  proxy treats it as the apex and 307s every admin path away — the UI-driven tests (P1, P2) are not
  runnable on a preview alias without a custom `dashboard.*` domain. On production,
  `dashboard.electius.com` is a real dashboard host and the problem does not arise. The webhook
  itself is unaffected either way: it lives under `/api`, which the proxy skips.
- **F7 — but production writes collide with the Neon guardrail.** `CLAUDE.md` puts the production
  branch off-limits including reads, so the spec's SQL assertions and its mandatory §6.2 cleanup
  cannot run there. Resolved by pointing Vercel **Production**'s `DATABASE_URL` / `DIRECT_URL` at the
  Neon **development** branch for the test window, then reverting: the real host is kept, fixture
  rows never touch production data.

---

## 5. Tests (F6)

`src/lib/stripe.test.ts` is **new** — 17 cases, the first tests this module has ever had. The spec
said to extend an existing four-branch mode-guard test; phase 1 (2026-08-06) exercised those branches
with a throwaway script that was never committed, so there was nothing to extend.

Suite: **651 passing**, 36 files.

The module memoizes its client in a module-level `let`, so every case needs
`vi.resetModules()` + a dynamic import — the `urls.test.ts` pattern. Every env var is stubbed
explicitly rather than left ambient, because a `VERCEL_ENV` present on a CI runner would otherwise
silently change the answer.

Six mutations, **each caught by named tests**, three of them by exactly one:

| mutation | caught by |
| --- | --- |
| `isProd = true` | 7 tests |
| revert to `NODE_ENV` only *(the pre-fix code)* | 4, incl. *allows a test key on a Preview deployment* |
| drop the `NODE_ENV` fallback | *keeps the old NODE_ENV=production behaviour off Vercel* |
| drop `billingLive` from the test-key check | *allows a test key in production while billing is off* |
| flag defaults to armed (`!== "false"`) | *treats an unset flag as billing-off* |
| flag also excuses a live key | *never lets the flag excuse a live key outside production* |

One harness bug was caught by its own assertion: the helper's `env.billingEnabled ?? "true"`
swallowed an explicit `undefined`, so the absent-flag case was silently testing the armed one.
`"billingEnabled" in env` instead. Worth remembering — a defaulting helper can quietly delete the
distinction a test exists to make.

**Mutation runs assert the search string was found before writing.** A mutation that fails to apply
is indistinguishable from one no test catches, and this repo's CRLF files have produced that false
negative twice before.

---

## 6. What is not proven

- **Nothing is deployed yet at the time of writing.** The fix is merged to `main`; the production
  deployment still predates it. A junk-signature probe of
  `POST https://dashboard.electius.com/api/auth/stripe/webhook` returns **404**, meaning
  `stripeConfigured` is false on the running build — Vercel bakes env at build time, so staged
  variables are not live until a redeploy.
- **The guard has never fired on a real Vercel deployment**, in either direction. Every branch is
  unit-tested and mutation-checked; none has executed on Vercel.
- **P1–P9 have not run.** This fix only removes their blocker.
- No `purchased` entitlement path exists to exercise.

---

## 7. Operational — what must be true in Vercel

The app cannot detect any of these; each is a silent no-op if wrong.

| # | Setting | Value |
| --- | --- | --- |
| 1 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY` | test-mode values; both of the first two are required or the plugin does not mount and the route 404s |
| 2 | `BILLING_ENABLED` on Production | **`false` or absent.** `"true"` arms the guard against a test key and the deploy 500s (F5) |
| 3 | `DATABASE_URL` / `DIRECT_URL` on Production, **for the test window only** | Neon **development** (`ep-restless-cell-ast7c1oq`), then reverted (F7) |
| 4 | `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | `https://dashboard.electius.com` |
| 5 | Stripe endpoint URL | `https://dashboard.electius.com/api/auth/stripe/webhook`, subscribed to exactly `checkout.session.completed` + `customer.subscription.{created,updated,deleted}`. **Never `invoice.payment_failed`** — it is unhandled, and subscribing to it suggests `past_due` is covered when it is not |
| 6 | The endpoint's `whsec_…` | must equal `STRIPE_WEBHOOK_SECRET`, and is **not** the value `stripe listen` prints locally. Redeploy after changing it |

**The cheapest first check after deploying** is the same junk-signature probe:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://dashboard.electius.com/api/auth/stripe/webhook \
  -H "stripe-signature: t=1,v1=junk" -H "content-type: application/json" \
  -d '{"id":"evt_probe","type":"ping"}'
```

**404 → 400 is the proof the plugin mounted** and the raw body reached the handler, before a single
real event is sent. Still 404 means one of the two keys did not take. Confirm `/hr/login` still
returns 200 in the same pass — that is the guard *not* firing.

---

## 8. Environment traps hit

- `npm run build` clobbers the `.next` a running dev server serves from (twelfth recorded
  occurrence), and a **stale `.next/dev/types/routes.d.ts` fails the build's own TypeScript step with
  a syntax error in a file nobody wrote**. `rm -rf .next` and rebuild.
- A backup file written as `_env.production.backup` was **not** covered by `.gitignore` (which
  matches `.env*`, not `_env*`) — a secrets file one `git add -A` from being committed. Deleted; the
  original values live as comments inside the gitignored `.env.production` instead.
- `git status --short --cached` is not a valid flag combination and aborts a `&&` chain silently
  mid-sequence. `git diff --cached --name-only`.
