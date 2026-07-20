# Forgot Password

Full password-reset flow: the login page's "Forgot password?" link → `/forgot-password` (request a link) → Resend-delivered email → `/reset-password` (set a new password). Built on BetterAuth's native reset flow — no custom token table, no schema change. Includes a related **auth redirect-loop fix** (see below) discovered while testing.

## Flow

```
/login → "Forgot password?" → /forgot-password
  → authClient.requestPasswordReset({ email, redirectTo: /{locale}/reset-password })
  → 200 always (enumeration-safe) → "Check your email" panel

Email link → GET /api/auth/reset-password/<token>?callbackURL=/{locale}/reset-password
  → valid   → 302 /{locale}/reset-password?token=<token>
  → invalid → 302 /{locale}/reset-password?error=INVALID_TOKEN (error panel + "request new link")

Reset form → authClient.resetPassword({ newPassword, token })
  → token burned atomically (single-use) → success toast → /login → sign in with the new password
```

## Where reset tokens live

**In the existing `VerificationToken` model** (project requirement). Unlike email verification (stateless JWTs), BetterAuth persists reset tokens as DB rows through its `verification` model — already mapped by `verification: { modelName: "verificationToken" }`. Row shape: `identifier = "reset-password:<token>"`, `value = userId`, 1-hour expiry. Consumption is atomic (`consumeVerificationValue`), so a token can never be used twice, even by concurrent requests.

## Security properties

- **No user enumeration**: identical 200 + identical UI copy ("if an account exists for …") whether or not the email has an account.
- **Single-use, 1h tokens**; reuse or expiry → `INVALID_TOKEN` surfaced as a localized toast / error panel.
- **Existing sessions are revoked on reset** (BetterAuth default) — a stolen session dies when the owner resets. This is what exposed the redirect loop below.
- Orthogonal to `EMAIL_VERIFICATION_ENABLED` — reset works in both toggle states, deliberately ungated.

## Files

| File | Change |
| --- | --- |
| `src/lib/auth/index.ts` | `emailAndPassword.sendResetPassword` wired to the email service. |
| `src/lib/services/email.service.ts` | New `sendResetPasswordEmail`; the shared branded template (heading/body/CTA/fallback/expiry) factored into one `sendActionEmail` helper used by both senders. |
| `src/app/[locale]/(auth)/forgot-password/page.tsx` + `forgot-password-form.tsx` | Email form → inbox panel (enumeration-safe copy), "back to sign in" link. Auth split-screen chrome; brand panel reuses `auth.login.brand` keys. |
| `src/app/[locale]/(auth)/reset-password/page.tsx` + `reset-password-form.tsx` | Reads `?token`/`?error` client-side (`useSearchParams`); invalid → error panel with CTA back to `/forgot-password`; valid → password + confirm (zod: min 8 + match). |
| `src/components/auth/login-form.tsx` | Phase-4's `#` dead link is now a real localized `/forgot-password` link. |
| `src/proxy.ts` | `/forgot-password` + `/reset-password` added to `PUBLIC_AUTH_PATHS` (public pre-session on the dashboard host; apex 307s them across). |
| `messages/hr.json` / `en.json` | New `auth.resetEmail` (email copy), `auth.forgot`, `auth.reset` namespaces. |

## Redirect-loop fix (bundled)

**Symptom**: Firefox "The page isn't redirecting properly" after a password reset, while still holding the old session cookie.

**Cause**: the proxy's auth gate is cookie-PRESENCE only (by design — no DB in middleware). Its signed-in bounce sent any cookie-holder from `/login` to `/home`, but `requireSession()` (real DB validation) found the revoked session and sent them back to `/login` — an infinite loop for any stale cookie.

**Fix**: the presence-based signed-in bounce was **removed from the proxy**. New `src/components/auth/session-bounce.tsx` (async server component rendered inside the login + signup pages) validates the session **against the DB** and only then redirects to `/home`. Stale cookies now simply render the login page; real sessions bounce as before. Rule of thumb recorded: presence checks belong in middleware, but any decision that depends on session *validity* must live where validation happens.

Also, the signed-in bounce no longer covers `/forgot-password`/`/reset-password` at all — the emailed reset link must reach the form even for a browser still holding a session.

## Verified

End-to-end on the dev server (dev DB, real Resend sends, plus a full Playwright browser run): request → token row proven in `verifications` via SELECT (`reset-password:…`, 1h) → emailed-link redirect chain (apex → dashboard host, token preserved) → reset 200 → old password 401, new password 200 → token reuse 400 `INVALID_TOKEN` → 0 leftover token rows. Enumeration check: identical responses for existing/unknown emails. Loop fix: stale-cookie `/hr/home` resolves in exactly 1 redirect to a rendered login page; valid-session login/signup still bounce. `npm run build` passes.

## Caveats

- Resend fallback-sender restriction applies in dev until the domain is verified (same as email verification): sends to arbitrary addresses fail loudly.
- Dev-host quirk: the emailed link lands on `localhost:3000` (`BETTER_AUTH_URL`) and hops to `dashboard.localhost` via the apex redirect — prod is unaffected (single `dashboard.electius.com` host).
- The design prototype (`Forgot Password.dc.html`) was not machine-readable at build time — pages follow the design system + the login/signup chrome; diff against the prototype when it lands in `context/design/`.
