# Email Verification on Register

New email/password accounts must verify their email address by clicking a link sent via **Resend** before they can sign in. Built entirely on BetterAuth's native verification flow — no custom token table, no schema change.

## Flow

```
Signup form → POST /api/auth/register
  → BetterAuth signUpEmail (no session cookie — requireEmailVerification)
  → Resend delivers the verification email (sendOnSignUp)
  → form swaps to a "Check your email" panel

User clicks link → GET /api/auth/verify-email?token=<JWT>&callbackURL=/{locale}/setup
  → emailVerified = true, session opens (autoSignInAfterVerification)
  → 302 to /{locale}/setup — the normal setup/onboarding funnel continues

Sign-in while unverified → 403 EMAIL_NOT_VERIFIED
  → localized toast + a fresh verification link is auto-sent (sendOnSignIn)
```

Google OAuth is unaffected — those accounts arrive with `emailVerified: true` from the provider, so `sendOnSignUp` skips them.

## Files

| File | Change |
| --- | --- |
| `src/lib/services/email.service.ts` | **New** — first service-layer file. Resend transport (`resend` SDK, new dependency) + `sendVerificationEmail(to, url, locale)`; branded HTML + plain-text body. |
| `src/lib/auth/index.ts` | `emailVerification` block (`sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification`, `expiresIn: 24h`) + `emailAndPassword.requireEmailVerification: true`. |
| `src/app/api/auth/register/route.ts` | Accepts `locale` from the form, passes `callbackURL: /{locale}/setup` into `signUpEmail` so the emailed link lands in the right funnel. |
| `src/components/auth/signup-form.tsx` | Success no longer navigates to `/setup` (there is no session yet); renders a "Check your email" panel with the submitted address. Sends `locale` in the body. |
| `src/components/auth/login-form.tsx` | `error.status === 403` → `auth.login.form.errors.unverified` toast (key off status, not message text — locale-proof). |
| `messages/hr.json` / `messages/en.json` | New `auth.verifyEmail` (email copy), `auth.signup.form.verify` (panel), `auth.login.form.errors.unverified`; removed the orphaned signup `success` key. |

## Key decisions

- **Strict gating** (`requireEmailVerification: true`): unverified accounts cannot sign in at all. This also means `signUpEmail` stops issuing the autoSignIn cookie — the old signup → `/setup` hop is replaced by the inbox panel.
- **"Resend link" costs zero UI**: `sendOnSignIn: true` means every blocked sign-in attempt re-sends a fresh link; the login toast tells the user to check their inbox.
- **Stateless tokens**: BetterAuth email-verification tokens are signed JWTs (24h `expiresIn`), not rows in the `verifications` table — nothing to clean up, links survive restarts.
- **Email copy lives in the i18n catalogs** (`auth.verifyEmail`), read directly by the service (emails run outside next-intl's request context). Locale currently defaults to `hr` (MVP); thread the user's locale through when `en` ships.

## Configuration

| Env var | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Required. Present in `.env.development` and `.env.production`. |
| `RESEND_FROM_EMAIL` | Optional sender, e.g. `Electius <noreply@electius.com>`. Falls back to `onboarding@resend.dev`. |
| `BETTER_AUTH_URL` | Already set per env — verification links are built on this host (dev `http://localhost:3000`, prod `https://dashboard.electius.com`). |

## Caveats

- **Resend sender restriction**: until the production domain is verified in Resend and `RESEND_FROM_EMAIL` is set, the fallback `onboarding@resend.dev` sender only delivers to the Resend account owner's address plus Resend's test addresses (`delivered@resend.dev`). Registering arbitrary emails in dev fails at the send step — and because a failed send throws, the signup itself fails loudly rather than stranding a user who can never verify.
- **Pre-existing unverified users** in the dev DB are now blocked at login. Seeded accounts are safe (`prisma/seed.ts` sets `emailVerified: true`); flip test fixtures manually if needed.
- **Dev host quirk** (same as Google OAuth, recorded in auth phase 1): the verification link lands on `localhost:3000`, so the auto-sign-in cookie is set on the apex origin, and the redirect to `dashboard.localhost` won't carry it — the user gets bounced to `/login` once. Prod is unaffected (auth and dashboard share `dashboard.electius.com`).
- Invalid/expired tokens redirect to the callback with `?error=INVALID_TOKEN`; the setup page doesn't currently surface that query param.

## Verified

Full loop exercised live against the dev server with real Resend sends (`delivered@resend.dev` test inbox): register → 201 without session cookie → correct link (24h JWT, `callbackURL=/hr/setup`) → pre-verify sign-in 403 + auto re-send → link click → 302 to `/hr/setup` **with** session cookie → post-verify sign-in 200 → garbage token → `?error=INVALID_TOKEN`. Smoke user removed afterwards. `npm run build` passes (26 routes, TypeScript included).
