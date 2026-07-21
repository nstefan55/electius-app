# Setup Page — Organization Creation & Profile Completion

> Branch `feature/setup-page` · Spec `context/features/setup-page-spec.md` · Design `context/design/electius-setup-page-design/Account Setup.dc.html`

The `/setup` page is the post-signup step that creates the admin's **organization** and completes their profile. It is the step that unblocks fresh accounts: `requireSession()` redirects any signed-in but org-less user to `/setup`, so until this page existed, new registrations could never reach the dashboard.

## What it does

1. User signs up (credentials or Google OAuth) → autoSignIn → lands on `/{locale}/setup`.
2. The page collects: **first name · last name · organization name · organization type** (University or school / Company / Union / Association or club / Other). The profile image is display-only: the Google photo when present (`user.image` from BetterAuth), otherwise a live-updating initials avatar.
3. **Continue to onboarding** saves and navigates to `/onboarding`. **Skip to dashboard** ALSO saves and navigates to `/dashboard` — skip only bypasses the onboarding hop. Both buttons are disabled until all four fields are filled.
4. Revisiting `/setup` with an existing org prefills every field and updates **in place** — it never creates a second organization.

> Why skip saves: a skip that saved nothing would loop forever — `requireSession()` bounces org-less users straight back to `/setup`. The design prototype confirms this reading: both buttons gate on the same completeness check.

## Files

| File | Role |
| --- | --- |
| `src/app/[locale]/(auth)/setup/page.tsx` | Server component: raw `auth.api.getSession` check (→ `/login` if invalid), revisit prefill query, splits `user.name` into first/last |
| `src/components/auth/setup-form.tsx` | Client: full-screen design port (header with email + sign-out, 440px card, avatar row, fields, footer) |
| `src/actions/setup.ts` | `completeSetup` server action: zod validation → create org atomically or update in place |
| `prisma/migrations/20260717114238_add_organization_type/` | `OrganizationType` enum + nullable `organizations.type` column |
| `messages/{hr,en}.json` | New `auth.setup` namespace (replaces the phase-2 placeholder keys) |

## Key decisions

- **Schema addition:** the spec collects org type but v2 had no column for it → `OrganizationType` enum (`UNIVERSITY / COMPANY / UNION / ASSOCIATION / OTHER`) + `type OrganizationType?` on `Organization`. Nullable because pre-setup rows (seed) have no type. Applied via `prisma migrate dev` on the Neon `development` branch.
- **`completeSetup` must NOT use `requireSession()`** — that helper redirects org-less users *to* `/setup`, so the action meant to fix org-lessness would deadlock. It validates the raw BetterAuth session instead. Keep it that way.
- **Atomic first-time write:** `prisma.user.update` with a nested `organization.create` sets `name` + `organizationId` + the new org in one statement. `contactEmail` = the admin's email (schema requires it, unique).
- **Single card, not a multi-step wizard** — the spec's overview says "wizard", but the design prototype is one card; the design is the base-UI source of truth.
- **Org type is required** for both buttons (spec: "disabled buttons until all fields are selected") even though the prototype's demo JS excluded it from its check.
- **Native `<select>`** styled like the shared inputs — no dropdown library added.
- **A11y:** the org-name helper sits outside the `<label>` on `aria-describedby` (helper text inside a label pollutes the field's accessible name — same fix as the signup password field).

## Known ceilings

- Two truly concurrent first-time submits could each create an org (the client `pending` flag prevents double-clicks; a server-side race is negligible here).
- A `contactEmail` unique collision (another org already registered with that email) surfaces as the generic error toast.
- Footer privacy/terms links are `#` until the legal pages exist (same as login/signup).

## Verified

Full browser run (Playwright, dev server, seeded dev DB, org-less test user): login → auto-funnel to `/hr/setup` → disabled buttons → fill → Continue → org row correct in DB → `/hr/onboarding` → dashboard shows the new org with the empty state; revisit prefill + Skip → `/hr/dashboard` with the org updated in place (one org, no duplicate). `npm run build` passes (26 routes, TS included). Test fixture restored to org-less afterward.

## Open next

`/onboarding` content (currently a placeholder — Continue lands there), `/settings` page (image upload + editing the data collected here), OTP/forgot-password, legal pages.
