# Settings Phase 7 — Plan & Billing (UI)

**Branch:** `feature/settings-phase-7` · **Version:** 0.9.12 → **0.9.13** (patch)
**Spec:** `context/features/profile-settings-phase-7-spec.md` (re-scoped to UI-only on 2026-08-05)
**Design:** `Settings.dc.html` § "Plan & billing" — both states + cancel modal

The last of the seven settings cards. `/settings` now renders **Accessibility → Plan & billing →
Dashboard customizations → Data export → Account management**, closing the `ponytail:` reorder marker
phase 3 left in the page.

> **This phase calls no Stripe API, writes no entitlement and moves no money.** The four CTAs are
> named seams that `stripe-integration-phase-2-spec.md` §2 fills. No new dependency, no schema
> change, no server action, no new query.

---

## 1. Three states, and which one you actually see

`BillingState` is a discriminated union computed in `(app)/settings/page.tsx`:

```ts
type BillingState =
  | { kind: "prelaunch" }
  | { kind: "free" }
  | { kind: "pro"; subscription: { status; renewsAt; cycle } | null };
```

| State | When | What renders |
| --- | --- | --- |
| **prelaunch** | `BILLING_ENABLED !== "true"` | "Beta" chip, one line, a button opening the plans modal. **No limits grid, no Pro panel, no Upgrade button.** |
| **free** | billing on, `isPro === false` | 4-row limits grid + navy Electius Pro panel (cycle toggle, 6-line feature grid, trial line, Upgrade CTA) |
| **pro** | billing on, `isPro === true` | price + status line, Switch to yearly (monthly only), Manage billing, Cancel + confirm modal |

**In production today only `prelaunch` is reachable.** `BILLING_ENABLED` is unset, and nothing writes
`isPro` anyway. Free and Pro were built and verified against fixtures rather than deferred — building
them later, against a live paywall, is strictly harder.

### Why prelaunch exists at all

Two rules from the spec, each learned expensively elsewhere in this product:

1. **Never render the Free state while nothing is enforced.** It would tell an admin they are capped
   at 50 voters while the product hands them 500 — the same class of false claim as the PDF report's
   audit note (softened, D3 2026-07-28) and the marketing Proof section (commented out, 2026-08-03).
2. **Never render a disabled Upgrade button.** A dead purchase CTA reads as a broken product rather
   than an unfinished one, and it still makes the offer.

---

## 2. `BILLING_ENABLED`

```ts
// (app)/settings/page.tsx
const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
```

`=== "true"`, never `!== "false"`: absence, a typo, and an unset Vercel variable must all mean
*everyone is Pro*, which is the legally safe posture while there is no registered entity
(`context/pre-incorporation-billing-spec.md` §3). This is the inverse of `EMAIL_VERIFICATION_ENABLED`,
where the strict path is the safe one.

**It is read here, not in `src/lib/entitlements.ts` — that module does not exist yet.** It arrives
with `stripe-integration-phase-1-spec.md` §5, and folding this in is a one-call-site move. Marked
`ponytail:` at the declaration.

---

## 3. The CTA contract

Four handlers, each a **separately named function** whose body is currently one `toast(t("comingSoon"))`
and whose comment names the phase-2 call it becomes. Phase 2 replaces four bodies and touches no JSX.

| CTA | Becomes | Then |
| --- | --- | --- |
| `upgrade()` | `createCheckoutSession(cycle)` | redirect |
| `switchYearly()` | `createPortalSession()` | redirect |
| `manageBilling()` | `createPortalSession()` | redirect |
| `cancelSubscription()` | `cancelSubscription()` | toast + `router.refresh()` |

### Three constraints built in now, not inherited later

1. **The client sends a cycle, never a price.** `cycle` is `"monthly" | "yearly"` local state; the
   server picks the price ID from env. A card that posts an amount is a card that can be tampered
   into a €0 subscription. It is a *UI* constraint precisely because the UI is what would leak it.
2. **The success redirect never flips entitlement.** `?checkout=success` renders a **processing
   banner** (spinner + "Aktiviramo Pro"), read via `useSearchParams()`. `isPro` changes only through a
   verified webhook. `ponytail:` no polling — phase 2 owns the refresh.
3. **No card data touches our servers.** Checkout and Portal are redirects. No payment form, no
   proration UI — that is what keeps this product at SAQ A.

---

## 4. Prices and dates go through `next-intl`, never the catalog

Amounts live in code, not in the translation files:

```ts
const PRICE = { monthly: 9, yearly: 86, yearlyPerMonth: 7.2 } as const;
```

They are rendered with `useFormatter().number(v, { style: "currency", currency: "EUR" })`, so a
hardcoded `€` glyph never enters a translation. The output matches both the design and the existing
marketing catalog strings exactly:

| | hr | en |
| --- | --- | --- |
| monthly | `9 €` | `€9` |
| yearly | `86 €` | `€86` |
| per-month equivalent | `7,20 €` | `€7.20` |
| renewal date | `17. kolovoza 2026.` | `August 17, 2026` |

Dates are formatted with `timeZone: "UTC"` — the card is a client component, and without a pinned zone
the server and browser can disagree and React reports a hydration mismatch.

### The Croatian punctuation bug this surfaced

The first render produced **`Obnavlja se 17. kolovoza 2026..`** — a Croatian long date carries its own
trailing period (the ordinal marker), so the catalog's sentence period doubled it. English has no such
period and was fine.

Fixed by removing the sentence period from the three **hr** strings where `{date}` is sentence-final
(`pro.renews`, `pro.trialing`, `cancelModal.body`). `pro.canceling` and `pro.cancelsChip` place the
date mid-sentence and were already correct.

**Carry-forward:** any new hr string ending in `{date}` must not add its own period. This is exactly
why the punctuation lives in the catalog and not in the component.

---

## 5. The plans modal — one source of prices for two surfaces

The pre-launch line opens a modal showing the **real pricing cards from the landing page**, not a
link to `/#pricing`.

`src/components/marketing/plan-cards.tsx` is new and exports two components extracted from
`pricing-plans.tsx`:

- **`PlanCards({ yearly, showCta })`** — the Free and Pro cards plus the shared `Bullets` renderer
- **`BillingToggle({ yearly, onChange })`** — the segmented monthly/yearly control

`pricing-plans.tsx` lost 127 lines and now composes them; it renders identically (regression-verified:
2 signup CTAs with unchanged labels, working toggle, 13 comparison rows, no overflow).

**`showCta={false}` in the modal, and that is not cosmetic.** The marketing CTAs point at
`signUpUrl()`. Reusing the cards inside `/settings` would show "Sign up free" to an admin who is
already signed in — and, with billing off, a purchase CTA that cannot be honoured. It is the same
dead-CTA rule as §1, appearing in a new place because of the reuse.

All modal copy comes from `marketing.pricing.*`: title, subtitle, the beta notice and the footnote.
Prices are written once and both surfaces read them, so they cannot drift.

Both modals use the installed `@base-ui/react` `Dialog` — focus trap, Esc and backdrop dismissal come
from the library, matching `account-management-card.tsx`.

---

## 6. The Pro feature grid — decision D1, and what it cost

The spec recommended **trimming** the grid to the four features that exist. **The user chose to ship
it as drawn**, on reasoning that holds: the public pricing page already advertises the same lines, so
trimming only the settings card would make two surfaces disagree without making either true.

The shipped grid is **six** lines, matching `marketing.pricing.pro.features` exactly:

| Line | Real? |
| --- | --- |
| 500 voters per election | counted everywhere; **the gate** belongs to `entitlement-enforcement-spec.md` |
| Live results during voting | ❌ **nothing writes `Election.resultsMode`** |
| Automatic 24-hour voter reminders | ❌ flag stored and displayed; **no job sends it** |
| Organization-branded PDF reports | ✅ `election-report.tsx` branches on `logoUrl` |
| Unlimited archive retention | ✅ `Archive.expiresAt` stamped at seal time |
| Priority support | ✅ a promise, not a code path |

Six, not the seven the spec's §2.3 table lists: **admin turnout emails** appears on neither the design
nor the public pricing page, so including it would have been a *new* promise rather than a
transcription of an existing one.

**Abstain and quorum are absent by rule** — both are Free on every tier and permanently un-gateable
(`project-paywall-spec.md` §3). So are the design's dead rows: "Up to 2 active elections" (the
concurrency cap was dropped 2026-08-03), "Unlimited voters", "Unlimited active elections", and the
pay-per-election pointer (out of MVP).

### The obligation this creates

`context/features/pro-features-implementation-spec.md` — new, and registered as **launch blocker L2**
in `future-updates-spec.md`. It specifies all three unbuilt features and states the rule plainly:
before `BILLING_ENABLED=true`, each advertised line must either ship or come out of all three places
that advertise it.

**That spec also records a live bug it uncovered while tracing `resultsMode`:**

| Column | Written by | Read by |
| --- | --- | --- |
| `resultsVisible` | **nothing** (only `duplicateElection` copies it) | the public `/results/[id]` page — `notFound()` when false |
| `resultsMode` | **nothing** (same) | `resultsAccess()` — the live-vs-sealed split |
| `sealedResults` | **the wizard**, step 4 | **nothing at all** |

So: the public results page is unreachable for every wizard-created election, and the wizard's one
results toggle writes a column no code reads. Do not add a `resultsMode` control until that model is
settled — it is one enum's worth of design, not three booleans.

---

## 7. The cancel modal

Copy states what a downgrade actually does:

> You keep Pro until **{date}**. After that, new elections follow Free limits (50 voters per
> election), and full audit proofs older than a year are pruned — **your election records, results and
> reports are kept.**

**There is no archive clawback.** The old "keep only the 10 most recent archives" rule deleted rows and
was removed 2026-08-03; the drawn design still contains it and was **not** followed. A comment at the
copy says so. If this string is ever reworded, it must not acquire a deletion claim — verified in the
browser by asserting the rendered text matches no deletion vocabulary.

---

## 8. Page integration

- Card mounted **second**, resolving phase 3's `ponytail:` marker.
- **Reuses the existing `{ isPro, stripeSubscriptionId }` read** at `page.tsx:23` — same page load,
  same columns, no second query.
- **`subscriptionBlocks()` and the phase-4 delete gate were not touched.** Changing a destructive
  surface inside a billing diff is how a reviewer stops being able to review either.
- `SettingsCard`'s `headerAside` (the plan chip) and `bodyClassName` — both added in phase 3 *for this
  card* — are used rather than forked.

### Why `subscription` is nullable

`renewsAt` and `cycle` come from a live `subscriptions.retrieve`, which is phase 2. Rather than invent
a placeholder date, `subscription` is `null` until phase 2 supplies it: a Pro user with no Stripe data
sees **"Pro je aktivan."** with no price and no date, and the cancel modal falls back to
`cancelModal.bodyNoDate` ("until the end of your current billing period").

A fabricated renewal date shown to a paying customer is precisely the class of falsehood this card is
otherwise careful about. The date formatting is still fully built — it was verified against fixtures,
and it lights up the moment phase 2 lands.

---

## 9. Files

| File | Change |
| --- | --- |
| `src/components/settings/billing-card.tsx` | **new** — the card, three states, both modals, four CTA stubs |
| `src/components/marketing/plan-cards.tsx` | **new** — `PlanCards` + `BillingToggle`, shared by the landing page and the modal |
| `src/components/marketing/pricing-plans.tsx` | −127 lines; composes the extracted components |
| `src/app/[locale]/(app)/settings/page.tsx` | `BILLING_ENABLED`, `billingState`, card mounted second |
| `messages/{hr,en}.json` | `dashboard.settings.billing` namespace |
| `package.json` / `package-lock.json` | 0.9.13 |

**No tests added — 430/430 unchanged.** This phase adds no server action and no `src/lib/` module, and
Vitest scope is `src/actions/` + `src/lib/` only (invariant #8). Every derivation it renders is
already pinned elsewhere.

Catalogs were injected by a script that **aborts unless a parse → serialise round trip reproduces each
CRLF file byte-for-byte first** — 64-line diffs instead of the ~900-line whole-file rewrite a stray LF
produces. Reuse that guard for any catalog edit.

---

## 10. Verification

`npm run lint` · `npx tsc --noEmit` · `npm run test` (430/430) · `npm run build` (44 routes) — all
clean. Browser pass hr + en, **0 console errors**.

| # | Check | Result |
| --- | --- | --- |
| 1 | Pre-launch: Beta chip, no limits grid, no Upgrade button | ✅ |
| 2 | Plans modal: both real cards, toggle, close, **0 signup CTAs** | ✅ |
| 3 | Free: 4 limits, **no** "2 active elections", archive row says *proof* kept 1 year | ✅ |
| 4 | Toggle switches **both** price and cycle note (`9 €` ⇄ `86 €` + note) | ✅ |
| 5 | Grid = 6 lines, **no abstain, no quorum** | ✅ |
| 6 | Pro `active` / `trialing` / `canceling` / `yearly` via fixture | ✅ |
| 7 | `canceling` → amber text `#B45309` + amber chip `#FFFBEB`; Switch **and** Cancel hidden | ✅ |
| 8 | Switch to yearly appears only for a monthly subscription | ✅ |
| 9 | Cancel modal: **no deletion claim**, confirm fires the stub and closes | ✅ |
| 10 | All four CTAs toast; **none navigates** | ✅ |
| 11 | `?checkout=success` → processing banner with labelled spinner | ✅ |
| 12 | Card sits **second** (Pristupačnost → Plan i naplata → Prilagodbe → Izvoz → Račun) | ✅ |
| 13 | 390px: zero overflowing elements, page does not scroll horizontally | ✅ |
| 14 | Marketing `#pricing` unchanged after the extraction | ✅ |
| 15 | Fixtures restored — `isPro` back to `true`, `BILLING_ENABLED` removed, temp script deleted | ✅ |

### Not verified live (recorded, not implied)

- A **real** Stripe round trip — there is none in this phase by design.
- The Pro state reached through a *real* entitlement write: nothing writes `isPro`, so it was reached
  by flipping the column on the seeded admin and restoring it afterwards.
- `bodyNoDate` in the cancel modal renders only when `subscription === null`, which the fixtures
  exercised; it was not seen against a real Stripe null.

### Environment notes

- **`npm run build` clobbers the `.next` a running dev server is serving from** (tenth occurrence).
  Kill by PID via `Get-NetTCPConnection -LocalPort 3000`, `rm -rf .next`, restart.
- Playwright's actionability check flakes on this codebase's toggle buttons — drive them with
  `page.evaluate(el => el.click())`.
- Reading state straight after a synthetic click returns the **pre-render** value; re-read on a later
  tick or React has not committed yet.

---

## 11. Open next

- **`stripe-integration-phase-1-spec.md`** — SDK singleton, env guard, `src/lib/entitlements.ts`
  (which absorbs the `BILLING_ENABLED` read in §2).
- **`stripe-integration-phase-2-spec.md`** — fills the four CTA bodies, the webhook, the live
  `subscriptions.retrieve` that makes `subscription` non-null.
- **`pro-features-implementation-spec.md`** — launch blocker L2, and the `resultsVisible` /
  `sealedResults` bug in §6.
