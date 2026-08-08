# Pro Features Gating — `/upgrade` and pre-emptive locks

**Branch:** `feature/pro-features-gating` · **Version:** 0.9.23 (patch) · **Date:** 2026-08-08
**Spec:** `context/features/pro-features-gating-spec.md`
No migration, no schema change, no new entitlement, no new flag, no new dependency.

Every Pro feature was already **enforced** (entitlement-enforcement, v0.9.16). Almost none of them
**explained themselves**: a Free admin met a refusal at the moment of failure in language that named
no plan, or met no refusal at all because the gate lived in a headless job days later. This branch
is the upsell surface enforcement never got — plus the two silent-failure bugs that were sitting
underneath it.

---

## Findings index

Read these before touching the files. Three of them are not in the spec.

1. **`canUpgrade()` had to be invented.** The spec justifies passing `entitlement` instead of
   `voterCap: number` as "one prop covers three gates". The real reason is sharper: a *number cannot
   answer whether upgrading helps* — §4.
2. **`soon` beats `locked`, and that precedence is load-bearing.** `adminTurnoutReminder` is Pro
   *and* unbuilt. Letting `locked` win would sell a feature with no sender behind it — §5.2.
3. **The draft-save path had the same missing-branch bug as §7.2** and the spec only names the
   submit path. Both now share one `showError` — §6.2.
4. **The mutation harness produced five false positives before it produced any real result.** A
   lowercase drive letter in `cwd` made every test file load with "0 test", which reports as
   32 failures — indistinguishable from "mutation caught" — §9.
5. **`fetch()` is the wrong instrument for verifying a redirect.** It reported `/upgrade` rendering
   200 while a real navigation redirected correctly — §10.
6. **§10.7 is half-unverified and cannot be completed in this environment**: `STRIPE_WEBHOOK_SECRET`
   is empty, so the plugin does not mount at all — §11.

---

## 1. The route

`src/app/[locale]/(app)/upgrade/page.tsx` — server component inside the dashboard shell. Session and
org authz come free from `(app)/layout.tsx`.

**The guard is the resolver and nothing else:**

```ts
const { organizationId } = await requireSession();
const entitlement = await resolveEntitlement(null, organizationId);
if (entitlement.kind !== "free") redirect(`/${locale}/settings`);
```

No `BILLING_ENABLED` reference anywhere in this feature (spec D3). The flag is temporary and gets
deleted after incorporation; `resolveEntitlement` already short-circuits on it, so:

- while the flag is off, **every org resolves `pro`** → the route is unreachable and **no gate
  renders anywhere**. That is the requirement, achieved without a second switch.
- when the flag is deleted, this feature needs **zero edits**.

Redirect, not `notFound()`: the admin is legitimately signed in and their plan lives on `/settings`.

Registered in `DASHBOARD_ONLY_PATHS` (`src/lib/dashboard-paths.ts`). This is not optional — route
folders exist once in the tree, so an unregistered admin surface is served by the **apex host** too.
`dashboard-paths.test.ts` reads the `(app)` folders off disk and fails until it is listed; no new
test was needed.

Not a sidebar item — it is a gate destination, not navigation.

## 2. The extraction

`FreeState` moved out of `billing-card.tsx:219-355` into **`src/components/billing/pro-upsell.tsx`**
as `ProUpsell`. `/settings` renders it for its `free` state; rendering is unchanged.

`prelaunch` and `pro` **did not move** — their Stripe CTAs were verified against real test-mode
Checkout in stripe phase 2, and a refactor is not a reason to re-open that.

`PRICE` and `fail()` are exported from `pro-upsell.tsx` and imported by `billing-card.tsx`. Import
direction is one-way (card → upsell), so there is no cycle and no new shared module for two values.

### Return URLs

`ProUpsell` takes `{ organizationId, cancelPath }` and resolves internally:

| URL | Value | Why |
| --- | --- | --- |
| `successUrl` | `/{locale}/settings?checkout=success` — **always**, from both callers | The verified processing banner lives there. A fresh subscriber returned to an upsell page is the wrong screen, and once the webhook lands the §1 guard would bounce them anyway. |
| `cancelUrl` | `/{locale}` + `cancelPath` | Abandoning Checkout returns you where you started, `?feature=` included. |

`cancelPath` carries the **sanitised** key, never the raw query param — Stripe never receives a URL
assembled from user input.

## 3. The `?feature=` contract

`src/lib/upgrade-context.ts` — pure, client-safe, unit-tested.

```
liveResults · voterReminder24h · voterCap · brandedReports · archiveRetention
```

Five values for six gate sites: both voter-cap sites share `voterCap` because the gate and the copy
are identical. Unknown / absent / repeated (`?feature=a&feature=b` arrives as an array) → `generic`.
A link gets pasted, bookmarked and hand-typed; a purchase destination must not 500 on a typo.

`upgradeHref(feature)` is the only place the URL is built, so the param a gate sends and the key the
page reads cannot drift — the type rejects a value with no header.

## 4. `canUpgrade` — the predicate the spec does not name

Added to `src/lib/entitlements.ts` beside the existing exhaustive switches:

```ts
export function canUpgrade(e: Entitlement): boolean   // free → true, pro/purchased → false
export function canUseAutoReminders(e: Entitlement): boolean
```

`nearCap` fires at 80 % of *whatever the cap is*. A Pro org at 480/500 trips it exactly like a Free
org at 42/50 — so an unconditional upsell link **sells Pro to a Pro customer**. Every link in this
feature hangs on `canUpgrade`, never on the limit being reached.

This is the actual reason the client needs `entitlement` and not `voterCap: number`: the number
cannot answer "is there a plan above this one".

`canUseAutoReminders` exists because the same rule is now read by three parties — the wizard (locked
switch), `createElection` (trust boundary) and the cron sweep. The sweep was inlining
`kind === "free"`; it now calls the shared helper (invariant #5).

## 5. The six gates

Every gate derives from `resolveEntitlement`. **None reads `isPro` and none reads `BILLING_ENABLED`.**

| # | Site | Feature | Tab |
| --- | --- | --- | --- |
| 1 | Wizard step 4 — live results | `liveResults` | new |
| 2 | Wizard step 4 — 24 h reminders | `voterReminder24h` | new |
| 3 | Wizard step 3 — over-cap block + 80 % hint | `voterCap` | new |
| 4 | Voter roster 80 % hint · add-voters refusal + hint | `voterCap` | roster same / dialog new |
| 5 | Report preview — branded PDF note | `brandedReports` | same |
| 6 | `/archive` — retention line | `archiveRetention` | same |

`ElectionWizard` / `VoterRoster` / `AddVotersDialog` now take **`entitlement: Entitlement`** instead
of `voterCap: number` and derive with the pure helpers. `entitlements.ts` is deliberately not
`server-only` for exactly this — `Entitlement` is a discriminated union of primitives and crosses
the boundary as-is.

### 5.1 New tab, and where it does not apply

Wizard state is client-only with no persistence, and drafts cannot be reopened in the wizard (edit
mode is unbuilt), so navigating away destroys a half-built election and any imported CSV. Gates 1–3
therefore open `/upgrade` in a new tab.

**Deviation:** the spec puts the add-voters dialog in the same-tab group with the roster ("no
in-progress state worth protecting"). That is true of the roster and false of the dialog, which can
hold a 300-row CSV import. The dialog opens a new tab; the roster hint does not.

### 5.2 `locked` is not `soon`

`soon` = not built. `locked` = built, not yours yet. Different badge, different copy, and **`soon`
takes precedence**: `adminTurnoutReminder` carries both flags, and offering to sell it would
advertise a feature with no sender behind it. Its row therefore stays exactly as v0.9.21 shipped it
— inert, explained, and with **zero focusable elements**.

`lockedFeature(key)` returns the `UpgradeFeature` or `null` rather than a boolean, so the href is
built from the same value that decided the lock.

## 6. Server enforcement this dragged in

Pre-emptive locks hide controls; the payload still comes from the client, so the action remains the
trust boundary.

### 6.1 `voterReminder24h` was never checked at create time

`create-election.ts` gated `liveResults` and the voter cap and **not** this. The only enforcement
was the cron sweep. Consequence: a Free admin enabled the toggle, it persisted, the election
overview reported the reminder as enabled, and 24 h before close nothing was sent — no error, no
signal, days later, in a headless job with no session.

The check sits beside the `liveResults` one and **outside `if (!draft)`**: a draft is not a bypass,
it only defers the same state to the moment the election starts.

### 6.2 `liveResultsLocked` had no UI — and neither path had it

The action returned `{ error: "liveResultsLocked" }` with no catalog key and no wizard branch, so it
fell through to `errors.createFailed` ("something went wrong"), naming no field and no plan.

Both refusals now have keys and a branch that **jumps back to step 4**, so the message stands next
to the control that caused it (the `voterCap` branch already does this for step 3).

Beyond the spec: the branch logic moved into a shared `showError(res)` used by **both** `submit()`
and `saveDraft()`. Because the guards live outside `if (!draft)`, draft-save can hit them too, and
it was falling into the generic error in exactly the way §7.2 describes for submit.

Both bugs are invisible today (the flag makes everyone Pro) and become user-visible the day billing
is switched on.

## 7. Accessibility

This codebase has now paid for the same lesson four times — the gated language option, the
customizations card, the admin-turnout row, and here.

- The drawn switch is `aria-hidden`. **Nothing gets `aria-disabled`** — it announces the control as
  inoperable, so a screen reader says "dimmed" and the reason is never read.
- The explanation lives in the row text **unconditionally**, never hover-only: an inert switch is
  not focusable, so a keyboard user could never reach a tooltip and touch has no hover.
- The link is the row's only focusable element, which is what makes the explanation reachable.
- Locked rows keep full contrast. Dimming the depiction is fine; dimming the explanation is not.

Verified, not assumed: locked rows expose exactly **one** focusable element (the link) and **zero**
`aria-disabled` attributes; the `soon` row exposes zero focusable elements.

## 8. i18n

New `dashboard.upgrade` namespace (contextual headers + gate copy) and two new
`dashboard.wizard.errors` keys, both locales.

The voter-cap header takes `{free}` / `{pro}` from `FREE_VOTER_CAP` / `PRO_VOTER_CAP` rather than
hardcoding 50/500 in a translation — a number in a catalog drifts from the guard that enforces it.
Messages without those placeholders simply ignore the extra values.

Plan content (prices, feature lines) still comes from `marketing.pricing.*` through `ProUpsell`, so
prices stay single-sourced across the landing page, `/settings` and `/upgrade`.

Catalogs injected behind the **byte-identical round-trip guard**: the script aborts unless
parse → serialise reproduces the CRLF file exactly. Result: **37-line diffs** instead of the ~2 500
a stray LF rewrite produces. Reuse that guard for any catalog edit.

## 9. Tests

**554 passing (+11).** Scope is `src/actions/` and `src/lib/` only (invariant #8).

- `upgrade-context.test.ts` — each of the five params → its key; unknown / empty / absent / array →
  generic; `constructor` and `toString` → generic (the mapping uses `includes` over an array, not
  `key in map`, so nothing is inherited from `Object.prototype`); `upgradeHref` round-trips back
  through `upgradeContextKey`.
- `create-election.test.ts` — Free + `voterReminder24h` refused with the **Prisma mock never
  called**; Pro accepted and the column written; refusal holds for `draft: true`.

### Mutation check

All five mutations turn **named** tests red, 1–2 each, never the whole suite:

| Mutation | Fails |
| --- | --- |
| remove the `voterReminder24h` guard | 2 named `automatski podsjetnici` cases |
| `canUseAutoReminders` returns true for Free | the same 2 |
| `upgradeContextKey` passes unknown params through | 2 named `upgradeContextKey` cases |
| array param takes `[0]` instead of being rejected | the repeated-param case |
| `/upgrade` dropped from `DASHBOARD_ONLY_PATHS` | `covers every (app) route folder` |

⚠ **The harness lied first.** Passing `cwd: "c:/Users/..."` (lowercase drive letter) to `spawnSync`
broke vitest's alias resolution: every test file loaded with **"0 test"** and the run reported 32
failures — which reads exactly like "mutation caught". Use `process.cwd()`. And assert the search
string was *found* before writing: this repo has CRLF files, and a multi-line `\n` pattern silently
matches nothing, which also looks like a mutation no test caught.

## 10. Verified in the browser

`BILLING_ENABLED=true` + demo admin `isPro=false`, then both restored and confirmed by SQL.

- `/upgrade`: all five params render their own header; `prioritySupport` / `constructor` / absent →
  generic; the voter-cap header reads "50 … 500" from the constants.
- **Pro org redirects to `/settings`**, and so does **flag-off** (the production state) — both
  locales.
- Apex `/hr/upgrade?feature=voterCap` → 307 to the dashboard host with locale **and** query intact;
  bare `/upgrade` → default locale; no session → `/hr/login`.
- Wizard step 4 on Free: both locked rows inert, **1 focusable element each** (the link), **0
  `aria-disabled` anywhere**, `target="_blank" rel="noopener noreferrer"`; the `soon` row has 0
  focusable elements and no link; quorum keeps a real `switch`.
- Clicking the cap link opened a new tab **and the original tab kept all 51 staged voters** and its
  cap block.
- Step 3 over-cap: "Vaš plan dopušta najviše 50 birača … a popis ih ima 51" + link.
- Roster (350-voter election): "Iskorišteno 350 od 50 birača · Saznajte više", same tab.
- Report preview: note `display: block`, 45 px on screen · **`display: none`, 0 px under
  `emulateMedia({ media: "print" })`**. It cannot reach the stored PDF.
- `/archive`: retention line present on Free in hr **and** en with locale-correct hrefs; absent on
  Pro and absent with the flag off.
- Checkout payload from `/upgrade`: `successUrl: /hr/settings?checkout=success`,
  `cancelUrl: /hr/upgrade?feature=voterCap`, `referenceId` = organizationId, **no price**.
- `/en` complete. Zero application console errors (the ChunkLoadErrors are Turbopack HMR noise).

**Use navigation, not `fetch()`, to verify a redirect.** An in-page `fetch('/hr/upgrade')` reported
200 and `landedOn: /hr/upgrade` while a real `page.goto` redirected to `/hr/settings` correctly.
Related: do not grep `document.body.textContent` to prove a block is *absent* — next-intl serialises
the whole catalog into the RSC payload, so every string is in the DOM as script content whether it
rendered or not. Use element queries or the a11y tree.

## 11. Not verified

- **The second half of §10.7 — a real Checkout round trip.** `STRIPE_WEBHOOK_SECRET` is empty in
  `.env.development`, so `stripeConfigured` is false, the `@better-auth/stripe` plugin does not
  mount and `/api/auth/subscription/upgrade` 404s. That is correct phase-2 behaviour, not a
  regression. The payload the client sends *is* verified (above); landing on
  `/settings?checkout=success` after paying is not. To close it locally:
  `stripe listen --forward-to localhost:3000/api/auth/stripe/webhook` and paste the printed
  `whsec_…`.
- **A `purchased` entitlement anywhere.** The branch exists in every switch and has no producer.

## 12. Deviations from the spec

1. **§6.5 placement.** The branded-PDF note lives in the report **page** (`print:hidden`, above the
   sheet), not the topbar band. The spec's stated reason for the topbar is print-safety, which
   `print:hidden` gives either way; putting it in the topbar means resolving entitlement in
   `elections/[id]/layout.tsx`, which also serves overview/results/voters — an extra query on three
   unrelated pages plus a boolean threaded through a 500-line client component. Moving it is a
   small follow-up if the placement matters more than the cost.
2. **§6.4 tab behaviour** for the add-voters dialog — see §5.1.
3. **`showError` covers `saveDraft` too** — see §6.2. Strictly more than the spec asks for, and the
   same bug class.

## 13. Open items (not this branch)

- `.env.development` declares `STRIPE_PRICE_ID_MONTHLY` / `_YEARLY`, while `src/lib/billing.ts`
  reads `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY`. Inert while `BILLING_ENABLED=false`, but
  `requiredPriceId` **throws** at the first real checkout. Pre-existing; flagged again here.
- An org already over the Free cap renders "Iskorišteno 350 od 50 birača", which is honest but
  reads oddly. Reachable only on downgrade or a flag flip over existing data; the copy predates
  this branch.
- **`BILLING_ENABLED` removal** is its own post-incorporation refactor. Nothing here blocks it.
