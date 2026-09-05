# Voter Flow — UI/UX Pass & Back Navigation

**Branch:** `fix/voter-flow-ui-back-navigation` · **Version:** 0.9.58 · **Date:** 2026-09-05

Presentation-only pass over the public `(voter)` surface, plus one navigation affordance.
**No schema change, no migration, no server action, no change to `vote.service.ts`, no new
dependency.** Ballot semantics, token handling and the anonymity guarantees are untouched.

---

## Why

Two triggers. The reported one was visual — "the voting flow doesn't look right." The other came
out of the review pass and is the more serious of the two: **the ballot had no visible keyboard
focus indicator**.

---

## 1. The critical fix — focus ring on the ballot

`src/components/voter/vote-flow.tsx`

Option cards carried an unconditional `shadow-sm`. In Tailwind v4 that class lives in the
`utilities` layer, which outranks the app's focus ring in `@layer base`
(`globals.css:142`, `:focus-visible { box-shadow: var(--shadow-focus) }`). The element matched
`:focus-visible` correctly and its `box-shadow` never changed — so a keyboard voter tabbing the
candidate list saw **nothing**. WCAG 2.4.7 (AA), on the single most important control in the
product.

```diff
- className={`… rounded-2xl border-2 p-5 … shadow-sm transition-colors duration-150 ${
+ className={`… rounded-2xl border-2 p-5 … shadow-sm transition-colors duration-150 focus-visible:shadow-focus ${
```

`focus-visible:shadow-focus` is itself a utility, so it wins inside the same layer.

> ### ⚠️ How to test this, because the obvious test lies
>
> A programmatic `element.focus()` **does not** set `:focus-visible` — browsers grant it only for
> keyboard interaction. Probing that way returns `matchesFocusVisible: false` and proves nothing
> either way. Drive a real `Tab` and read `getComputedStyle().boxShadow`:
>
> | | before | after |
> |---|---|---|
> | `matchesFocusVisible` | `true` | `true` |
> | `boxShadow` contains `29, 78, 216` | **`false`** | **`true`** |
>
> **Carry-forward:** any `shadow-*` utility on an interactive element silently kills the
> base-layer focus ring. This is a whole class of regression, not a one-off — if you add
> `shadow-*` to something focusable, add `focus-visible:shadow-focus` with it.

---

## 2. Back navigation

Ghost **Natrag** below the primary CTA on screens **2 and 3**, matching the pattern screen 4
already shipped with.

| Screen | Back? | Why |
|---|---|---|
| 1 Invite | no | nothing to return to |
| 2 Details → 1 | **added** | |
| 3 Cast → 2 | **added** | lets a voter re-check the closing date / voting method |
| 4 Review → 3 | already existed | the designed instance |
| 5 Confirmed | **never** | ballot is cast; `VoterToken.used` is flipped inside `castVote`'s transaction |
| Race (409) | **never** | token spent elsewhere — retrying cannot help |

Two things worth knowing:

- **It is a `setStep` decrement, not `router.back()`.** The whole flow lives at one URL with no
  history entry per step (deliberate, `vote-flow.tsx:22`). `router.back()` would exit the ballot
  to wherever the link was opened from.
- **The device's native back gesture still exits the flow.** These on-screen buttons are the only
  reliable back mechanism given that architecture. A URL-per-step rewrite is the real fix and is
  out of scope here.

i18n: `review.back` was promoted to a shared **`voter.flow.back`**, now read by all three screens
(one string, three surfaces — same reasoning as `BetaBadge`/`SoonBadge`). Catalogs were injected
behind the byte-identical round-trip guard: **4-line diff each**, not ~900.

---

## 3. Layout — the §8.2 content card

Screens sat directly on the `neutral-50` page background with all the empty space dumped below
them. Design-system §8.2 specifies a white content card; the prototype instead draws a *phone
frame* and puts content bare on grey, and that is what got built — a spec-vs-prototype conflict
resolved in favour of the spec.

New `VoterCard` in `voter-ui.tsx` (§7.8 default: white, `neutral-200`, `shadow-sm`, `radius-lg`,
24px padding). Progress dots render **above** it, as §8.2 draws them — which is why the card is a
component rather than something bolted onto `(voter)/layout.tsx`: the layout cannot know the step.

Knock-on changes, all so nothing renders white-on-white:

- details · review · help · hash · notStarted panels → `bg-neutral-50` insets
- `StateHero` `topPad` 36px → 12px (the card now supplies the breathing room)
- the QR entry `<form>` carries the card chrome itself rather than nesting inside one

---

## 4. Left accent removed — deviation from §7.15 / §7.10

Per explicit request, for the whole flow:

- the 4px `brand-700` bar on a **selected option card**
- the `border-l-3` on **`VoterAlert`** (used/closed/QR screens)

Recorded as a deliberate deviation at both sites. Selection is still **not colour-alone** — the
check circle carries it (a shape cue, independent of colour). See §5 for why the border width is
deliberately *not* the second cue.

---

## 5. Contrast, type scale, touch targets

**Contrast.** Five captions moved `text-neutral-400` → `text-neutral-600`. §10 marks
`neutral-400` on white as **2.9:1, placeholder only — never for real content**, and these carried
the anonymity promise ("Your vote is anonymous and cannot be linked back to you") — the most
load-bearing sentence on the flow was in the one colour the design system forbids. Live-verified
`neutral400OnContent: 0`. `placeholder:text-neutral-400` on the email input is legitimate and
was kept.

**Type scale.** Headings were compressed a full step. `StateHero` gained a `titleSize` prop because it
is shared by two groups with different intended sizes (named for the font size it sets — the
component always renders an `<h1>`, so a name like `size="h1"` would have implied a heading level
it does not control):

| Screen | was | now |
|---|---|---|
| 1 Invite · 5 Confirmed (`StateHero titleSize="lg"`) | 24px | **30px** (h1) |
| 2 Details · QR entry (own `<h1>`) | 24px | **30px** (h1) |
| 3 Cast · 4 Review (own `<h1>`) | 20px | **24px** (h2) |
| invalid / expired / used / notStarted / closed / fail / race | 24px | **24px** — unchanged, already correct |

**Touch targets.** `BTN_GHOST_MD` 40px → **44px** (§10 hard rule; §7.1's own `md` row says 40px —
accessibility wins). This matters more now that the fix adds two more ghost buttons. The
copy-hash button keeps its 32px look (§7.17) but gains a 44px hit area via `after:-inset-1.5`.

**Also:** review card `p-5` → `p-6`, and `request-link-form.tsx`'s hand-rolled
`focus:ring-[3px] focus:ring-brand-700/30` — a byte-for-byte re-derivation of `--shadow-focus` —
replaced with `focus:shadow-focus` (invariant #5; it sits beside `shadow-xs`, so it is the same
layer-precedence case as §1).

**`aria-live="polite"` on the multi-choice counter, and the way it is mounted matters.** A live
region only announces changes made *after* it is in the DOM, so rendering the region and its first
content together never fires. The region is therefore mounted for the whole multi-choice step and
its **text** varies:

```tsx
{multi ? (
  <span aria-live="polite" …>
    {picks.length > 0 ? t("cast.counter", { count: picks.length }) : ""}
  </span>
) : null}
```

**Option border width is deliberately constant (`border-2`).** §7.15 specifies 1.5px unselected /
2px selected, and that was tried — but it reflows the card on every toggle, and `border-[1.5px]`
rounds to 1px on a DPR-1 screen anyway, so it bought a layout shift and no visible difference.
Selection stays non-colour-alone through the check circle.

---

## Deliberately not done

- **Finality warning styling** (screen 4) left as plain `body-sm`. The prototype specifies exactly
  that; its "explicit finality warning" note refers to the **copy**, not the styling.
- **Arrow-key navigation on the single-choice radiogroup — still open.** `role="radiogroup"` with
  custom `role="radio"` children should support arrow keys + roving `tabindex`; a native
  `<input type="radio">` gets it free, this re-implementation does not. `ballot-demo.tsx`
  (marketing) already solves it with native radios, which is the cheaper fix but a structural
  change to the most safety-critical markup in the app. **Wants its own branch.**

### Non-finding, recorded so it is not re-chased

Sticky `hover:` on touch devices (hover persisting after a tap, reading as a false "selected" on a
ballot) was investigated and is **already handled** — Tailwind v4 wraps `hover:` in
`@media (hover: hover)` by default. An explicit `[@media(hover:hover)]:hover:` variant was tried
first and **did not compile at all** (`hasHoverHover: false` in the live stylesheet — it silently
produced no hover style whatsoever), then reverted to plain `hover:`.

---

## Verification

`npm run lint` 0 errors · `npx tsc --noEmit` 0 · **`npm run test` 758/758, 42 files (unchanged)**
· `npm run build` exit 0.

No tests were added, deliberately: Vitest scope is `src/actions/` + `src/lib/` only (invariant #8)
and this is entirely component work. The build confirms the caching posture did not regress —
`● /hr`, `● /en` and `● /[locale]/results/[id]` all still prerender.

**Browser pass** (hr, 390px, dev server): screens 1–5 on both a single-choice and a multi-choice
ballot, the `used` state, and the QR entry form. **0 console errors.** Back verified functionally
(step 2 → "Korak 1 od 5"). Focus ring verified under a real `Tab`.

**Fixture:** raw voter tokens are never persisted (only SHA-256 — invariant #2), so walking the
real ballot needs a throwaway election with a freshly minted token. One was created via
`mintTokenForVoter`, used, and destroyed. Dev DB SQL-proven back to baseline afterwards —
2 orgs · 2 users · 19 elections · 3994 voters · 2087 votes · 3 tokens · 3 archives, **0 leftovers**.

> ⚠️ The cron sweep was **never pinged**. The dev DB holds a SCHEDULED election with a past
> `startsAt`; any ping opens it and sends **real invitation email**. Check for such rows before
> pinging the sweep against dev.

### Not verified

- `/en` was not opened in a browser (catalogs proven symmetric, `t("back")` resolves in both).
- 768px / 1280px not re-checked after the card landed (the column is `max-w-voter`-capped and
  centred, so behaviour is expected to be unchanged).
- The public results tally and the expired / notStarted / closed state screens were not re-opened
  after the card wrap.

---

## Files

| File | Change |
|---|---|
| `src/components/voter/voter-ui.tsx` | **new `VoterCard`**; `StateHero` `size` prop; `topPad` 36→12px; `VoterAlert` left border removed; `HelpCard` → `bg-neutral-50`; `BTN_GHOST_MD` 40→44px |
| `src/components/voter/vote-flow.tsx` | focus ring; card wrap; Back on 2 + 3; left accent removed; heading sizes; contrast; `aria-live`; border widths; card padding; copy-button hit area |
| `src/components/voter/state-screens.tsx` | all five screens into `VoterCard`; contrast; inset panel |
| `src/components/voter/request-link-form.tsx` | `<form>` carries the card; h1 → 30px; contrast |
| `messages/{hr,en}.json` | `voter.flow.back` added, `voter.flow.review.back` retired (4-line diff each) |
