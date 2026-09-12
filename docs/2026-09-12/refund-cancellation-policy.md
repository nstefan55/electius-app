# Refund & Cancellation Policy — six paragraphs, not a page

**Branch** `feature/refund-cancellation-policy` · **Version** 0.9.70 · **Spec**
`context/features/refund-cancellation-policy-spec.md`

Closes the `mvp-launch.md` §2 box *"Refund / cancellation policy built (required
before `BILLING_ENABLED=true`)"*. Generated with the `refund-page-generator`
skill, then reconciled against what had shipped six hours earlier. No migration,
no new dependency, no new route, no server action. Five files.

---

## The one sentence this feature turns on

**The refund policy was already written — it just had holes.** `/terms` §H
shipped the same day (v0.9.65) with eleven paragraphs covering price, trial,
cancellation, failed payment and the no-refund rule. So the question was never
"what should a refund policy say"; it was "which of the things a refund policy
must say are missing from the one we have". That reframing is what turned a
document into six paragraphs.

---

## What the skill said, and what survived contact

The `refund-page-generator` skill is written for a generic category — SaaS,
digital downloads, physical goods, marketplaces. Run against a blank page it
produces a document. Run against **the shipped artifact**, two things happened
that a blank-page run would have missed entirely.

### 1. Most of it already existed

Measured against the skill's own "Essential Policy Elements" table, §H already
carried trial terms, cancellation mechanics, auto-renewal, failed-payment
behaviour, the no-overage rule, the no-refund stance and a consumer carve-out.
Six elements were missing:

- **how to request** a refund — the product named no address anywhere
- **exceptions** — none, so "no refunds" read as absolute and was not even true
- **refund method** — back to the original payment method
- **refund timeline** — or rather, the honest absence of one
- the consumer paragraph's **missing figure and mechanism** — it said rights
  exist and never said *fourteen days* or how to use one
- **pre-purchase placement** — see the finding at the bottom

### 2. The skill's most urgent claim is probably not about us

The skill leads with *"Mandatory Withdrawal Button — Deadline June 19, 2026
(Directive EU 2023/2673)"*, framed as binding on **"any business targeting EU
consumers"**, with fines to 4% of turnover. Today is 2026-09-12. On that framing
the deadline passed three months ago and Electius is already non-compliant.

`[model knowledge — verify]` **Directive (EU) 2023/2673 is the recast of the
distance marketing of consumer *financial services* regime** — it repeals
2002/65/EC and inserts a new chapter into 2011/83/EU. Its withdrawal function
attaches to financial-services contracts: insurance, credit, payment accounts,
investments. Electius sells a subscription for running elections, and Stripe,
not Electius, is the party touching payments.

**Nothing was built on the strength of that claim.** The button is a two-step
UI, a durable-medium confirmation email, a timestamped record and a permanent
unauthenticated entry point — days of work, against a directive that probably
does not name us. Spec §1 converts it into a precise question for the lawyer
instead: *does 2023/2673's withdrawal function reach a distance-sold B2B SaaS
subscription where some buyers are consumers, or only financial services?*

Two related claims are recorded rather than acted on: **Sky Austria** (pending
CJEU) `[verify]`, which would mean a subscription's withdrawal right survives
until full performance rather than first login, and **2019/770**'s two-year
conformity guarantee `[verify]`, which is a defect entitlement and not a
change-of-mind refund.

> The general lesson: a generator skill optimises for completeness against a
> category, not for what your product already says. Asking *"does this name
> **us**?"* rather than *"is this on the checklist?"* is what exposed the scope
> error — and that question only gets asked when you read the skill against a
> real artifact.

---

## Decisions

All six were taken as recommended.

| # | Decision | Why |
|---|---|---|
| **D1** | **Extend §H — no `/refunds` page** | ToS spec D3 had already decided this and the argument had not weakened: one product, one price, no returns. A second document restating §H is two surfaces carrying one claim, the drift pattern this codebase keeps designing against (`BetaBadge`/`SoonBadge`, `auditBody`). `/terms#payment` is the URL if procurement ever wants one. |
| **D2** | **Stance unchanged** | No pro-rata for a started period. It is what Stripe already does, what §H already said, and at €9 anything else is arithmetic nobody runs. |
| **D3** | **Three named exceptions** | The substantive copy change, and a real commitment: same amount charged twice · charged after cancelling · a technical failure on our side. "No refunds" with no exceptions reads as adversarial *and is false* — a double charge would be refunded. Naming narrow, unambiguous cases pre-empts the chargeback a silent policy invites. |
| **D4** | **Manual, via `SUPPORT_EMAIL`** | Already the recorded position. No in-app refund control, no `charge.refunded` handler, and a refunded charge still does **not** auto-revoke entitlement. |
| **D5** | **Stripe consent tick split out** | The Art. 16(m) waiver is the actual `BILLING_ENABLED` blocker and is the only part that can break a live purchase. It needs the Stripe dashboard *and* test-mode Checkout re-driven, and the €0 trial checkout is exactly where a consent tick goes wrong. → `fix/checkout-withdrawal-waiver`. |
| **D6** | **`/pricing` link only** | The billing card's cancel modal already states what happens at period end; adding "no refund" turns a routine cancellation into a warning screen. |

---

## What changed

### The catalogs — §H grows two paragraphs and loses one

`legal.terms.s.payment.body` goes from 11 paragraphs to 12: the exceptions
clause and a method-plus-process clause ending in a colon. The **consumer
paragraph moves out of `body` and into a new `after`**, and that move is not
tidying.

The clause says *"those rights take precedence over everything stated in this
section"*. An override that renders in the middle of the section reads as one
more paragraph; rendered last it reads as what it is. The existing render chain
already puts `after` after everything else, so the correct reading fell out of a
mechanism that was already there — no new ordering logic.

The consumer paragraph also grew the two things it was missing: **fourteen days
from entering into the contract**, and what to actually do (tell us at the same
address; we stop further charges and return what was paid).

> ⚠ That sentence is currently **true without qualification**, because the
> Art. 16(m) waiver is not collected anywhere. Once `fix/checkout-withdrawal-waiver`
> lands, re-read it — the waiver is what narrows it, and the document must not
> keep promising the unnarrowed version.

Both catalogs were patched by a script that **refuses to write unless a
parse → serialise round trip reproduces the file byte-for-byte first**. Result:
10-line diffs per catalog instead of the ~2600-line whole-file rewrite a stray
LF produces. CRLF preserved.

### `terms/page.tsx` — one flag, six lines

```
{ id: "payment", supportMail: true, after: true },
```

`supportMail` renders `SUPPORT_EMAIL` as a live `mailto` between the body and
`after`, reusing the `mailLink` helper §S already uses. The address still comes
from `urls.ts`, never a catalog — the same rule that keeps `CONTACT_EMAIL` and
`SUPPORT_EMAIL` from being printed differently on two surfaces.

The alternative was zero code: a paragraph reading *"the support address is in
the Contact section"*. Rejected because the section now describes a **process**,
and a process whose first step is a cross-reference is one hop too many.

**`after: true` is load-bearing beyond ordering.** The page's build-time guard
requires every declared optional field to exist as an array in both catalogs —
so a locale that received the new paragraphs but not the `after` array now
**fails the build**, in both directions, rather than rendering a key path.

### `legal.ts` — and a small design gap the bump exposed

```
export const TERMS_VERSION = "2026-09-12.1";
```

`TERMS_VERSION` is a **date**, and this amendment landed the same day the terms
were published. So a plain bump is a no-op, and dating it tomorrow would make
the page's own "Zadnja izmjena: 12. rujna 2026." a lie.

Left alone, `"2026-09-12"` would name **two different texts** — which destroys
the single property the constant exists for: answering *which terms bound this
organization*. Whether anyone has already accepted could not be checked
(production reads are off-limits under the standing Neon guardrail), so the
safe side was taken. The `.1` is recorded in the file as a one-off, not a scheme
change: **the next amendment moves the date and the suffix disappears.**

### `pricing-plans.tsx` — one line, and a finding

One sentence plus a `Link` to `/terms#payment`, beside the existing footnote.
This is the only pre-purchase surface we author — Stripe writes the checkout
page, not us.

---

## ⚠ The finding: the placement lands in code that does not render

The entire pricing section is **commented out** on the landing page
(`(marketing)/page.tsx`, "6 · Cijene"), committed in `HEAD`, with a
`//TODO Add back when pricing is ready` on the import. `PricingPlans` therefore
has **no call site**, and the public site shows no prices at all today.

The edit was kept, for one reason and with one condition.

*Kept*, because a dormant line inside an already-dormant section **claims
nothing** — it is not the `resultsVisible` failure mode (a live control
promising behaviour that did not exist), and the day the section returns the
link is already in place rather than forgotten.

*Conditioned*, because the honest consequence is that **there is no
pre-purchase placement today** — which is unsurprising, since with
`BILLING_ENABLED` false and `/upgrade` unreachable there is no purchase either.
The file says so at the call site, in as many words: the `mvp-launch.md` box
must not be closed on the strength of that surface.

`marketing.pricing.refundNote` / `refundLink` are therefore orphan keys for now.
They join `footnoteVat`, which was already one — noticed in passing, not fixed.

---

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 errors, 7 pre-existing warnings (none in touched files) |
| `npx vitest run` | **808 passing / 45 files** — unchanged |
| `npm run build` | clean |
| `/hr/terms` · `/en/terms` | **`●` prerendered** — read from `prerender-manifest.json`, not the build table |
| `/hr` · `/en` | still prerendered → **no Gate 13 regression** |
| `/[locale]/results/[id]` | still in `dynamicRoutes` → ISR intact |

Browser pass on a running dev server, both locales, **0 console errors**:

- §H renders in the intended order — no-refund → exceptions → method → **live
  `mailto:support@electius.com`** → consumer override last
- 19 TOC entries, **zero dead anchors**; `#payment` scrolls clear of the nav
- no sideways scroll at 390px, nothing overflowing inside `#payment`
- `/en` free of Croatian leftovers

**No new tests, deliberately.** Nothing here is a server action or a `src/lib`
function (invariant #8), and the one contract worth pinning — catalog ↔
`SECTIONS`, in both directions — is enforced at build time and breaks the
**build** rather than a test. The new `after: true` declaration rides that guard
automatically.

---

## What this does NOT close

Ticking the box is honest about the *policy*. Billing is still not launchable:

- **No legal entity.** A refund policy from an unnamed party has the same defect
  as an unnamed controller and an unnamed contracting party.
- **The Art. 16(m) waiver at Stripe Checkout** (ToS spec B7). D5 split it out;
  splitting it out did not close it. Its one seam is
  `getCheckoutSessionParams()` in `src/lib/auth/index.ts`.
- **No lawyer has read any of it**, including the directive-scope question
  above, which this branch *added* to their list rather than answering.
- **Stripe Portal plan-switching is still off in live mode**, so a customer who
  would rather move monthly→yearly than ask for a refund cannot self-serve.

## For whoever touches this next

- **Croatian is the operative text.** Change both locales or neither.
- **Bump `TERMS_VERSION` for any change of obligation, never for a typo** — and
  move the *date*, dropping the `.1`.
- A new §H paragraph goes in `body` unless it overrides the section, in which
  case it goes in `after` — and the build refuses either half alone.
- Re-read the consumer paragraph the day the checkout waiver ships.
