# Observability & operations — `mvp-launch.md` §4

Programme doc for the five branches that ran 2026-09-13 → 2026-09-14, v0.9.74 → **v0.9.78**.
Individual dev docs are linked per item. Read this one first if you are picking §4 up.

## Status: 5 of 7 done, 2 outstanding

| # | Item | State | Version |
| --- | --- | --- | --- |
| §9 | `fix/zod-jitless` — D9's prerequisite | ✅ done | v0.9.74 |
| D9 | Error tracking (Sentry) | ✅ done | v0.9.75 |
| — | D9 follow-up: cron sweep reports its swallowed failures | ✅ done | v0.9.76 |
| D11 | Cohort-sized load smoke | ✅ run | v0.9.77 |
| — | `voteHash` collision (found by D11) | ✅ fixed | v0.9.78 |
| **D10** | **Uptime monitor + cron failure alerts** | ⏸ **console half outstanding** | — |
| **D12** | **Billing alerts on six providers** | ☐ **not started** | — |

Plus two findings D11 opened that are **not** §4's to close: the vote rate limit at cohort scale
(§1, a product decision) and `/api/vote` discarding its own error (§4, three lines).

---

## What shipped

### zod jitless — [dev doc](../2026-09-13/zod-jitless.md)

zod v4 probes for JIT with a runtime-compiled function; the production CSP has no `'unsafe-eval'`,
so every page carrying a client-built schema logged a CSP violation. Done **first**, deliberately:
once an error tracker is listening, one cosmetic console line per page becomes a stream of reports.

`src/lib/zod.ts` configures `jitless` **in the browser only** and re-exports `z`. ⚠ The re-export is
the mechanism, not a convenience — zod's config lives on `globalThis`, and its `allowsEval` is
memoised at *schema construction*, so the config must land before the first `z.object()`. You cannot
get `z` from that module without having run it. **Import `z` from `@/lib/zod` in anything that
reaches the browser**; `src/actions/**` and `src/app/api/**` keep raw zod.

### D9 — error tracking — [dev doc](../2026-09-13/error-tracking.md)

`@sentry/nextjs` at the client, server and edge entry points, each with `dataCollection` opt-outs
**and** `beforeSend: scrubEvent`.

⚠ **Two layers, because one does not reach.** The opt-outs cover bodies, cookies, headers and query
strings — none of which touches the URL **path**, and `/vote/<raw token>` carries a live ballot
credential there. `src/lib/sentry-scrub.ts` redacts it, and its query handling is an **allowlist,
currently empty**, so a future `?token=` cannot leak by omission.

Reports tunnel through `/monitoring` on our own origin, so the CSP stays `connect-src 'self'`.
⚠ `proxy.ts`'s matcher must keep excluding `monitoring`, or next-intl prefixes it to
`/hr/monitoring` and the tunnel fails **silently**.

### D9 follow-up — the sweep stops swallowing — [dev doc](cron-sweep-error-capture.md)

The cron sweep catches each pass's failure and returns 200 — deliberate, and it stays, because a 5xx
per item would conflate *the host is down* with *one recipient failed*. The cost was that a partial
failure reached nobody. `reportSweepFailure` now logs **and** captures at every catch.

⚠ **There were six, not the four the D9 doc named**, and the two extra did not even log — both in
the activation pass, where the election has **already flipped to ACTIVE** with no invitations sent.

### D11 — load smoke — [dev doc](load-smoke-d11.md)

`/results/[id]` and `/api/vote`, nothing broader. No load-testing dependency; 500 concurrent is
within Node's `fetch` plus a bounded pool. Cohort size 500 = the Pro voter cap.

**`/results/[id]` passes cleanly**: 500 concurrent → `200`×500, `x-nextjs-cache: HIT`×500, no
stampede. The ISR decision (v0.9.38) is validated under cohort load — one render served the cohort.

**`/api/vote` did not**, and produced three findings.

### The `voteHash` collision — [dev doc](vote-receipt-collision.md)

`Vote.voteHash` is `@unique` and was `SHA-256(electionId + sortedOptionIds + toISOString())`, so for
two voters in one election picking the same options the only varying input was the **millisecond**.
Simultaneous identical ballots collided and the second was refused with a 500 — **13.5% at
concurrency 40**. Atomicity held, so no ballot was lost, but the voter met a failure screen.

Now `randomBytes(32).toString("hex")`. Safe because nothing recomputes it: `merkle.service` treats it
as an opaque 64-hex leaf. Same length, no migration. It also closes a recorded **anonymity** leak —
the old value stored the millisecond — which is why the fix was already designed before D11 found
the availability half. ⚠ **Forward-only**: old ballots keep derived values, and rewriting them would
invalidate every sealed `merkleRoot`.

---

## Outstanding — what you would pick up

### D10 — the agent half is done; do not redo it

Design approved, every precondition re-verified live. What remains is **cron-job.org clicks**:

1. Two GET jobs at 5 min — apex `https://electius.com/hr` and dashboard
   `https://dashboard.electius.com/hr/login`, failure = status ≠ 200, notify on failure.
2. Turn failure alerts **on** for the existing sweep pinger — it is the only thing proving Neon is
   reachable, because its `findMany` is unguarded and an outage 5xxs it within 30 min + one ping.
3. Verify in three parts: a throwaway job hitting the sweep with a wrong bearer → **401** → confirm
   the alert email actually arrives, then delete it; re-open all three jobs and read the toggles
   back; then a Neon delta.

⚠ **No `/api/health`.** A polled `SELECT 1` pins the Neon compute awake and reverts the sweep gate
(v0.9.32), whose measured result was a **3.9% duty cycle**. The sweep already is the canary.

⚠ `/hr/login` does **not** wake Neon: `better-auth`'s `getSession` returns before any adapter call
when no cookie is present. That is a source-level guarantee, stronger than the duty-cycle statistic
the design originally asked for — and it is what makes the no-health-endpoint decision hold.

⚠ **The design's regression check names the wrong instrument.** `describe_project`'s
`active_time_seconds` is a cumulative billing-period counter across **both** branches (currently
~18.5%, dominated by dev work). A rate needs a **delta between two readings**.

### D12 — not started

Billing alerts on Vercel · Neon · Upstash · Resend · Stripe · R2. Console work on six providers;
each needs a read-back, not a memory of a click.

---

## Conventions this programme reinforced

- **Verify against a build artifact, not the build table.** Prerender status comes from
  `.next/prerender-manifest.json`; `ƒ` in the table proves nothing for a dynamic segment.
- **A local production build talks to the PRODUCTION database.** `next build && next start` loads
  `.env.production`. Override `DATABASE_URL`/`DIRECT_URL` to the development branch, every time.
- **Mutation-check every new test, after a green control run**, and assert the search string was
  found before writing — source files here are **CRLF**, and a `\n` pattern silently matches
  nothing, which reads exactly like "no test caught it". A surviving mutation is as often a missing
  test case as a missing guard.
- **Prefer the structural proof to the statistic** when one exists, and keep the measurement as
  confirmation rather than as the argument.
- ⚠ **The dev database has a standing trap**: SCHEDULED elections with a past `startsAt` send **real
  invitations** on the first cron sweep ping. Check before pinging the sweep.
