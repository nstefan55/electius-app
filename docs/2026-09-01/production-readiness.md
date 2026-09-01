# Production Readiness — 13 Gates (2026-09-01 session)

Executing `context/features/production-readiness-spec.md` against `main` at **v0.9.39 → v0.9.45**
(Next 16.3.3). The spec was written at v0.9.17; several gates had already shipped on other
branches, so this session re-verified each gate against current `main` before acting (the spec's
own §0.5 rule).

Ordering followed the spec: **Phase A** read-only audits → **Phase B** remediation (one branch per
finding, §15). Phases C–E (cleanup, production migration, deploy-side delivery) are owner/deploy work
and are listed at the end, not executed.

---

## Phase A — audits (read-only)

Run in parallel via subagents; nothing changed.

| Gate | Tool | Result |
| --- | --- | --- |
| 1 · Auth & security | `auth-auditor` | **One HIGH** (registration DoS — fixed in Phase B); two LOW/INFO, both inert/known. All 6 pass-criteria answered with file:line citations. Report at `docs/audit-results/AUTH_SECURITY_REVIEW.md` (gitignored). |
| 2 · `/security-review` | — | Reconciled: the command is diff-oriented and the tree was clean. The two independent full-tree security lenses the spec wants are Gate 1 + Gate 3 (security category), both clean. `/security-review` reserved for per-branch use. |
| 3 · Code scan | `code-scanner` | **PASS** — zero security/correctness findings across 12 services, 6 action files, 4 db-layer files, 11 API routes, proxy, auth. One latent LOW (vote API caps a ballot at 100 selections vs 500 possible options — safe rejection); two informational quality/perf notes. |
| 4 · UI review | `ui-reviewer` | **PASS** (no-session surfaces) — 0 console errors, no 390px overflow, focus states present, no `aria-disabled` misuse, across voter/marketing/auth × hr/en × 390/768/1280. Two dead-link findings (auth footer `href="#"`; marketing `#pricing` on your WIP). Required installing Playwright Firefox v1542. |
| 6 · CI/CD | inspection | **PASS** — `.github/workflows/ci.yml` is the shipped Option-B pipeline; `dependency-audit` no longer carries `continue-on-error`, confirming the dependency-update branch landed. D1 discharged. |
| 7 · DB safety | `prisma migrate status` + reads | **Repo-side PASS** — 14 migrations synced to development; seed refuses without `TEST_DEMO_PASSWORD`. Production-side checks + the stale untracked `demo-seed.production.sql` are owner items. |
| 13 · Caching | inspection | `/results/[id]` ISR confirmed present (v0.9.38); marketing static blocker confirmed and **fixed in Phase B**. |

Baseline at start: `tsc --noEmit` clean · 730 tests · lint 0 errors · no duplicate env keys · Stripe
`STRIPE_PRICE_ID_*` naming drift already resolved.

---

## Phase B — remediation (6 fixes, all merged, unpushed until this session's push)

Each: branch → coder/direct implement → review → `lint`+`tsc`+`test`+`build` → browser-verify where
it renders → `npm version patch` → pathspec-limited commit → `--no-ff` merge → dev doc. WIP untouched
throughout. Per-fix detail in the sibling docs named below.

| Version | Branch | What | Doc |
| --- | --- | --- | --- |
| 0.9.40 | `fix/register-ratelimit-headers` | **HIGH.** `/api/auth/register` omitted `headers` on the internal `signUpEmail`, so the `/sign-up/email` hook keyed `clientIp(undefined)`→`"unknown"` (a shared global bucket): 3 signups platform-wide/hour locked out all registration. Forward the headers; drop the route's redundant pre-parse limiter (double-count). Single-hook design. | `register-ratelimit-headers.md` |
| 0.9.41 | `fix/rate-limit-coverage` | Gate 9. `rosterExport`/`resultsExport` (10/15m) + `imageUpload` (20/15m, logo+avatar shared), keyed on `user.email`, POST-only on uploads, 429 `{code:RATE_LIMITED}` + `Retry-After`. | `rate-limit-coverage.md` |
| 0.9.42 | `fix/error-boundaries` | D9. Three `error.tsx` (mirroring not-found topology, covering all four groups) + shared `ErrorCard`. All client + client `useTranslations` → ISR route stays static-safe. New `error` i18n namespace. Live-triggered the (voter) boundary. | `error-boundaries.md` |
| 0.9.43 | `fix/password-change-notice` | Layer 4. Reset via `onPasswordReset`; change-password via `hooks.after` guarded `instanceof Error`. Both best-effort. New `password-changed` EmailType + sender + 2 published Resend templates. +2 tests. | `password-change-notice.md` |
| 0.9.44 | `fix/security-headers` | Layer 8. HSTS · X-Frame-Options · nosniff · Referrer-Policy · Permissions-Policy + a CSP scoped to `base-uri`/`object-src`/`frame-ancestors`/`form-action` (the axes that can't break scripts/styles/images). Uniform → no `/results/[id]` oracle. Full resource-CSP deferred (needs nonce middleware + production pass). | `security-headers.md` |
| 0.9.45 | `fix/marketing-static` | Gate 13. `(marketing)/loading.tsx` server → client, removing the `headers()` fallback holding the group dynamic. Prerender manifest now lists `/hr` + `/en` — the only indexable page renders static. | `marketing-static.md` |

Skipped (user): `fix/auth-footer-dead-links` (spec files coming later). Not selected: the Gate 3 LOW
vote-cap mismatch (safe as-is).

Final `main`: lint 0 errors (8 pre-existing `window.location.assign` warnings) · `tsc` clean ·
**735 tests** · build clean.

---

## Gate status after this session

- **Passing with evidence:** 1 (post-fix), 3, 4, 5 (baseline checks), 6, 9, 13.
- **Reconciled:** 2 (covered by Gates 1 + 3).
- **Repo-side done, deploy-side open:** 7.
- **Owner / deploy only:** 8, 10, 11 (gating is built + inert while `BILLING_ENABLED` unset), 12.

---

## Remaining — owner / deploy / follow-up (not executable from here)

**Deploy-side (a human + Vercel/Neon/Resend consoles):**
- **Gate 8** — run the production migration when deploy is imminent (D2; `migrate deploy`, never `dev`).
- **Gate 10** — verify every env var is set in Vercel production (silent-no-op class: `RESEND_FROM_EMAIL`, `UPSTASH_*`, `CRON_SECRET`, `R2_*`, Stripe keys, `BILLING_ENABLED` unset at launch); **configure the cron pinger** (nothing opens/closes elections or fires reminders without it); **enable Stripe Customer Portal plan-switching** (test + live modes separately).
- **Gate 12** — send one real message per template to a real inbox from the deployed app (now **six** templates — the `password-changed` pair joins the launch-review surface); confirm the domain + SPF/DKIM/DMARC still resolve.
- **Neon** — pin computes at 0.25 CU + scale-to-zero (production, by hand); confirm the PITR retention window.
- **Split the shared dev/prod Upstash instance** (v0.9.32 finding).
- Delete the stale untracked `prisma/demo-seed.production.sql`.
- Lighthouse / CDN / SSL / DNS spot-checks on the deployed app.

**Code follow-ups (future branches):**
- `fix/security-headers-csp` — full resource-restricting CSP (nonce middleware + `strict-dynamic`), verified against a production build on all four chromes.
- D9 error-tracking service (Sentry or Vercel native) — the other half of Layer 12; error boundaries are the render half only.
- D10 uptime monitor · D11 cohort-sized load smoke against `/results/[id]` + `/api/vote` · D12 billing alerts on all six providers.
- `fix/auth-footer-dead-links` when those legal-page specs exist.

**Phase C** — `/cleanup run` (Gate 5) is runnable any time; the baseline it checks is already green.

---

## Notes for the next session

- The registration DoS is the only HIGH found and it is fixed — Gate 1 passes.
- `DELETE_TOKEN_PREFIX` and the change-password `onPasswordReset`/`hooks.after` wiring both read
  BetterAuth internals verified against **1.7.2** — re-verify on every `better-auth` bump.
- The six fix commits + merges were pushed to origin this session.
