# Email Verification Toggle Flag

One env var — `EMAIL_VERIFICATION_ENABLED` — switches the entire email-verification-on-register system (2026-07-19 feature) on or off. Built for dev/testing: until a domain is verified in Resend, the fallback sender only delivers to the Resend account owner, so any other test email could never verify and therefore never log in. Also serves as a reference pattern for future projects.

## Behavior

| | Enabled (default) | Disabled (`=false`) |
| --- | --- | --- |
| Register (201) | No session cookie, `verificationRequired: true` | **autoSignIn cookie**, `verificationRequired: false` |
| Verification email | Sent via Resend (`sendOnSignUp`) | Never sent |
| Signup form after 201 | "Check your email" panel | Hard nav straight to `/{locale}/setup` |
| Sign-in while unverified | 403 `EMAIL_NOT_VERIFIED` + auto re-send | 200 — signs in normally |
| Google OAuth | Unaffected (arrives pre-verified) | Unaffected |

## How the flag propagates

```
process.env.EMAIL_VERIFICATION_ENABLED !== "false"
  → emailVerificationEnabled (exported const, src/lib/auth/index.ts)
      → gates sendOnSignUp / sendOnSignIn / requireEmailVerification
      → register route echoes it as data.verificationRequired in the 201
          → signup form branches: inbox panel vs /setup navigation
```

The client is deliberately **not** given a `NEXT_PUBLIC_` var. `NEXT_PUBLIC_` values are inlined into the JS bundle at build time — flipping one would require a rebuild, and server/client could drift. Echoing the flag through the register API response keeps a single source of truth read at one place, server-side.

## Files

| File | Change |
| --- | --- |
| `src/lib/auth/index.ts` | New exported const `emailVerificationEnabled`; `sendOnSignUp`, `sendOnSignIn`, `requireEmailVerification` now read it instead of `true`. |
| `src/app/api/auth/register/route.ts` | 201 response adds `data.verificationRequired`. The existing cookie-forward loop (a no-op while verification is on) now carries the autoSignIn cookie when it's off. |
| `src/components/auth/signup-form.tsx` | Parses the 201 body; `verificationRequired: false` → `window.location.assign(/{locale}/setup)` (hard nav so the proxy re-runs with the cookie), otherwise the existing inbox panel. Missing/undefined field falls through to the panel — fails toward the stricter UX. |

No schema change, no new dependency, no i18n change (the disabled path reuses the pre-existing funnel; the 403 toast path simply can't fire).

## Configuration

| Env var | Values | Notes |
| --- | --- | --- |
| `EMAIL_VERIFICATION_ENABLED` | anything / absent = **on** · literal `false` = off | Default-on is the prod-safe direction: `.env.production` needs no entry. Set `false` in `.env.development` when testing signups with emails Resend can't deliver to. |

The server reads the var at module load; Next dev hot-reloads `.env.development` changes, production deployments pick it up on boot.

## Caveats

- **Accounts created while disabled stay `emailVerified: false`.** If the flag is later turned on, those users are blocked at login — but `sendOnSignIn` immediately re-sends them a verification link, so the system self-heals without admin intervention.
- The flag gates the *flow*, not the service: `email.service.ts` is untouched and other future email types (invitations, reminders) are unaffected.

## Verified

Both states exercised live on the dev server (dev DB): disabled — register 201 **with** session cookie + `verificationRequired: false` (the 201 itself proves no send: a Resend call to the fake test domain would have thrown), unverified sign-in 200; enabled — register 201 without cookie + `verificationRequired: true` (real Resend send), unverified sign-in 403. Smoke users removed afterwards. `npm run build` passes (26 routes, TypeScript included).
