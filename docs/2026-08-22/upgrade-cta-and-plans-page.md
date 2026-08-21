# Upgrade CTA + `/upgrade` Plan Cards

A permanently visible way for a Free organization to reach Pro: an **Upgrade button in the dashboard
top bar**, and an `/upgrade` page that now shows the **same plan cards the marketing homepage
shows** instead of the `/settings` upsell panel. Clicking Upgrade there opens Stripe Checkout.

Inline request (no spec file). Branch `feature/upgrade-cta`, **v0.9.31**.

No migration, no schema change, no new dependency, no new server action, no new route — `/upgrade`
already existed (v0.9.23).

---

## Findings index

1. [`!showPro` is the trap — the button and the page must share ONE expression](#1-the-visibility-predicate)
2. [`/upgrade` already existed; only its body changed](#2-what-actually-changed-on-upgrade)
3. [`PlanCards` gained three props rather than a second copy](#3-plancards-reuse)
4. [The checkout call was extracted — one money path, two surfaces](#4-one-money-path)
5. ["Uskoro" contradicted the Checkout button beside it](#5-the-uskoro-contradiction)
6. [Why the Free card needed a slot at all](#6-why-freecta-exists)
7. [Verification — three entitlement states](#7-verification)
8. [What to know before touching this](#8-ceilings-and-gotchas)

---

## 1. The visibility predicate

**The rule: the button's visibility and the page's guard are the same expression.** Anything else
eventually produces a button that leads to a redirect.

`/upgrade` guards itself with `entitlement.kind !== "free" → redirect("/settings")`. So the button
hangs on `canUpgrade()`, whose comment in `entitlements.ts:92` had already anticipated exactly this:

> *"Zato svaka poveznica na /upgrade visi o ovome"* — every link to /upgrade hangs on this.

New helper, deliberately beside `showProBadge` in the module that owns entitlement rules:

```ts
// src/lib/services/entitlement.service.ts
export async function showUpgradeCta(organizationId: string): Promise<boolean> {
  return canUpgrade(await resolveEntitlement(null, organizationId));
}
```

### The trap that was avoided

`ShellUser` already carries `showPro`, so `!user.showPro` looks like a free answer. **It is wrong.**
`showProBadge` returns `false` for *everyone* while `BILLING_ENABLED` is off:

```ts
export async function showProBadge(organizationId: string): Promise<boolean> {
  if (!BILLING_ENABLED) return false;              // ← today, for every account
  return (await resolveEntitlement(null, organizationId)).kind !== "free";
}
```

So `!showPro` would render "Upgrade" on **every** dashboard in production today — including accounts
`/upgrade` immediately redirects away from. The two flags answer different questions and move
independently; a Pro org shows the badge *and* hides the button, from one resolver call each.

`showUpgradeCta` reads **no** `BILLING_ENABLED` of its own — `resolveEntitlement` already
short-circuits to `pro` when the flag is off, so the button disappears for free. Same reasoning the
`/upgrade` page itself records.

### Wiring

`(app)/layout.tsx` adds one **named** field to the existing explicit projection (never a spread —
TS does not strip runtime keys, and that projection is what keeps `email`/`isPro` out of the RSC
payload):

```ts
const shellUser = {
  name: user.name,
  image: user.image,
  organization: user.organization,
  showPro:    await showProBadge(organizationId),
  canUpgrade: await showUpgradeCta(organizationId),
};
```

> **Cost, stated:** that is two `resolveEntitlement` calls per dashboard page load. Both
> short-circuit to zero queries while `BILLING_ENABLED` is off, so today it is free; once billing is
> on it is one extra indexed `findFirst`. Wrapping `resolveEntitlement` in `cache()` is the fix if
> that ever matters — deliberately not done here, to keep a billing-adjacent service unchanged.

The button lives in `dashboard-shell.tsx`, right cluster, before the bell. `Link` from
`@/i18n/navigation`, so the href is locale-aware (`/hr/upgrade`, `/en/upgrade`).

---

## 2. What actually changed on `/upgrade`

The route was **not created** — it shipped with `pro-features-gating` (v0.9.23), including its
`?feature=` contextual header, its `upgradeContextKey()` sanitization and its entitlement guard.
All of that is untouched.

What changed is the body:

| Before | After |
| --- | --- |
| `<ProUpsell>` — the `/settings` free-state panel (limits grid + navy panel + its own cycle toggle) | `<UpgradePlans>` — `BillingToggle` + `PlanCards`, the homepage pricing cards |

`ProUpsell` still serves `/settings`; nothing was deleted. The header comment on that file was
updated, because it used to claim `/upgrade` as a consumer and no longer does.

New files, both small:

- `src/components/billing/upgrade-plans.tsx` — owns the cycle state, composes the shared cards
- `src/components/billing/use-upgrade-checkout.ts` — the shared Checkout call (§4)

---

## 3. `PlanCards` reuse

The cards were reused, not rewritten: **one source of prices, three surfaces** (marketing
`#pricing`, the `/settings` plans modal, `/upgrade`). A second copy drifts the first time a price
changes, on surfaces that both claim the same offer.

Three optional props were added. Each is one decision, and each defaults to today's behaviour, so
the two existing call sites render byte-identically.

```ts
showCta?:  boolean;          // the marketing signup anchors (already existed)
freeCta?:  React.ReactNode;  // replaces the Free card's action
proCta?:   React.ReactNode;  // replaces the Pro card's action
proBadge?: boolean;          // the "Uskoro" chip — see §5
```

Rendering falls back rather than branching:

```tsx
{proCta ?? (showCta && <a href={signUpUrl()}>…</a>)}
```

`showCta={false}` is what `/upgrade` passes — **the marketing CTAs point at `signUpUrl()`**, which
would offer signup to an already-signed-in admin *and* a purchase the page is about to offer
properly. Verified: 0 signup links reach the dashboard.

The slots are deliberately **layout-free** (the caller supplies its own spacing), matching the
`SettingsCard.headerAside` precedent.

---

## 4. One money path

Both `/settings` and `/upgrade` now start a first-purchase Checkout. Rather than two copies of a
Stripe call, the call moved into `useUpgradeCheckout({ organizationId, cancelPath })`.

The properties that must not drift are exactly why it is shared:

- the client sends a **cycle, never a price** (a card that posts an amount can be tampered into a €0 subscription)
- `successUrl` is **always** `/{locale}/settings?checkout=success` — the verified "processing" banner lives there, and `/upgrade` would reject a fresh subscriber the moment the webhook lands
- `cancelUrl` carries the **sanitized** `?feature=` key back, so Stripe never receives a URL assembled from user input
- `pending` is deliberately **not** cleared on success — success means redirect, so the button stays locked until the page leaves

`fail()` moved into the same file (it belongs with "call Stripe, show a localized error"); the
import in `billing-card.tsx` was updated. `PRICE` stays in `pro-upsell.tsx`.

**Not covered on purpose:** `ProState.switchYearly` in `billing-card.tsx`. That call carries
`subscriptionId`, without which the plugin opens a *second* subscription and bills twice. Different
question, different call, left exactly where it was verified.

File lives under `components/billing/`, not `src/lib/` — `src/lib/` is the unit-tested surface
(invariant #8), and a hook needing a React render cannot execute under the node test environment.

---

## 5. The "Uskoro" contradiction

Caught in the browser pass, not in code review.

`marketing.pricing.pro.badge` is **"Uskoro" / "Coming soon"** — honest on the homepage, where
billing is prelaunch. But `/upgrade` only renders when billing is *live* (otherwise the resolver
returns `pro` and the page redirects). So the badge was sitting directly above a button that opens
Stripe Checkout — the card contradicting the control beside it.

Hence `proBadge`, defaulting to `true`, with `/upgrade` passing `false`. Marketing keeps the badge;
the page that can actually sell does not claim the plan is unavailable.

---

## 6. Why `freeCta` exists

Not decoration. With `showCta={false}` the Free card had no action block while the Pro card did, so
the two bullet lists started ~68px apart in a side-by-side grid.

The fix doubles as content the page otherwise never states — **which plan you are on**:

```tsx
freeCta={<div className="mb-7 flex min-h-12 items-center justify-center …">
  {t("currentPlan")}   // "Vaš trenutačni plan" / "Your current plan"
</div>}
```

Measured after: first bullet of each card at `y = 599`, **delta 0**.

`min-h-12` matches the Pro button, so the alignment holds if either label wraps.

---

## 7. Verification

`npm run lint` · `npx tsc --noEmit` · **651 tests** · `npm run build` — all clean.
Browser pass hr + en, **0 console errors**.

Driven with a throwaway pre-verified admin on its own organization (the seeded `demo@electius.com`
credentials in `.env.development` no longer match the DB — a drift first recorded 2026-08-08 and
still true). Fixture destroyed afterwards.

### The three entitlement states

| State | Top-bar button | `/upgrade` | Sidebar |
| --- | --- | --- | --- |
| `BILLING_ENABLED` unset — **production today** | hidden | redirects to `/settings` | Beta |
| Billing on + Free org | **shown** | renders, Checkout reaches `checkout.stripe.com` | Beta |
| Billing on + Pro org | hidden | redirects to `/settings` | **PRO** |

The third row is the one that proves the design: button and badge move in **opposite** directions
off the same resolver, and the button never survives into a state the page rejects.

### Checkout session, read back from Stripe

```
client_reference_id : cmt3jp5gl…      ← the ORGANIZATION id, not the user id
metadata.referenceId: cmt3jp5gl…      (metadata.userId recorded separately)
cancel_url          : …/hr/upgrade    ← returns to the same page
success_url         : …/hr/settings?checkout=success
locale              : hr
amount_total        : 0               ← 14-day trial, no card requested
```

### Also asserted

- `?feature=bogus<script>` → falls back to the generic header (sanitization intact)
- `/settings` free state unchanged after the hook refactor, and its `cancel_url` is `/hr/settings` — proving `cancelPath` still distinguishes the two surfaces
- marketing `#pricing` unregressed: **2** signup CTAs, "Uskoro" shown, **13** comparison rows, no `Vaš trenutačni plan` leak
- `/en` complete, no Croatian leftovers; top-bar href `/en/upgrade`
- 390px with a two-part breadcrumb: no page overflow, no header overflow, label fully visible

---

## 8. Ceilings and gotchas

**The button is invisible in dev and production right now.** `BILLING_ENABLED` is unset, so every
org resolves `pro`. This is correct, not a bug — but it is the first thing that will look wrong. To
see it locally: `BILLING_ENABLED=true` with `isPro` false on your admin.

**`docs`/catalog edits need the round-trip guard.** `messages/*.json` are CRLF. Keys were injected by
a script that aborts unless `parse → serialise` reproduces the file byte-for-byte first → **6-line
diffs** per catalog instead of ~900. Two keys added: `dashboard.topbar.upgrade`,
`dashboard.upgrade.currentPlan`. Everything else is reused (`marketing.pricing.*`,
`dashboard.settings.billing.upsell.cta`, `…billing.redirecting`, `marketing.pricing.pro.trial`).

**`sed`/Node string-replace on repo source will silently miss.** A guarded Node edit to
`plan-cards.tsx` aborted with *"anchor not found (CRLF?)"* — which is the guard working. Use the
Edit tool for CRLF files in this repo; only add anchors after asserting the search string was found.

**Node cannot resolve `*.localhost`.** Browsers can. Any script hitting the dashboard host must use
`127.0.0.1` with an explicit `Host:` header (undici's `fetch` will not do it — use `node:http`).

**Test-mode residue left in Stripe**, deliberately: customer `cus_V7Fr2DbtL1Lbrr` and a few
abandoned checkout sessions. Test mode, no money, same posture as the 2026-08-21 session. The two
`incomplete` `subscriptions` rows those probes created **were** removed; dev DB is back to baseline
(1 user · 1 org · 19 elections · 3993 voters · 2087 votes · 3 archives · 0 subscriptions).

**No tests added — 651 unchanged.** Nothing shipped here is a server action or a `src/lib/` utility
(invariant #8), and the one new rule, `showUpgradeCta`, is a one-expression delegation to
`canUpgrade`, which is already pinned. The behaviour that *could* regress — button visible where the
page redirects — is a cross-surface consistency the unit-test scope cannot observe; it was verified
in the browser across all three states instead.

**Not verified:** completing a real Checkout (card entry is iframed by Stripe), and any `purchased`
entitlement path — that variant exists in every switch with no producer.
