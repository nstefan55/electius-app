# OTP Email Verification

Credential signups now verify their email by typing a **6-digit code** instead of clicking a link. The code arrives in a branded email, gets entered in an in-app panel, and a successful verify auto-signs the user in. This replaces the link-based flow (2026-07-19): no cross-host link click, no dev-only cookie-host quirk, and it fulfills the project spec's original "salt + hash + OTP" auth promise. **Google OAuth users are untouched** — they arrive `emailVerified: true` from the provider, so no OTP ever fires for them.

Built on BetterAuth's native `emailOTP` plugin (ships inside the installed `better-auth@1.6.23`) — no new dependency, **no schema change**: codes persist in the existing `verifications` model through the `verificationToken` mapping, hashed at rest.

## Flow

```
Signup (credentials)                          Sign-in while unverified
  POST /api/auth/register → 201, no cookie      authClient.signIn.email → 403 EMAIL_NOT_VERIFIED
  sendOnSignUp fires → OTP email                sendOnSignIn fires → fresh OTP email
  form swaps to OTP panel                       login form swaps to the same OTP panel
        └── verifyEmail({ email, otp })  →  emailVerified=true + session (autoSignInAfterVerification)
              signup: hard nav /{locale}/setup   ·   login: hard nav /{locale} (home funnel)
```

Hard navigation (not client nav) so the proxy re-runs with the new session cookie — same pattern as every auth success in this app.

## Plugin configuration (`src/lib/auth/index.ts`)

| Option | Value | Why |
| --- | --- | --- |
| `overrideDefaultEmailVerification` | `true` | The `emailVerification` block keeps deciding **when** (sendOnSignUp / sendOnSignIn); the plugin swaps **what** gets sent. The old `sendVerificationEmail` callback and its 24h link expiry are deleted — exactly one send path. |
| `otpLength` | 6 | |
| `expiresIn` | 600 (10 min) | Plugin default is 5 — headroom for email delivery lag. |
| `allowedAttempts` | 5 | Code is invalidated (deleted) after 5 wrong guesses → `TOO_MANY_ATTEMPTS` (403), then a resend is required. |
| `storeOTP` | `"hashed"` | Hash-at-rest in `verifications` — a DB dump never yields live codes. Affects only the stored value, not the emailed code. |

Only the `"email-verification"` OTP type is enabled; the plugin's `"sign-in"` / `"forget-password"` types are deliberately dead branches — a leaked verification code can never log anyone in by itself. Password reset stays on the link-based flow (2026-07-20), unchanged.

## Storage

One row per pending code in `verifications`: identifier `email-verification-otp-<email>`, value = hash (verified live: 45-char blob, not digits), `expiresAt` = created + 10 min. A resend **replaces** the row (old code immediately invalid); a successful verify **consumes** it. Exceeding `allowedAttempts` deletes it — after that even the correct code returns `INVALID_OTP` (invalidation-by-deletion, no lingering locked state).

## Rate limiting

Two new virtual paths in `RATE_LIMIT_RULES` — now extracted to `src/lib/auth/rate-limit-rules.ts` (dependency-free, so tests can pin the map without booting the BetterAuth instance):

| Path | Limit | Key |
| --- | --- | --- |
| `/email-otp/send-verification-otp` | 3 / 15 min (`resendVerification` action) | IP + email |
| `/email-otp/verify-email` | 10 / 15 min (new `verifyOtp` action) | IP + email |
| `/send-verification-email` (legacy) | shares `resendVerification` | IP + email — **kept deliberately** |

The legacy path's UI died with the override, but the endpoint is still directly POST-able under the `/api/auth/[...all]` catch-all and still triggers a send — removing its rule would reopen an unthrottled email-send path (same bypass class as the 2026-07-21 audit's `/sign-up/email` HIGH). Both send endpoints share **one** limiter window, so alternating them can't double the budget.

Brute-force layering (two independent guards — don't collapse them): `allowedAttempts: 5` is per-code state in the DB row; `verifyOtp` 10/15 min is per-IP+email in Redis. Internal sends (sendOnSignUp/sendOnSignIn) ride the register/login paths and windows, not the resend window — verified live: an exhausted resend window does not block the login-triggered auto-send.

## OTP entry panel (`src/components/auth/otp-verify-panel.tsx`)

Shared by both forms (signup: post-201 · login: 403 branch). Props: `email`, `redirectTo`.

- **One styled input**, not six boxes: `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength=6`, mono + letter-spaced, digits filtered on change — native autofill from mail apps works, zero deps.
- **Resend** starts on a 60s countdown (a code was *just* auto-sent in both entry paths); the countdown is UX, the server limit is the guard. Cooldown resets optimistically on click so double-clicks can't fire twice.
- **Error map** (toasts, localized): `INVALID_OTP` → invalid, `OTP_EXPIRED` → expired, `TOO_MANY_ATTEMPTS` → tooMany, status 429 → rateLimited, else generic.
- i18n lives under `auth.signup.form.otp` (hr + en) — the login form renders the same panel/namespace. The old `verify.*` inbox-panel keys and the login `errors.unverified` toast key were removed; email copy is the new `auth.otpEmail` namespace.

## Email (`email.service.ts` → `sendOtpEmail`)

Shares the branded wrapper styling but has its own body: heading, one-line instruction, the code large/mono/letter-spaced in a highlight box, expiry note, "didn't request this" line. **No link, no CTA anywhere** (pinned by unit test). Throws on Resend error — fail-loudly, uniform with the other senders (accepted posture: BetterAuth docs suggest fire-and-forget sends to dodge timing-based enumeration; this codebase consistently awaits).

## `EMAIL_VERIFICATION_ENABLED` interaction

The flag (2026-07-20) keeps gating the whole system, unchanged semantics:

| | Enabled (default) | Disabled (`=false`) |
| --- | --- | --- |
| Register 201 | No cookie, `verificationRequired: true` → OTP panel | autoSignIn cookie, straight to `/setup`, zero sends |
| Unverified sign-in | 403 → OTP panel + fresh code | Can't occur (signs in normally) |

Accounts created while disabled stay `emailVerified: false`; flipping the flag on blocks them at login, but `sendOnSignIn` now sends an OTP instead of a link — still self-healing.

## Files

| File | Change |
| --- | --- |
| `src/lib/auth/index.ts` | `emailOTP` plugin (before `nextCookies`); `emailVerification` block reduced to the three *when* switches; rules map imported |
| `src/lib/auth/rate-limit-rules.ts` | New — extracted rules map + the two OTP paths (+ colocated test) |
| `src/lib/rate-limit.ts` | New `verifyOtp` limiter (10/15 min) |
| `src/lib/auth/client.ts` | `emailOTPClient()` → `authClient.emailOtp.*` |
| `src/lib/services/email.service.ts` | `sendOtpEmail` (code body); `sendVerificationEmail` removed (+ test coverage) |
| `src/components/auth/otp-verify-panel.tsx` | New shared panel |
| `src/components/auth/signup-form.tsx` | Inbox panel → `<OtpVerifyPanel redirectTo=/{locale}/setup>` |
| `src/components/auth/login-form.tsx` | 403 toast → `<OtpVerifyPanel redirectTo=/{locale}>` |
| `messages/hr.json` · `messages/en.json` | `auth.otpEmail` + `auth.signup.form.otp`; orphaned link-flow keys removed |

## Caveats

- **OTP email locale defaults `hr`** — same as every transactional email; thread the user's locale through when `en` ships.
- **Google skip not live-run** (interactive OAuth consent can't be automated in this environment). It rests on `sendOnSignUp` firing only for unverified users while Google arrives pre-verified — the pre-existing behavior this feature didn't touch. A manual Google signup is a 30-second sanity check.
- Stale pre-migration verification **links** die naturally (they were stateless JWTs); affected users sign in → 403 → fresh OTP.
- Single input, not segmented boxes — a segmented input is a pure polish follow-up.

## Verified

`npm run test` 90/90 (5 new: OTP body has code + zero links + throws on Resend error; rules map pins both new paths, the kept legacy rule, and the shared window) · `npm run build` clean. Live on the dev server (dev DB, real Resend → Gmail): signup → panel → wrong code toast → right code → session + `/hr/setup`, with the `verifications` row SQL-proven hashed, +10 min expiry, consumed on verify; login-403 → panel → verify → home funnel (hr + en chrome); resend invalidates the old code; 5th wrong attempt 403 and the correct code stays dead; 4th send in window 429 with `Retry-After`; flag-off register 201 with cookie and zero sends. Smoke users, verification rows, and rate-limit keys removed afterwards (SQL-proven zero residue).
