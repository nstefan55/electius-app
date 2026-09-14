# Cron sweep: every swallowed failure now reports — D9 follow-up

`fix/cron-sweep-error-capture` · v0.9.76 · follow-up to D9 (error tracking, v0.9.75)

## The problem

The election lifecycle sweep (`src/app/api/cron/activate-elections/route.ts`) catches the failure of
every individual pass and **still answers HTTP 200**. That is deliberate and stays: a 5xx per item
would conflate *the host is down* with *one recipient failed*, which is the exact line uptime
monitoring (D10) depends on, and it would retry work that had already succeeded.

The cost of that decision was that a partial failure was visible to **nobody**:

- the **pinger** sees 200 and records success;
- **Sentry** saw nothing either — no `captureConsoleIntegration` is registered, and the route made
  no Sentry call of its own.

So an election could open, fail to send a single invitation, and the only trace was a number in a
response body that goes to a third party's log.

## What shipped

One local helper, `reportSweepFailure(pass, error, electionId?)`, wired into **every** catch site.
It keeps the existing `console.error` line and adds an explicit `Sentry.captureException` tagged
`route: "cron/activate-elections"` plus the `pass` that failed.

## ⚠ There were six, not four

D9's dev doc and the D10 design both name **four** swallowed catches (reminder send · turnout send ·
archive prune · gate store). Grepping the route found **six**, and the two extra ones were the worst
of the set because they did not even log:

| Site | Before | Why it matters |
| --- | --- | --- |
| `publishElection(id).catch(() => null)` | **silent** | The election has *already* flipped to ACTIVE. Voting is open and **not one invitation was sent.** |
| `prisma.voter.count(...).catch(() => 0)` | **silent** | Fallback for the fallback; a failure here reports "0 failed" for an election that failed entirely. |
| `sendReminders(...)` | logged | |
| `sendAdminTurnout(...)` | logged | |
| `pruneExpiredArchives()` | logged | |
| gate store `try/catch` | logged | |

Correct the count wherever it is quoted.

## What goes to Sentry, and what must not

`electionId` is a cuid — not PII — and it is the only thing that makes a report actionable; without
it you get "turnout send failed" with no way to find which election. This matches the D9 tagging
rule ("tag org id + route") and the `mvp-launch.md` §1 note, which permits election cuids and
prohibits **voter addresses**. Do not widen it.

The `CRON_SECRET` is safe by an existing mechanism rather than a new one: `scrubEvent` already
deletes the `authorization` header from every outgoing event (`src/lib/sentry-scrub.ts`). The scrub
touches only `request` and `breadcrumbs`, so tags and extras pass through untouched — which is why
the capture context survives.

## The test, and why it counts rather than enumerates

`src/lib/cron-sweep-reporting.test.ts` — the fifth contract test with no source module of its own
(after `better-auth-schema`, `static-route-boundaries`, `production-build-contract`, `locale-cookie`
and `zod-jitless`). It reads the route as **text** and asserts the number of `reportSweepFailure`
calls equals the number of catch sites, with a `>= 6` floor so a broken regex cannot pass vacuously.

It counts rather than listing the six by name precisely because the enumerated record was already
wrong once. A seventh catch added without a report fails this test by name.

It exists because the regression is invisible to every other gate: a silent catch is valid
TypeScript, passes lint, passes the build, and the route still returns 200. You find out when
somebody asks why an election never sent its invitations — by which point the voting window is open.

**Mutation-checked 5/5**, each caught by a named test, after a green control run on unmutated source:
one catch going silent · the Sentry import dropped · the tag shape changed · a bare `console.error`
creeping back · `captureException` downgraded to a no-op.

> ⚠ The first mutation run reported `SEARCH STRING NOT FOUND` for two cases: `route.ts` is **CRLF**
> and the patterns were written with `\n`. That assertion is the only reason it did not read as
> *"mutation survived"*. Patterns in this repo must be newline-free or CRLF-aware.

## Verified

`tsc --noEmit` 0 errors · `npm run lint` 0 errors (7 pre-existing `window.location.assign` warnings
in auth components, none in touched files) · **850 tests / 49 files**, up from 845 / 48 ·
`npm run build` clean.

Read off `prerender-manifest.json`, never the build table: all eight content prerenders intact
(`/hr`, `/en`, both `/privacy`, both `/privacy/voters`, both `/terms`), `/[locale]/results/[id]`
still registered as ISR, and **zero `.map` files** in `.next/static` — so D9's sourcemap guard still
holds.

⚠ The build was run with `DATABASE_URL` and `DIRECT_URL` overridden to the **development** branch. A
local production build otherwise loads `.env.production` and talks to the **production** database.

## Not verified

The captures have **never fired against real Sentry**. The wiring is proven by the contract test and
by reading `scrubEvent`, not by an ingested event — and it cannot be proven in production yet,
because `main` is unpushed, so Sentry is not live there at all. Force a failure once after the next
deploy.
