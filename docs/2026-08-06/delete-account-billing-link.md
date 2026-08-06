# Fix — Delete-account "Manage billing" linked to the page it was on

**Shipped inside** commit `0b6cba2` (merge `56b919b`), **v0.9.15** — see
[`stripe-integration-phase-2.md`](./stripe-integration-phase-2.md).
**No branch of its own.** Why: [§4](#4-why-this-did-not-get-its-own-branch).

---

## 1. The bug

`src/components/settings/account-management-card.tsx` renders on `/settings`. When an active
subscription blocks account deletion, the card explained why and offered a way out:

```tsx
<Link href="/settings">
  <CreditCard /> {t("manageBilling")}
</Link>
```

That is the page the user is already looking at. Pressing it did nothing visible — and it was the
**only** route out of the blocked state.

Severity is higher than "dead link" suggests. The blocked state is reached from a GDPR erasure
request (`profile-settings-phase-4`), the user is being told *no*, and the one affordance offered to
resolve it was inert.

## 2. Why it was never wrong before

Phase 4 shipped this link when **no Billing Portal existed**. `/settings` was the only honest
destination — everything about billing lived on that page. Stripe phase 2 created the real
destination.

So this is a follow-up the phase *created*, not a phase-4 regression. Worth knowing before someone
goes looking for who broke it.

## 3. The fix

The `<Link>` becomes a `<button>` that opens Stripe's Billing Portal — the only place cancellation
happens, and therefore the only thing that can unblock deletion.

```tsx
async function manageBilling() {
  setPortalPending(true);
  const { error } = await authClient.subscription.billingPortal({
    referenceId: organizationId,
    returnUrl: `/${locale}/settings`,
    locale,
  });
  // Success is a redirect, so pending only clears on error.
  if (error) {
    if (error.message) console.error("[billing]", error.message);
    toast.error(tBilling("errors.portal"));
    setPortalPending(false);
  }
}
```

Deliberate choices, all of them copying `billing-card.tsx` rather than inventing a second path:

- **`<button>`, not `<Link>`.** It fires a network call and an external redirect, not route
  navigation. The a11y tree should say so.
- **Error copy is the localized string**, never `error.message` — Stripe's text is English and
  internal. The raw message goes to `console.error("[billing]", …)`. Same rule as the billing card.
- **`pending` clears only on error.** On success the page is leaving; re-enabling the button would
  flash it live for a moment during the redirect.
- **Reuses `dashboard.settings.billing.errors.portal`.** No new i18n keys, no catalog edit.
- **`organizationId` is threaded from `(app)/settings/page.tsx`** (`session.organizationId`) — the
  same prop `BillingCard` already receives.

### What was NOT touched

`subscriptionBlocks()` and `purgeOrganizationData()` are unchanged. **This fix changes one
destination and nothing about who may delete an account.** That boundary was kept deliberately: the
account-deletion phase avoided mixing destructive-surface changes with anything else, and a reviewer
skimming this diff should be able to confirm the guard is untouched at a glance.

## 4. Why this did not get its own branch

The fix calls `authClient.subscription.billingPortal`, which **did not exist** until phase 2
registered `stripeClient({ subscription: true })` and mounted the server plugin. Both were
uncommitted at the time. A separate branch cut from `main` would not have compiled.

The cost is acknowledged: a destructive-adjacent surface changed inside a billing diff, which is
exactly the mixing phase 4 avoided. The mitigation is that the change is **~20 lines, touches no
guard, and is called out in its own paragraph of the commit message** so it cannot hide inside a
1,100-line feature commit.

## 5. Verification

- `npx tsc --noEmit` clean · `npm run lint` clean · 464 tests unchanged (no new logic in `src/lib/`
  or `src/actions/`, so nothing new to unit-test — invariant #8).
- **Browser, in the blocked state it targets** (`isPro` + a `stripeSubscriptionId` set via a
  throwaway fixture): the control renders as `BUTTON` with **no `href`**, and the "Obriši račun"
  button is correctly absent. Fixture removed; DB SQL-proven back to baseline.
- **Not exercised:** an actual redirect *from this card*. The call is byte-identical to
  `billing-card.tsx`'s `manageBilling()`, which was proven live during the phase 2 E2E (Portal
  opened at `billing.stripe.com`, `lang=hr-HR`, scoped to the right customer). "Copied from a call
  site proven minutes earlier" is the honest description.

## 6. Note for whoever revisits this

The blocked state is `isPro && stripeSubscriptionId`. After stripe phase 2, `stripeSubscriptionId`
is nulled the moment a subscription reaches a non-Pro status — so the blocked state now **clears
itself** once cancellation completes, which it did not do before anything wrote those columns.

A **trialing** subscription also blocks deletion. That is correct (a trial is a live subscription),
but it means the copy is shown to users who are not paying anything yet. Worth a read-through if the
trial flow ever gets its own UX pass.

---

## Related

- [`stripe-integration-phase-2.md`](./stripe-integration-phase-2.md) — the phase this shipped inside
- `docs/2026-08-02/settings-phase-4-account-deletion.md` — the card, the guard, and the email
  second factor
- `docs/2026-08-05/settings-phase-7-plan-billing.md` — the billing card whose handler this reuses
