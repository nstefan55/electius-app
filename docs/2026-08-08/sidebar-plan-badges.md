# Sidebar Plan Badges — PRO on the account block, Beta by the mark

**Branch:** `feature/sidebar-plan-badges` · **Version:** 0.9.18 (patch) · **Date:** 2026-08-08
**Spec:** `context/features/pro-features-implementation-spec.md` §4 — the first of that file's four
slices, shipped on its own branch. No migration, no server action, no new query while billing is off.

Two pills in the dashboard sidebar: **PRO** on the account block, **Beta** beside the "Electius"
wordmark. Neither gates anything and neither is a link — they are the *presentation* of entitlement,
which is why the honesty rules that govern the `/settings` plan grid govern these too.

---

## Findings index

Read these before touching the files; each one cost time to discover.

1. **The spec's "three PRO copies" were two.** Two were the same violet pill written differently; the
   third is a different badge entirely and stayed where it is — §2.
2. **The account block cannot fit a pill on the name line.** Its content column is ~114 px and a pill
   costs 41 px, so the spec's placement truncated *every* name, including `Demo User` — §3.
3. **`User.isPro` is the wrong truth source, and so is the resolver alone.** Each lies in a different
   direction; the rule needs both — §1.
4. **The PRO pill is immune to the high-contrast preference** because it uses off-token hex values —
   a real consequence of the token decision in §2.
5. **One mutation the tests cannot catch**, and it is not fixable today — §6.

---

## 1. Where "PRO" gets its truth

`showProBadge(organizationId)` in `src/lib/services/entitlement.service.ts`:

```ts
export async function showProBadge(organizationId: string): Promise<boolean> {
  if (!BILLING_ENABLED) return false;
  return (await resolveEntitlement(null, organizationId)).kind !== "free";
}
```

Both obvious shortcuts are wrong, in opposite directions:

| Keyed on | What happens today | Why it is wrong |
| --- | --- | --- |
| `User.isPro` | hidden on every account | while `BILLING_ENABLED !== "true"` every org **has** Pro behaviour but `isPro` is `false` on every row — the badge would be hidden precisely where Pro is held |
| `resolveEntitlement()` alone | shown on every account | with billing off the resolver returns `pro` for **everyone**, while `/settings` renders its `prelaunch` state that deliberately makes no plan claim — two surfaces, one account, contradicting each other |
| **both, ANDed** | shown on no account | correct: the claim appears only once billing is real |

So **today the sidebar carries Beta and never PRO.** After `BILLING_ENABLED=true` it carries PRO for
paying orgs.

The rule lives in the service rather than in `(app)/layout.tsx` on purpose. `BILLING_ENABLED ?
user.isPro : true` at a call site looks equivalent, but it *asserts* the resolution order instead of
asking for it, and goes stale the day pay-per-election adds a purchase branch. No surface re-derives
the resolution order for itself.

**Cost:** zero DB reads while billing is off — the `!BILLING_ENABLED` short-circuit returns before
`resolveEntitlement` is called, which a test pins by asserting the Prisma mock was never touched. One
indexed `findFirst` per dashboard page load once billing is on.

## 2. One badge component — and what it did *not* absorb

`src/components/ui/plan-badge.tsx` exports `ProBadge` + `BetaBadge`.

The spec counted three PRO pills and asked for all three to collapse. On inspection:

| Site | Treatment | Outcome |
| --- | --- | --- |
| `wizard/wizard-shared.tsx:95` | violet fill, arbitrary hex `#F5F3FF` / `#6D28D9` | collapsed |
| `dashboard/dashboard-empty-state.tsx:75` | violet fill, Tailwind `violet-50` / `violet-700` | collapsed |
| `elections/election-overview.tsx:314` | **amber outline** on the navy turnout card | **left alone** |

The first two are the same pill expressed two ways — that is the real drift risk and it is now gone.
The third is not a copy of it: it is a bordered `warning-500` pill sitting inside the live-turnout
badge cluster on a dark card. Moving it into the shared component would have repainted it, and the
spec's own instruction was *move as-is, do not repaint while moving*. A comment in `plan-badge.tsx`
records why it stayed.

**Token decision, recorded once:** violet exists in neither `globals.css` `@theme` nor
design-system §2. The literal hexes were kept — one place now instead of three, and zero pixel change
— rather than promoting `--color-pro-*`, which means adding a colour to the design system and is a
design call, not an implementation one.

⚠ **Consequence:** the high-contrast accessibility preference remaps `--color-neutral-*` tokens, so
the **Beta** pill responds to it (6.87:1 → 9.96:1) and the **PRO** pill does not. PRO's internal
contrast is 6.48:1 and passes AA in both states, so nothing fails — but if a `--color-pro-*` pair is
ever promoted, that is what makes it responsive.

**Geometry:** `h-4.5` / 10 px / bold — smaller than design-system §7.9 (20 px, 12 px/500). Both pills
share it so two pills in one sidebar match, and the deviation is recorded once in the extracted file
instead of three times in three components. `shrink-0` is on the shared pill class: a badge that
truncates is worse than no badge.

## 3. Placement — why not the name line

The spec (§4.5) puts PRO on the name line with `shrink-0` "so the name truncates and the badge never
does". Measured in the browser, that stated trade-off is much worse than it sounds:

```
sidebar 240px − padding 24 − avatar 38 − gap 12 − chevron 16 − gap 12  ≈  114px for name + org
pill 35px + gap 6                                                      =   41px
name is left with                                                          73px
"Demo User" needs                                                          76px   ← truncates
"Nikola Štefančić" needs                                                  110px   ← truncates badly
```

Every name truncates, including the shortest one in the fixture. **Shipped instead: a centred column
at the far right, PRO above the chevron** (user's call after seeing the alternative).

```
[ DU ]  Demo User                    [ PRO ]
        Sveučilište u Zagrebu           ⌃⌄
```

That column is `flex flex-col items-center gap-1.5 shrink-0`, so the pill and the chevron share a
centre axis (verified: both centre X = 198).

**Cost, stated plainly:** the right column is now as wide as the pill rather than as wide as the
chevron, so the name column goes 114 → 95 px **when PRO is showing**. Names needing more than 95 px
truncate — `Nikola Štefančić` (110 px) does. In the shipped state (billing off, no PRO) there is
**no cost at all**: chevron inset stays 24 px and the name keeps its full 114 px, verified after the
change. If that truncation matters later, the gap between columns is where the pixels are.

An intermediate attempt put the pill inline on the **organization** line, which wraps instead of
truncating and cost the name nothing. It was replaced on request; noting it here because it is the
fallback if the 95 px ever becomes a problem.

## 4. Wiring — server-read flags, prop-drilled

`SidebarNav` is a client component, so both booleans are resolved in `(app)/layout.tsx`:

- `showPro` → `await showProBadge(organizationId)`, added to the shell user projection **by name**.
- `beta` → `process.env.BETA_BADGE_ENABLED === "true"`, a separate prop (it is a product flag, not a
  user field).

**Neither flag may be `NEXT_PUBLIC_`.** Those inline at build time, so a flip needs a rebuild and the
server and client copies can drift — the reasoning that shaped `EMAIL_VERIFICATION_ENABLED`.

`ShellUser` gained exactly one named field, appended to the existing explicit projection and **never**
a spread. That projection is what keeps `email` and `isPro` out of the RSC payload (2026-07-11
finding #3); the same lesson bit the GDPR export (2026-08-02), where TypeScript does not strip extra
runtime keys. The field is called `showPro`, deliberately **not** `isPro` — it is the resolver's
verdict, and a field sharing the column's name invites the next reader to treat it as the column.

`BETA_BADGE_ENABLED` is read directly at its single reader rather than re-exported from
`entitlement.service.ts`; that module is about entitlement resolution and a badge flag is not
entitlement. The rule it does obey: one flag, one reader.

## 5. Accessibility and copy

- Visible text reuses what exists: Beta reads `dashboard.settings.billing.chipBeta` (same claim as
  `/settings` — a second key or a second colour would be drift by construction), and "PRO" stays
  untranslated, as it already was in all three original copies and as the marketing pricing page
  prints it.
- A bare "PRO" beside a person's name is ambiguous to a screen reader, so each pill carries an
  `sr-only` suffix: the a11y tree reads **"Demo User Sveučilište u Zagrebu PRO plan"**. That needed
  copy, so one small `common.badges` block was added (`proNote` / `betaNote`, hr + en) — the spec's
  "no new i18n key" rule is about not duplicating the visible Beta label, which is honoured.
- Colour is never the only signal.

**Placement rules:** Beta is hidden on the 64 px collapsed rail — the wordmark hides there too, and a
lone pill under a 30 px mark reads as a label *for the mark*. The mobile drawer is always expanded, so
both pills show there (it is a portal outside `<aside>`, confirmed).

## 6. Tests

Three cases added to `src/lib/services/entitlement.service.test.ts` (**504 total**, +3), using the
file's existing env-at-import harness (`vi.resetModules` + `vi.stubEnv` + dynamic import).

Mutation-checked:

| Mutation | Result |
| --- | --- |
| billing off → `return true` | ✅ caught |
| drop the `!== "free"` check | ✅ caught |
| bypass the resolver, read `isPro` directly | ❌ **not caught** |

The third is honest and not fixable today: with billing on, the resolver's only input *is* that
column, so the two implementations are behaviourally identical and no test can separate them. It goes
stale the day a purchase branch exists. The comment on `showProBadge` carries that obligation, not a
test.

## Files changed

| File | Change |
| --- | --- |
| `src/components/ui/plan-badge.tsx` | **new** — `ProBadge` + `BetaBadge`, one geometry, one token decision |
| `src/components/dashboard/sidebar-nav.tsx` | both pills; `beta` prop; account block right column |
| `src/components/dashboard/dashboard-shell.tsx` | `ShellUser.showPro`, `beta` prop, passed to both `SidebarNav` mounts |
| `src/app/[locale]/(app)/layout.tsx` | resolves both flags; projection gains `showPro` |
| `src/lib/services/entitlement.service.ts` | **+`showProBadge()`** |
| `src/lib/services/entitlement.service.test.ts` | +3 cases |
| `src/components/elections/wizard/wizard-shared.tsx` | `ProBadge` **deleted** (moved) |
| `src/components/elections/wizard/step-settings.tsx` | imports from `ui/plan-badge` |
| `src/components/dashboard/dashboard-empty-state.tsx` | inline pill **deleted**, uses `ProBadge` |
| `messages/{hr,en}.json` | `common.badges` (+4 lines each, CRLF preserved) |

Catalogs were injected by a script that **aborts unless a parse → serialise round trip reproduces the
file byte-for-byte first** — that guard is why the diff is 4 lines per catalog instead of the ~900 a
stray LF rewrite produces. Reuse it for any catalog edit.

## Verification

`npm run lint` clean · `npx tsc --noEmit` clean · `npm run test` **504 passed** · `npm run build`
clean (44 routes) · **zero application console errors** (the 8 warnings are the known `next/font`
preload noise).

Browser pass on the seeded dev DB, hr + en. All three entitlement states were driven by flipping
`BILLING_ENABLED` and `isPro` and restoring both:

| `isPro` | `BILLING_ENABLED` | PRO shown | Note |
| --- | --- | --- | --- |
| `true` | `false` | **no** | an `isPro`-keyed pill would have shown here |
| `true` | `true` | **yes** | `#F5F3FF`/`#6D28D9`, 18 px, reads "PRO plan" |
| `false` | `true` | **no** | Free org |

Also asserted rather than eyeballed: Beta pill exactly `#F3F4F6`/`#4B5563` at 18 px / 10 px / 700 ·
64 px collapsed rail shows **zero** pills and no chevron · mobile drawer (390 px) shows both, and is
confirmed outside `<aside>` · high contrast darkens the Beta pill to 9.96:1 · a 50-character name
clips while the pill stays 35 px and fully visible · PRO and chevron share a centre axis · wizard
step 4 still renders its two PRO pills with identical geometry after the extraction · `/en` reads
"Beta version" / "PRO plan".

**Fixtures restored:** `isPro` back to `false`, `BILLING_ENABLED` back to `false`, throwaway script
and screenshots deleted.

## Action required outside the code

**`BETA_BADGE_ENABLED` must be set in Vercel.** Added to `.env.development` and `.env.production`
(both gitignored), but the app cannot detect a missing variable — the same silent no-op that has
already caught Upstash and R2. Failure direction if forgotten: a true statement goes unshown, which
is the safe direction; the inverse default would print "Beta" over a launched paid product.

## What these are not

- **Not a gate and not navigation.** Neither pill changes behaviour, neither is a link. Plan
  management is `/settings`; a clickable badge would make the sidebar a second, worse route to it.
- **The code permits both pills at once.** Their honest settings are mutually exclusive — the day the
  sidebar starts claiming PRO is the day it must stop claiming Beta — but that is one launch config
  decision, not something enforced here.
- `npm run db:seed:pro` now has a **visible** effect in the app, but still only after
  `BILLING_ENABLED=true`, which the seed already warns about on every run.

## Still open in the parent spec

Three slices remain, each its own branch and its own patch bump:

- **§2 automatic 24 h voter reminders** — launch blocker. Needs `Election.reminderSentAt` as an
  idempotency marker, because `sendReminders` rotates every recipient's magic link.
- **§1 live results during voting** — launch blocker. Blocked on collapsing `resultsVisible` /
  `resultsMode` / `sealedResults` into one enum; decided at `start` to take the enum route.
- **§3 admin turnout emails** — not advertised. Ships as "Uskoro" + disabled.
