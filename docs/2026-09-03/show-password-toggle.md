# Fix: show/hide password toggle on every password field (v0.9.48)

**Branch:** `fix/show-password-toggle` · **Checklist:** `final-checklist.md` line 1

## The gap

No password field in the app could be revealed. Eight `<input type="password">` across four client components — login (1), signup (2), reset-password (2), the `/profile` change-password sub-form (3) — and no way to check a typo before submitting.

## The fix

One shared component, no new dependency: **`src/components/ui/password-input.tsx`** (`PasswordInput`). A native `<input>` plus a `type="button"` toggle using lucide's `Eye` / `EyeOff`, flipping `type` between `password` and `text`. State is per field (`useState(false)`), so a password and its confirm twin reveal independently and the state dies with the component (the `/profile` sub-form closes → masked again). Every input prop is spread through, so the eight call sites kept their zod wiring, `aria-invalid` borders, `aria-describedby` helpers and `autoComplete` values untouched — the swap is `<input type="password" …>` → `<PasswordInput …>`.

The component reads its own copy: `common.password.show` / `common.password.hide` (*Prikaži lozinku* / *Sakrij lozinku* · *Show password* / *Hide password*). Two keys per catalog, nothing else.

### Layout

Wrapper `relative`; the input keeps the caller's `inputClass` plus `w-full pr-11`; the button is `absolute inset-y-0 right-0 w-11` — full input height, so it is 44×48 on the auth forms and 44×44 on `/profile` (≥ 44px target either way) and nothing is a fixed pixel offset that drifts under the *Larger text* preference. Focus ring is the design-system `focus-visible:shadow-focus`; the input's own §7.2 focus/error states stay on the input.

### The rule that changed five call sites: never render `PasswordInput` inside an implicit `<label>`

Five of the eight inputs sat in `<label>text<input/></label>`. A `<button aria-label="Prikaži lozinku">` placed *inside* that label is a labelable descendant, so accname folds its label into the **input's** accessible name — a screen reader would announce the field as "Lozinka Prikaži lozinku". Same bug class this repo fixed twice before (password helper text, org helper text). Those five moved to the explicit `<div><label htmlFor=…/><PasswordInput id=…/></div>` shape the other three already used. New ids: `signup-confirm`, `reset-confirm`, `profile-password-current` / `-new` / `-confirm`. The a11y tree proves it: every password textbox is named exactly by its label on all four forms.

Other defaults, deliberate: the label swaps Show↔Hide rather than using `aria-pressed` (one or the other, never both); `type="button"` so Enter inside the field still submits and clicking the eye never does; no `aria-live` announcement (the swapped label is what gets read on next focus); no caps-lock warning, no strength meter.

## Verification

- `npm run lint` 0 errors (7 pre-existing `window.location.assign` warnings, none on touched lines) · `npx tsc --noEmit` clean · `npm run test` **746/746** (no unit surface — component code is outside the Vitest scope) · `npm run build` clean
- Browser, dev server, hr + en, **0 console errors** on every page: click → `type` flips, value visible, label and icon swap; click again → masked · per-field independence on all three password/confirm pairs · geometry asserted numerically (input `padding-right` 44px, button flush right, centred to the pixel, hit-test at its centre returns the button) · keyboard: Tab reaches the toggle with the focus ring, Space toggles, Enter in the field still submits · *Larger text* simulated in-page: root 18px, inputs and buttons both 50px, still centred · `/profile` cancel → reopen resets to masked + empty · 390px: no overflow
- Not verified: an actual password change or reset submit — unchanged code, and it would rotate the demo password

## Gotchas

- `cn(className, "w-full pr-11")` relies on `pr-*` beating the caller's `px-3`; confirmed live (`padding-right: 44px`, `padding-left` still 12px). If a future input class sets `pr-*` itself, the caller's value loses.
- Don't put a toggle button inside a `<label>` anywhere else either — the accessible-name pollution above is not specific to this component.

## Files

- `src/components/ui/password-input.tsx` (new) · `src/components/auth/login-form.tsx` · `src/components/auth/signup-form.tsx` · `src/components/auth/reset-password-form.tsx` · `src/components/settings/profile-card.tsx` · `messages/hr.json` · `messages/en.json`
