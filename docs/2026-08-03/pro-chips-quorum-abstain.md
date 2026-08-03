# PRO Chips on Quorum & Abstain

**Branch:** `fix/pro-chips-quorum-abstain` · **Version:** stays 0.9.8 (bump skipped at user request)
**Files:** 2 · **Diff:** 5 insertions / 7 deletions

---

## What was wrong

The election wizard rendered a **PRO** badge on two settings that are free on every tier:

- **Step 2 — "Dopusti suzdržane" / "Allow abstain"**
- **Step 4 — "Prag kvoruma" / "Quorum threshold"**

Nothing is enforced yet (`isPro` gating is phase 8), so both toggles already *worked* for everyone.
The badge was a **false claim in the purchase path** — a free admin was told to pay for something
they already had.

## Why those two are free

Decided 2026-08-03 during the pricing rebuild (`context/project-paywall-spec.md` §3):

| Setting | Reason it cannot be a paid feature |
| --- | --- |
| **Quorum** | A **legal-validity requirement.** Croatian associations and unions statutorily need a quorum for a valid assembly. Gating it means the free tier cannot run a legally valid vote. It is also an integer comparison that costs nothing to run. |
| **Abstain** | **Ballot integrity, not a power feature.** Several statutes require a "suzdržan" option for the vote to count. Charging for *"none of the above"* on a voting platform reads badly. |

The general rule the pricing model now follows: **the gate is volume, not capability.**

## The change

```diff
  # src/components/elections/wizard/step-settings.tsx
- // Toggle rows (design OPTION_DEFS); PRO per the phase-2 spec — auto-close is
- // free-for-all, sealed results is free.
+ // Prekidači (design OPTION_DEFS). Kvorum je besplatan od 2026-08-03 — zakonski
+ // uvjet valjanosti skupštine, ne dodatna pogodnost.
  const OPTIONS = [
    { key: "sealedResults", pro: false },
-   { key: "quorum", pro: true },
+   { key: "quorum", pro: false },
```

```diff
  # src/components/elections/wizard/step-candidates.tsx
- import { …, ModeTabs, ProBadge, StepCard, … } from "./wizard-shared";
+ import { …, ModeTabs, StepCard, … } from "./wizard-shared";

  <span className="…">{t("allowAbstain")}</span>
- <ProBadge />
```

`step-settings.tsx` renders its badge from data (`{pro && <ProBadge />}`), so one boolean flip covers
the quorum row. `step-candidates.tsx` hardcodes its badge in JSX, so it is deleted outright and the
now-unused import goes with it.

### What is still Pro — do not "tidy" these away

- `adminTurnoutReminder` and `voterReminder24h` in the same `OPTIONS` array (real email cost, real
  turnout value; the **manual** "Send reminder" stays free — only the scheduling is gated)
- The `PRO` badge on live turnout in `election-overview.tsx:312` (`resultsMode = LIVE`)
- `dashboard-customizations-card.tsx` (inert Pro / "Coming soon" card)

## No i18n change

`ProBadge` (`wizard-shared.tsx:95`) hardcodes the literal string `PRO`, and neither
`allowAbstainDesc` nor the `toggles.quorum` copy mentions Pro. **No catalog edit, no orphaned keys.**
Worth knowing if you go looking for a `dashboard.wizard.*.pro` key — there isn't one.

## Verification

`tsc --noEmit` clean · `npm run lint` clean · **427/427** tests · `npm run build` clean (44 routes).

Browser pass on `/elections/new`, seeded dev DB, **0 console errors** (the 8 warnings are the known
`next/font` preload noise):

| Assertion | hr | en |
| --- | --- | --- |
| PRO badges on step 2 (whole step) | **0** | **0** |
| Abstain row keeps label, description, working toggle | ✅ | ✅ |
| PRO badges on step 4 (whole step) | **2** | **2** |
| `Prag kvoruma` / `Quorum threshold` has PRO | **no** | **no** |
| `Zapečaćeni rezultati` / `Sealed results` has PRO | no | no |
| Both reminder rows keep PRO | ✅ | ✅ |
| All four toggles enabled | ✅ | ✅ |

The step-4 total of **2** reconciles exactly with the two reminder rows — the count is asserted
against the whole step, not just the rows we expected to change, so a badge appearing anywhere else
would fail it.

**Behaviour proven unchanged, not just the badge:** flipping the quorum toggle still reveals its
percentage input at default `50`. Removing a badge from a data-driven row is exactly the kind of edit
that can silently take the row's behaviour with it.

**No unit tests added.** Vitest scope is `src/actions/` + `src/lib/` only (invariant #8); this is
presentational.

### Not verified live

The `PRO` badge on live turnout (`election-overview.tsx`) only renders for an election with
`resultsMode = LIVE`, and the seed has none. Confirmed statically (the file is untouched by this
branch) rather than in the browser.

## Notes for whoever works here next

- **A single-child flex wrapper was left in place** around the abstain label
  (`<div className="flex items-center gap-2">` now wraps one `<span>`). Deliberate: it keeps the diff
  minimal, is visually identical, and makes re-adding a badge a one-line change.
- **Verification gotcha, cost me a wrong conclusion:** a first scan of `/settings` for leaf elements
  whose text equals `Pro` returned **zero**, which looked like the customizations card had lost its
  chip. It hadn't — dumping the card's `textContent` showed `…ProUskoro…` present and correct. If you
  assert the *absence* of a badge, verify your selector finds one somewhere it should before trusting
  a zero.
- **Open gap, not a bug (out of scope here):** `step-settings.tsx` has **no `resultsMode` control at
  all**, so "live results during voting" — a Pro feature in every pricing document — is currently
  unreachable from the wizard. That is a missing control, not a mis-labelled one; it belongs to
  whichever spec adds it. `sealedResults` is a different, free setting and is not a substitute.

## Related

- `context/project-paywall-spec.md` — the pricing authority (§3 lists everything deliberately free)
- `context/features/profile-settings-phase-7-spec.md` — Stripe; its enforcement note explicitly
  excludes abstain and quorum from the phase-8 gating list
- `context/future-updates-spec.md` §Billing — phase 8 (enforcement) and phase 9 (pay-per-election)
