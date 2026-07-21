# Settings Phase 1 — Page Shell, Profile Card, Organization Card

**Route:** `dashboard.electius.com/{locale}/settings` · **Branch:** `feature/settings-phase-1`
**Specs:** `profile-settings-spec.md` (master index) + `profile-settings-phase-1-spec.md`, merged with `settings-profile-card-spec.md` (avatar, usage stats, creation date). Account deletion from the newer spec was deliberately deferred to phase 5.

## What shipped

The first slice of the settings build: the `/settings` page inside the `(app)` shell with two fully working cards. Later phases append cards to the same page (2: logo upload · 3: Stripe billing · 4: dashboard customizations · 5: account deletion) — no placeholder cards are rendered for them.

### Files

| File | Role |
| --- | --- |
| `src/app/[locale]/(app)/settings/page.tsx` | Server component — session + all data in one `Promise.all` |
| `src/components/settings/settings-card.tsx` | Shared card chrome (header / body / footer) for this and future phases |
| `src/components/settings/profile-card.tsx` | Client — name fields, email, avatar, stats, password sub-form |
| `src/components/settings/organization-card.tsx` | Client — logo display, org name, contact email, language row |
| `src/actions/settings.ts` | `updateProfile` + `updateOrganization` server actions |
| `src/proxy.ts` | `/settings` added to `DASHBOARD_ONLY_PATHS` (apex 307s to the dashboard host) |
| `messages/hr.json` / `en.json` | New `dashboard.settings` namespace |
| `src/components/ui/app-toaster.tsx` | Toasts app-wide: larger (16px text, more padding), longer (5s, errors 6s) |

## Profile card ("Vaš profil")

- **Name** — two inputs backed by the single `User.name` column: split on the **first space** for display, `"${first} ${last}"` joined on save (same convention as `/setup`). No schema change.
- **Avatar** — Google `user.image` when present (plain `<img>`; Google hosts aren't in `next/image` remotePatterns), otherwise `InitialsAvatar`. Next to it: full name, "Član od {date}" (`User.createdAt` via next-intl's `getFormatter`), and two usage stats (active / total elections, org-scoped `election.count`s).
- **Email** — read-only, with a **Potvrđeno** badge only when `emailVerified` is true. When false nothing renders — the unverified banner + resend belongs to the OTP spec.
- **Password change** — renders **only for credential accounts** (`accounts.some(providerId === "credential")`); Google-only users see nothing. Collapsed behind a "Promijeni lozinku" button, expands inline (no modal/page). Uses BetterAuth's `authClient.changePassword` with `revokeOtherSessions: true` — a password change kills every other session, the current one survives. Wrong current password (`INVALID_PASSWORD`) maps to a specific localized error. No hand-rolled hashing anywhere.

## Organization card ("Organizacija")

- **Logo** — display only (72px slot, `logoUrl` image or dashed "Logo" placeholder). No upload affordance — that's phase 2.
- **Name + contact email** — saved via `updateOrganization`. `contactEmail` is `@unique`, so Prisma **P2002** is caught and surfaced as "Ta kontakt e-pošta već je u upotrebi" instead of a generic failure.
- **Language selector** — the existing `LanguageSwitcher` mounted as a labeled row (its long-planned home since dashboard phase 2). `en` stays disabled via the component's own gate. **Recorded deviation:** the design prototype's standalone Language card (HR/EN option cards) is superseded by this row — do not build it.

## Patterns to reuse

- **Server actions:** zod parse → `requireSession()` → write scoped to the session's own user/org (`where: { email: session.user.email }` / `{ id: session.organizationId }`) → `{ success, error }` return. A foreign id can never reach a where clause.
- **Dirty tracking:** client keeps a `saved` baseline; the footer button is disabled until inputs differ, and the baseline resets after a successful save. `router.refresh()` then re-runs the server tree so the sidebar/topbar pick up the new name — `requireSession()`'s `cache()` keeps that at one DB round trip.
- **A11y:** helpers live outside `<label>` on `aria-describedby` (accessible-name pollution — same fix as auth phase 4); zod failures set `aria-invalid`, which drives the error border via `aria-invalid:border-error-500`.

## Verification

`npm run build` passes. Playwright against the seeded dev DB: both cards render with real session data; profile and organization saves round-trip and update the sidebar; save buttons disable until dirty; password change errors on a wrong current password and succeeds on the correct one with the session surviving; `LanguageSwitcher` renders with `en` disabled; `/en/settings` renders English; apex `/hr/settings` 307s to the dashboard host.

Not live-tested (straight-line code, no fixture available): the duplicate-`contactEmail` P2002 path (seed has a single org) and the Google-avatar branch (demo account is credential-only).

## Known ceilings

- Toast durations diverge from design-system §7.11 (5s all / errors never auto-dismiss) by product decision: 5s success, 6s error, larger type.
- Terms/privacy-style links and the trust footer line ship with the last card phase so they stay at the true bottom of the page.
