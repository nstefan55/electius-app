# Admin Turnout Emails — Deferred Honestly

**Branch:** `feature/admin-turnout-soon` · **Version:** 0.9.21 (patch) · **Date:** 2026-08-08
**Spec:** `context/features/pro-features-implementation-spec.md` §3 — the fourth and last slice of
that file. **No migration, no server action, no sender.** Two components, two catalog keys.

This slice deliberately **does not build the feature**. It makes the wizard stop pretending the
feature exists.

---

## What was wrong

`Election.adminTurnoutReminder` was written by the wizard as a normal Pro toggle, labelled
*"Primajte e-mailom ažuriranja o izlaznosti dok je glasovanje otvoreno."*

- **Nothing ever sent anything.** No cron pass, no template, no sender.
- **The value was never shown again** — unlike its sibling `voterReminder24h`, it does not appear in
  the overview configuration card. An admin could not even discover what they had chosen.

So an admin ticked a box at the moment of highest trust — configuring their election — and received
nothing, with no way to notice. That is the same failure class as the `sealedResults` toggle removed
in §1, except worse: `sealedResults` at least matched the default behaviour by accident.

---

## Why it is not built

Per §3.2, **nothing about the feature is designed.** The wizard copy says "updates" with no cadence,
and four questions have no answer:

| Question | Status |
| --- | --- |
| Cadence — daily, on threshold crossings, at T-24h? | undecided |
| Recipient — `createdBy`, or every admin in the org? | undecided (1 org ↔ 1 admin today, a real decision later) |
| Content | partially decided: **never per-candidate counts**, which would leak a live tally on an `AFTER_CLOSE` election into an inbox and defeat the seal |
| Opt-out — unsubscribe link, or is the wizard toggle enough? | undecided |

It is also the only one of the spec's three features **not advertised on any pricing surface**, so
it carries no launch obligation. §1 and §2 have both shipped, which was the precondition for even
considering it.

Building it against four open questions would mean inventing a product decision inside an
implementation slice. Removing it would discard a schema column and wiring that are already correct.
So it ships as an **announcement instead of a control**.

---

## What shipped

The row stays in wizard step 4, in place, with its label and description intact — and stops being
interactive:

- New `{ soon: true }` flag on the `OPTIONS` entry.
- The `Toggle` is replaced by a **drawn `aria-hidden` span** with identical geometry (44×26 track,
  20px knob, 3px inset — measured, matching the `/settings` customizations card).
- A new **`SoonBadge`** sits beside the existing `ProBadge`.

### The accessibility rule this follows

**Hide the depiction, never the explanation.**

The obvious implementation is `aria-disabled` on the row. It is wrong, and this codebase has already
paid for that lesson twice — once on the gated language option in settings phase 1, once on the
customizations card in phase 3. `aria-disabled` announces the control as inoperable, so a screen
reader says "dimmed" and moves on, and the *reason* — which is the entire content of this row — is
never read.

Here the row text **is** the feature announcement. So only the drawn switch is hidden, the row keeps
full contrast, and nothing carries `aria-disabled`. Verified: the row's accessible text reads

> Automatski podsjetnici administratoru · PRO plan · Uskoro značajka · Primajte e-mailom ažuriranja
> o izlaznosti dok je glasovanje otvoreno.

### `SoonBadge`

Added to `plan-badge.tsx` beside `ProBadge` and `BetaBadge`, sharing the same `PILL` constant. It
reads **the same key** as the `/settings` customizations card (`dashboard.settings.customizations.soon`)
— same claim about the same kind of thing, so a second key would be drift by construction. That is
the `BetaBadge` precedent exactly.

It is deliberately **not** `dashboard.profile.language.soon`: there "soon" means a locale that is
coming, here a Pro feature that is not built. Those two drift the moment either ships.

New `common.badges.soonNote` (hr *"značajka"* / en *"feature"*) is the `sr-only` suffix, so a screen
reader hears "Uskoro značajka" rather than a bare "Uskoro" — colour is never information.

---

## What was deliberately left alone

The **payload plumbing stays**: `wizard-shared.tsx`, `election-wizard.tsx`, the zod field and the
`create-election.ts` write. With the control inert the value is now always `false`, which is also
the column default, so it writes the truth.

Removing that plumbing and re-adding it when the sender ships is churn for no gain. Re-enabling the
feature is **deleting one `soon: true` flag** — everything behind it already works. The comment at
the `OPTIONS` entry says so.

`step-review.tsx` still lists the option when enabled; that branch is unreachable today and correct
the moment the flag comes off.

---

## Files changed

| File | Change |
| --- | --- |
| `src/components/ui/plan-badge.tsx` | `SoonBadge` |
| `src/components/elections/wizard/step-settings.tsx` | `soon` flag; drawn switch branch; badge |
| `messages/{hr,en}.json` | `common.badges.soonNote` |

---

## Verification

`npm run lint` clean · `npx tsc --noEmit` clean · `npx vitest run` **518 passed** (unchanged —
nothing here has a failure mode a unit test could catch; Vitest scope is `src/actions/` + `src/lib/`
only) · `npm run build` clean · **0 console errors**.

Browser pass on a throwaway pre-verified admin, both locales:

| Check | Result |
| --- | --- |
| interactive switches on step 4 | **3** (was 4) — admin turnout is no longer a control |
| `role="switch"` in that row | **absent** |
| `aria-disabled` anywhere | **absent** |
| focusable elements inside the row | **0** — Tab provably skips it |
| drawn switch geometry | 44×26 track, 20×20 knob, 3px inset |
| row accessible text | label + PRO plan + Uskoro značajka + full description |
| `/en` | "Automatic admin reminders · PRO plan · Coming soon feature · Email you turnout updates…" |

Asserting **absence** is the point here — hand-sampling cannot prove a control is gone from the
accessibility tree.

Fixture org, admin and account deleted (`usersLeft: 0`); dev server stopped; temp scripts removed.

---

## The parent spec is now closed

| Slice | Outcome |
| --- | --- |
| §4 sidebar badges | shipped v0.9.18 |
| §2 automatic 24h voter reminders | shipped v0.9.19 — launch blocker cleared |
| §1 live results during voting | shipped v0.9.20 — launch blocker cleared |
| §3 admin turnout emails | **deferred honestly** (this slice) |

Launch-blocker **L2 is resolved**: every Pro line advertised in
`marketing.pricing.pro.features`, `dashboard.settings.billing.upsell.features` and
`dashboard.settings.billing.pro.includes` is now a feature that exists. Nothing had to be removed
from any pricing surface.

**Next largest unbuilt surface:** the public results page. `resultsVisible` is built, read, gated —
and has no writer, which is exactly the shape `resultsMode` was in before §1.
