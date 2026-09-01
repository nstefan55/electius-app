# Fix: "your password was changed" notification (v0.9.43)

**Branch:** `fix/password-change-notice` · **Decision:** production-readiness Layer 4

## The gap

Neither the reset flow nor the settings-page password change sent the account owner any notice. A hijacked session that changes the password, or a reset, left the real owner unaware. Layer 4 flagged it as a small security add.

## The two paths, two mechanisms (verified against installed better-auth 1.7.2 source)

Both `resetPassword` and `changePassword` end at `internalAdapter.updatePassword(userId, …)` — but neither a database hook nor `hooks.after` cleanly yields the affected email on **both** paths:

- The adapter's `updateMany` returns a Prisma **count**, not the row, so `databaseHooks.account.update.after` gets no userId.
- The reset endpoint's context carries **no session** (reset creates none), and OAuth token refresh also updates an account, so `account.update.after` can't be safely used for change-password either (it can't tell a password change from a token refresh — count only).

So each path uses its own purpose-built callback:

| Path | Mechanism | Email source |
| --- | --- | --- |
| Password **reset** | `emailAndPassword.onPasswordReset({ user })` — fires after the reset with the full user (`password.mjs:172`) | `user.email` |
| Settings **change** | `hooks.after` matching `ctx.path === "/change-password"` | the session (`getSessionFromCtx`) |

**The after-hook fires even on failure** — `dispatch.mjs:242` runs `runAfterHooks` regardless of whether the endpoint threw, setting `ctx.context.returned` to the `APIError`. A wrong current password throws `INVALID_PASSWORD` *before* `updatePassword`, so the guard `if (ctx.context.returned instanceof Error) return;` skips the notice on a failed change (APIError extends Error).

**Both sends are best-effort** — wrapped in `try/catch` that logs and swallows. The password change has already committed; a notification-send failure (Resend down) must not turn a successful change or reset into an error the user sees.

Locale comes from `localeForEmail(email)` — the same resolver every admin email uses.

## Email

New `EmailType` `"password-changed"` + `TEMPLATE` entry, and `sendPasswordChangedEmail(to, locale)` — **no link, no variables** (`variables: {}`), no idempotency key (each change is a distinct event). Two published Resend templates `electius-password-changed-{hr,en}`, built from the verified `electius-reset` shell with the CTA/link removed and a warning box ("Niste vi? / Not you?" → `contact@electius.com`). Security notice, not an action.

## Verification

- `npm run lint` 0 errors · `npx tsc --noEmit` clean (`ctx.context.returned` typed fine) · `npm run test` **735 passing** (+2: `sendPasswordChangedEmail` selects the locale template, carries no link/variables, tags `password-changed` with no election id, no idempotency key) · `npm run build` clean.
- Both templates created **and published** via Resend MCP (a draft is unsendable).
- Wiring is source-verified: `onPasswordReset` is called at `password.mjs:172`; the after-hook runs at `dispatch.mjs:242`.

**Not live-tested (recorded):** the full reset→inbox and change→inbox round trip — that needs a pre-verified account with a readable mailbox and belongs to **Gate 12**'s deploy-side email pass, which sends every template to a real inbox anyway. The two new templates join that launch-review surface. Cross-client rendering (Outlook etc.) is likewise Gate 12's.

## Files

- `src/lib/services/email.service.ts` — `EmailType`, `TEMPLATE`, `sendPasswordChangedEmail`.
- `src/lib/services/email.service.test.ts` — 2 new tests.
- `src/lib/auth/index.ts` — `onPasswordReset` + `hooks.after` for `/change-password`.
- Resend (external): `electius-password-changed-hr` / `-en`, published.
