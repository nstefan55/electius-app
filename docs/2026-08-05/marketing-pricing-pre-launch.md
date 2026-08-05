# Marketing pricing: withdraw the offer before there is a seller

**Branch:** `fix/pricing-pre-launch` · **Version:** 0.9.11 → 0.9.12 (patch)
**Spec:** `context/fixes/marketing-pricing-pre-launch-spec.md` (implements `context/pre-incorporation-billing-spec.md` §4.1)
**Files:** `src/components/marketing/pricing-plans.tsx` · `messages/hr.json` · `messages/en.json`

---

## Why this exists

Electius has **no registered legal entity**, so Stripe live mode cannot be activated and no payment can
be accepted. The apex landing page was nevertheless advertising a **€9/month plan with a 14-day trial
and a VAT statement**. `electius.com` is the only indexable page in the product, which makes this the
most public claim the codebase makes.

Nobody could actually attempt a payment — both CTAs point at `signUpUrl()`, not a checkout. **The
problem was the claim, not a broken flow.** That distinction shaped the whole fix: nothing needed
disabling, only re-wording.

There was a second, inverted problem. While `BILLING_ENABLED=false`, **every user receives Pro
features** — nothing is gated (posture spec §2). So the page simultaneously over-promised a purchase
that could not happen and under-promised Free, telling visitors they get 50 voters when they get 500
and everything else. One reframe fixes both directions.

---

## What changed

### 1. Beta banner above the billing toggle — the load-bearing change

One info banner (design-system §7.10: `brand-50`, 3px `brand-500` left border), directly above the
monthly/yearly toggle:

> **hr:** „Beta — trenutačno su sve značajke otvorene svim organizacijama. Cijene u nastavku planirane
> su za službeno pokretanje."
> **en:** "Beta — every feature is currently open to all organizations. The pricing below is planned
> for our official launch."

That single sentence does three jobs: it withdraws the offer (*planned*), it makes the Free column
honest (*currently open*), and it warns of the future reduction — without a legal disclaimer's tone.

It is deliberately **not** an `aria-live` region. It never changes, and announcing static content on
every render is noise.

### 2. Pro card

| | Before | After |
| --- | --- | --- |
| Badge | — | **"Uskoro" / "Coming soon"** chip beside `pro.name` |
| CTA | "Započnite probno razdoblje" | **"Isprobajte Electius" / "Try Electius"** |
| CTA destination | `signUpUrl()` | **`signUpUrl()` — unchanged** |
| Trial line | "Besplatnih 14 dana. Bez kartice." | **removed from render** |
| Price + toggle | 9 € / 7,20 € | **kept** |

**The CTA is not disabled.** A dead button on a pricing card reads as a broken product, and the
destination is genuinely correct and genuinely free right now — only the *wording* implied a purchase.
Same rule as the landing spec's "no `href="#"`": a control that goes nowhere is a control that lies.

Spacing consequence: the CTA moved `mb-2.5` → `mb-7` because the trial line beneath it is gone. This
also aligns the two cards' bullet lists, which previously did not line up (Free's CTA already carried
`mb-7`).

### 3. Footnote

`"Naplata je po organizaciji. Cijene ne uključuju PDV gdje je primjenjiv."`
→ `"Naplata je po organizaciji."`

The VAT sentence is a tax position on behalf of a seller that does not exist. The first half describes
the pricing model, not a tax obligation, so it stays.

### 4. FAQ — scope extension decided at `start`

The spec scoped itself to `pricing-plans.tsx`. Three of the five FAQ items two sections down on the
**same page** carried the claim the fix removes, in more detail:

| Item | Was | Now |
| --- | --- | --- |
| [1] | "…Iznad 500 koristite plaćanje po izborima — jednokratna uplata… od 9 €." | Beta has no limits; the 50/500 split is named as the **launch plan** |
| [3] | *"Trebam li karticu za probno razdoblje?"* + full 14-day trial mechanics | *"Trebam li karticu?"* → beta, nothing is charged, prices are planned |
| [4] | *"Mogu li platiti samo jedne izbore? Da… od 9 €"* | *"Hoće li Electius ostati besplatan?"* → carries the **silent-reduction disclosure** |

Item [4] is the interesting one. Rather than delete a question, it was repurposed to carry the warning
posture spec §7 asks for — *"plan the communication before flipping, not after"* — in the place a
reader actually looks for it:

> „Besplatni plan ostaje — pravi izbori do 50 birača i dalje neće koštati ništa. Tijekom bete otvorene
> su vam sve značajke, uključujući Pro; kad naplata krene, Besplatni plan vraća se na granice iz
> tablice iznad. Najavit ćemo to prije nego što se išta promijeni."

**Item [2] was deliberately left alone**, and the line drawn is worth recording because it will come up
again:

> **Offers and instructions to buy come out. Descriptions of the planned model stay.**

That is the same rule §2.4 applies to the 13-row comparison table, which is also untouched. [2]
(*"what happens if I cancel"*) describes a consequence and issues no call to purchase. [1] said *"use
pay-per-election"* — an instruction to buy something that does not exist even at launch (it is
post-MVP, `future-updates-spec.md` §Billing). That inconsistency is worth naming: §3 keeps
`marketing.pricing.pointer` **commented out** for exactly that reason, while the FAQ was making the
same offer in prose.

### Unchanged, deliberately

- **The Free card.** €0 is real and deliverable today; its CTA is honest.
- **The 13-row comparison table.** Descriptive of the planned tiers, now governed by the banner.
- **`marketing.pricing.pointer`** stays commented out.

---

## i18n

| Key | Change |
| --- | --- |
| `marketing.pricing.betaNotice` | **new** |
| `marketing.pricing.pro.badge` | **new** |
| `marketing.pricing.pro.cta` | replaced in place |
| `marketing.pricing.pro.trial` | **kept, unrendered** |
| `marketing.pricing.footnote` | reworded |
| `marketing.pricing.footnoteVat` | **new** — holds the original VAT sentence verbatim |
| `marketing.faq.items[1,3,4]` | reworded |

`footnoteVat` is an addition beyond the spec's key list. §2.3 says to keep the key rather than delete
it, but rewording `footnote` in place would have lost the string anyway — so the original now lives in
both catalogs, unrendered. That makes §6's revert re-referencing rather than rewriting.

Retired **FAQ** strings are not preserved in-file: JSON arrays have no comment mechanism, and git
already is the preservation mechanism (`git show main:messages/hr.json`). No preservation scheme was
invented for something version control already does.

### The catalog-injection guard

The catalogs are **CRLF, no BOM, 2-space indent, trailing newline**. Injection went through a script
that **aborts unless a parse → serialise round trip reproduces each file byte-for-byte first**:

```js
const roundTrip = serialise(JSON.parse(original.toString("utf8")));
if (!roundTrip.equals(original)) throw new Error("not byte-identical; aborting before any edit");
```

Result: **19 lines changed per catalog**, not the ~900 a stray LF rewrite produces.

The ordering is the point. The guard runs **before** the edit. Run it after, and a serialiser
formatting drift and your content change land in the same write with no way to tell them apart. This
is also why the check is at **byte** level — the 2026-08-03 version of this script read and wrote with
`utf-8-sig`, so its guard compared two BOM-less strings, passed, and silently added a BOM to both
catalogs.

---

## Verification

`npm run lint` clean · `npx tsc --noEmit` clean · `npm run test` **430/430** · `npm run build` clean
(46 routes) · **0 console errors** (the 8 warnings are the known `next/font` preload noise).

**No unit tests added.** Vitest scope is `src/actions/` + `src/lib/` only (invariant #8) and this is
presentational. The DOM assertions are the real check.

Browser, hr + en, measured rather than eyeballed:

| Check | Result |
| --- | --- |
| Banner precedes the toggle | asserted via `compareDocumentPosition`, not source order |
| Banner styling | `rgb(239,246,255)` = `brand-50`; `3px rgb(59,130,246)` = `brand-500` |
| Banner is not a live region | `aria-live` absent |
| Pro badge | 20px tall (design-system §7.9), contrast **5.98:1** against its composited navy background |
| Pro CTA | "Isprobajte Electius" / "Try Electius" → `dashboard.localhost:3000/signup` |
| Trial line | absent |
| Footnote | "Naplata je po organizaciji." — no VAT |
| Toggle | swaps **price and note**, `aria-live="polite"` + `aria-pressed` intact, restores |
| Free card | behaviour byte-identical |
| Dead links | `a[href="#"]` count **0** |
| 390px | banner 342×119 over 4 lines, text contained, icon not shrunk, **no horizontal page overflow** |

### The absence check was run twice, and the first pass was worthless

`faq-accordion.tsx` renders `{isOpen ? <panel> : null}` — **only one answer is ever in the DOM.** A
page-wide grep for "plaćanje po izborima" therefore returns `false` on the *unfixed* code too, passing
for a reason with nothing to do with the fix.

The real pass expands every item first, confirms `answersRendered: true`, *then* asserts:

```js
retiredClaims: { trial14: false, payPerElection: false, priceNine: false }
sanity:        { findsRetentionAnswer: true, answersRendered: true }
```

The `sanity` line is not decoration — it proves the same search **can** find a string deliberately left
in place. Same class as the false negative recorded in `pro-chips-quorum-abstain` (2026-08-03): when
asserting the absence of something, first prove the selector finds one where it should.

`document.body.textContent` is also not usable here: next-intl serialises the **entire catalog** into
the RSC payload, so every retired string is present as `<script>` content whether rendered or not. The
assertions walk text nodes with `SCRIPT`/`STYLE`/`TEMPLATE`/`NOSCRIPT` rejected.

---

## Revert, at launch

Posture spec §5.6, one commit:

1. Delete the banner (`betaNotice`) and the Pro badge (`pro.badge`).
2. Restore `pro.cta` and re-render `pro.trial` — **both strings are still in the catalogs**.
3. Restore the VAT clause from `footnoteVat` **only once its claim is true** (§5.2 — accountant first).
4. Wire the Pro CTA to Checkout if that is the decision then.
5. FAQ [1], [3], [4]: `git show <this-commit>^:messages/hr.json` for the originals — though [4]'s
   pay-per-election answer should **not** return until that feature exists.

---

## Recorded, not fixed

- **The Free card still claims "do 50 birača"** (`free.desc`, `free.features`) while every user
  currently receives 500 and everything else. §3 freezes the Free card, so **the banner is the sole
  carrier of that correction**. FAQ [4] now backs it up, but the card itself still states the launch
  number.
- **`meta.description`** — the search-result and OG description of the only indexable page — likewise
  says "Besplatno za izbore do 50 birača". Under-promise, not an offer, so out of scope; worth a pass
  if the beta framing is ever extended to metadata.
- **Nothing enforces any of these limits.** `isPro` is read in exactly two places, neither a feature
  gate (posture spec §2). The comparison table describes a model that does not yet exist in code.

---

## Related

- `context/pre-incorporation-billing-spec.md` — the constraint, the `BILLING_ENABLED` switch, exit criteria
- `context/project-paywall-spec.md` — the prices this section displays, unchanged
- `profile-settings-phase-7-spec.md` §2A — the same problem on `/settings`, still open
- `docs/2026-08-03/pro-chips-quorum-abstain.md` — same class of false claim in the purchase path
- `docs/2026-08-03/ui-review-high-findings.md` — the byte-level catalog-guard lesson
