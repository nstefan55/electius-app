# Error tracking (Sentry) — D9

**Branch:** `feature/error-tracking` · **Version:** 0.9.75 · **Date:** 2026-09-13
**Closes:** `mvp-launch.md` §4 / D9. Its prerequisite, `fix/zod-jitless`, shipped in 0.9.74.

---

## What shipped

`@sentry/nextjs` 10.74.0, wired at the three points Next expects, with a PII scrub in front of
every one of them.

| File | Role |
| --- | --- |
| `src/instrumentation.ts` | server + edge entry; re-exports `captureRequestError` |
| `src/instrumentation-client.ts` | browser init; re-exports `captureRouterTransitionStart` |
| `sentry.server.config.ts` · `sentry.edge.config.ts` | the two runtime inits |
| `src/lib/sentry-scrub.ts` | `redactSentryUrl` + `scrubEvent` — the PII boundary |
| `src/lib/sentry-scrub.test.ts` | the cases pinning it |
| `src/app/global-error.tsx` | root-layout failure boundary; reports, then renders |
| `next.config.ts` | `withSentryConfig` wrapper, tunnel, sourcemap deletion |
| `src/proxy.ts` | matcher excludes the tunnel route |

## The PII rule, and why it needed two layers

Sentry's defaults send request bodies, cookies, headers, query strings and user info. Here that is
not a privacy preference — it is a credential leak:

| Where | What is in it |
| --- | --- |
| `/{locale}/vote/<token>` | a **live ballot token**, in the path |
| `/{locale}/reset-password?token=` | password-reset token |
| `/{locale}/confirm-deletion?token=` | account-deletion token |
| `POST /api/vote` body | the raw ballot token |

An unused ballot token on a third party's dashboard is not a log-hygiene problem: anyone who can
read it can cast that person's vote. It would also break invariant #2 and contradict `/privacy`,
which publishes that the link in readable form exists only in the voter's own email.

So both layers ship:

1. **`dataCollection`** in all three inits turns off `userInfo`, `cookies`, `httpHeaders`,
   `httpBodies` and `urlQueryParams`.
2. **`beforeSend: scrubEvent`**, because none of those options covers a token in the *path*. It
   redacts `request.url`, deletes `data` / `cookies` / `query_string`, strips the `cookie`,
   `authorization` and `x-forwarded-for` headers, and runs the same redaction over breadcrumb
   `url` / `to` / `from`.

Three details worth keeping:

- **Allowlist, not denylist.** `ALLOWED_QUERY` is empty, so *every* query parameter is dropped. A
  denylist means the next route that invents a `?token=` leaks until somebody remembers to add it.
- **Redact, don't drop.** `analytics.ts` discards the whole event for `/vote/*`; Sentry keeps it,
  because an error on the ballot is exactly what we need to see — just without the token.
- **`/voters` must not match.** The pattern anchors on `vote/` preceded by a slash or start of
  string, so the admin roster route is untouched.

The module imports nothing from `@sentry/nextjs` — its event type is structural — so it is testable
without booting the SDK (the `delivery-feedback.ts` precedent) and stays inside invariant #8.

## Sourcemaps: the guard that went red

`production-build-contract.test.ts` banned `withSentryConfig` by name, so installing Sentry turned
it red. That was the test working. The ban was only ever a **proxy** for the property that matters
— that `.map` files are never served publicly — so the proxy was replaced by the property itself:

1. the config must carry `sourcemaps.deleteSourcemapsAfterUpload: true`;
2. if `.next/static` exists, it must contain zero `.map` files — a measurement, not a reading of
   intent.

Check (2) **skips without a build rather than passing**, so a local `npm run test` claims nothing
about it and a CI run with a build claims everything.

## The tunnel

`tunnelRoute: "/monitoring"` — the browser posts to our own origin and the server forwards. That
keeps the CSP at `connect-src 'self'` with no third-party origin to widen to, and ad blockers do
not break reporting.

⚠ **`src/proxy.ts`'s matcher must keep excluding `monitoring`.** Without it, next-intl prefixes the
path to `/hr/monitoring` and the tunnel silently stops working.

## Configuration

- ⚠ **`SENTRY_AUTH_TOKEN` must be set in Vercel.** It is in both local env files, but
  `.env.production` never reaches Vercel. Without it the sourcemap upload fails and every stack
  trace in Sentry is minified — the same silent-no-op class that caught Upstash, R2 and Resend.
- The **DSN is hardcoded on purpose.** It is a write-only ingest URL that ships inside the client
  bundle anyway; making it an env var would imply a secrecy it does not have.
- **`tracesSampleRate: 0`.** D9 is error tracking. Tracing at 1 means 100% of transactions, each
  carrying a URL, and would exhaust the free quota on day one. Raise it deliberately (see D11).

## Known ceilings

1. **The cron sweep's swallowed failures are invisible to Sentry.**
   `api/cron/activate-elections/route.ts` catches and continues at four points — reminder send,
   turnout send, archive prune, gate store — and still answers 200. No `captureConsoleIntegration`
   is registered and the route makes no Sentry call, so those land only in Vercel's log. The fix is
   an explicit `Sentry.captureException` in each catch. Do **not** make the route 5xx instead: that
   conflates "the host is down" with "one recipient failed", which is the line D10 depends on.
2. **`global-error.tsx` renders Next's default error page**, not the project's `ErrorCard`. It only
   fires when the root layout itself throws, but it is the one error surface with no Croatian copy
   and no branding.
3. **`automaticVercelMonitors` does nothing here.** It instruments Vercel Cron; this project is
   pinged by cron-job.org. Harmless, but do not read it as cron monitoring.

## Verified

`npm run build` clean — run with `DATABASE_URL` and `DIRECT_URL` overridden to the **development**
branch, because a local production build otherwise loads `.env.production` and talks to the
production database · **845 tests / 48 files**, including the `.map` guard measuring a real build ·
`tsc --noEmit` clean · lint 0 errors (7 pre-existing warnings, all in untouched auth components) ·
zero `.map` files in `.next/static` · all eight static prerenders and the `/results/[id]` ISR route
still intact.

Fixed while completing the branch: `withSentryConfig` was imported from `@sentry/nextjs`, which is
deprecated and stops working in v11. It now comes from `@sentry/nextjs/config`, verified present in
10.74.0, which also cleared two warnings from every build.
