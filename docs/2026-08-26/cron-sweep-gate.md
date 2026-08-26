# Cron Sweep Gate — wake Neon only when something is due

**Branch:** `feature/cron-sweep-gate` · **Version:** 0.9.32 (patch, 0.9.x lock)
**Spec:** `context/features/cron-sweep-gate-spec.md` (designed 2026-08-24, TTL decided at start: **1 h**)

## What this is

A cheap gate in front of `POST /api/cron/activate-elections`. The cron-job.org pinger keeps
pinging every ~5 minutes, but the route now answers most pings from **Upstash Redis alone**
(HTTP — touching it never wakes Neon) and only runs the five Postgres sweep passes when the
stored *next-due* timestamp has arrived, the key is missing, or Redis is unreachable.

Before this, every ping ran Postgres queries, so the Neon compute re-woke just as it was about
to suspend — scale-to-zero was configured but never fired (~100% duty cycle for a few seconds
of real work per day). After: idle systems sweep ~once per hour instead of ~288 times per day.

**No migration, no schema change, no new dependency, no new env var, no new route.**

## How a ping flows

Order inside `POST`: **auth → gate → five passes (untouched) → recompute → store.**

1. Bearer `CRON_SECRET` check — a 401 touches neither Redis nor Postgres.
2. `sweepDue()` reads `sweep:nextDue` from Upstash. A present, **future** value → the route
   returns `200 { skipped: true }` **before the first Prisma call**. The Neon adapter connects
   lazily, so a skipped ping produces zero traffic to Neon — no connection, no query, no wake.
   Anything else (key absent, value ≤ now, Redis error, Upstash unconfigured) opens the gate.
3. The five passes run exactly as before — activate + publish, close, 24 h reminder, turnout
   milestones, archive prune. Ordering, atomic WHERE-clause claims and error handling untouched.
4. `gatherSchedule()` (three cheap reads, `Promise.all`, deliberately **after** the passes) feeds
   `computeSweepNextDue()`, which returns the minimum **strictly future** time across:
   - min `startsAt` over SCHEDULED (activation),
   - per ACTIVE election: `tokenExpiry(startsAt, endsAt)` — the same anchor `windowOver`
     consults, **imported, never restated** (invariant #5),
   - per eligible ACTIVE election: `endsAt − REMINDER_LEAD_MS` (only when `voterReminder24h`,
     unstamped, and the window exceeds the lead — mirrors `autoReminderDue`),
   - min future archive `expiresAt` over unpruned rows.
   Turnout milestones contribute **nothing** — vote-driven and unpredictable, they ride the TTL.
5. The result is stored with a **1-hour TTL** (`SWEEP_GATE_TTL_SECONDS`, one line to retune).
   No future events at all → a `MAX_SAFE_INTEGER` sentinel; the TTL is what reopens the gate,
   giving the idle cadence. A recompute/store failure is logged and swallowed — the passes
   already ran, and an unstored key just means the next ping sweeps again (fail open).

## Invalidation — exactly two sites

Activation is the only pass whose lateness is user-visible (a SCHEDULED election past
`startsAt` refuses votes until the sweep flips it), so only mutations that create activation
state delete the key:

- `createElection` — **scheduled mode only** (drafts and placeholder dates contribute nothing)
- `startElection` — after the atomic flip (new ACTIVE = new close/reminder times)

Both call `clearSweepGate()`, which **never throws** — a mutation must not fail because Redis
hiccupped. Deliberately not invalidated: `closeElection`, `archiveElection`, `deleteElection`,
`duplicateElection` (stale-**early** at worst — one wasted wake), `castVote` (during real
voting the compute is awake from the votes anyway), the Stripe webhook, `sealElection`.

## The one invariant (D3)

**The gate may only fail *late* (bounded by the TTL), never fail *forever*.** Every failure
mode lands on it: Upstash unconfigured or down → every ping sweeps (byte-identical to the
pre-feature behaviour); lost or raced invalidation → TTL expiry catches it (≤ 1 h); crash after
the passes before the store → stale-early key, extra sweeps, never missed ones. Extra sweeps
are always safe because every pass is idempotent and WHERE-guarded — an unnecessary sweep
matches 0 rows and exits.

Worst-case lateness by pass: activation ≈ ping cadence (invalidation keeps it precise) ·
close ≤ 1 h (cosmetic since v0.9.22 — `castVote` refuses on `windowOver` regardless of status) ·
24 h reminder ≤ 1 h · turnout milestones ≤ 1 h · archive prune ≤ 1 h (against 12-month retention).

## Files

| File | Change |
| --- | --- |
| `src/lib/services/sweep-gate.ts` | **new** — pure `computeSweepNextDue` + fail-open Redis half (`sweepDue` / `storeSweepNextDue` / `clearSweepGate`); own 3-line `Redis.fromEnv()` client on purpose (not exported from `rate-limit.ts` — that module is about rate limiting) |
| `src/lib/services/sweep-gate.test.ts` | **new** — 22 cases, see below |
| `src/app/api/cron/activate-elections/route.ts` | gate after auth, `gatherSchedule()` + recompute + store after the passes, `nextDue` added to the response |
| `src/actions/create-election.ts` | `clearSweepGate()` on the scheduled-mode success path |
| `src/actions/elections.ts` | `clearSweepGate()` in `startElection` after the flip |
| `src/actions/{create-election,elections}.test.ts` | +5 wiring assertions (success clears, refusal never touches Redis) |

## Tests — 678 passing (+27), mutations checked

Every spec §9 mutation is caught by a **named** test: strictly-future filter removed → the D7
expired-archive test · `sweepDue` fails closed on throw → the outage test · window-exceeds-lead
clause dropped → see below · boundary `>` → `>=` → same discriminant test.

**Finding: spec §9's window-clause pin was a false pin.** For any election that has actually
started (`startsAt <= now`), a future reminder time (`endsAt − LEAD > now`) already implies
`window > LEAD`, so the D7 strictly-future filter masks the dropped clause — the mutation
**survived** the spec's short-election test (whose reminder time is past either way). Same
class as the stripe-phase-1 leap-year false pin. Fixed with a discriminant test whose fixture
separates the two mechanisms (window exactly = LEAD, `startsAt` in the future — unreachable in
practice, but the test must pin the clause, not the filter); it pins the strict `>` boundary
for free. The clause stays: it mirrors `autoReminderDue` clause-for-clause and guards against
future changes to the filter.

## Live verification (dev server, dev DB — restored byte-identical)

- Open gate → real sweep (`closed: 2` overdue ACTIVE, expired-stamp archive **kept** —
  entitlement re-derived at prune time, billing off), `nextDue` stored with TTL ≈ 3600 s.
- Two pings against a future key → `{ skipped: true }`, key value and TTL untouched.
- Key deleted + zero-voter SCHEDULED fixture → `activated: 1, sent: 0`, `nextDue` moved to the
  fixture's close time (min across categories, live).
- **Fail-open live:** Upstash env unset, future key present in Redis → swept anyway; store a no-op.
- **The no-DB proof, stronger than the spec's `last_active` read** (which was skipped as
  noisier): with `DATABASE_URL` pointed at an unreachable host, the skip ping returned
  `200 { skipped: true }` — the skip path provably touches no Postgres — while the control ping
  (key deleted) 500'd, proving the sweep path does reach for the DB.
- The standing dev-DB trap was armed again (a SCHEDULED election with past `startsAt` and 2
  PENDING voters) — parked before any ping, restored after. **Zero emails sent all session.**
  Check for such rows before pinging the sweep against dev; it has sent real mail twice before.

## ⚠ Operational — the app cannot detect any of these

1. **`UPSTASH_REDIS_REST_URL/TOKEN` must exist in Vercel.** Missing → the gate silently never
   closes and the compute never sleeps — zero errors, byte-identical to today. Same silent
   no-op class as R2/Resend.
2. **Dev and prod currently share ONE Upstash instance** (identical URL in both env files).
   Once this deploys, a locally-run ping storing `sweep:nextDue` computed from **dev** data
   gates **production's** sweeps (TTL-bounded, but wrong — and vice versa). Recommend a
   separate Upstash database for dev; the `ratelimit:*` keys already silently share the store.
3. Neon console: set both branches' computes to **fixed 0.25 CU** (min = max) with
   scale-to-zero on. Production must be done by hand — the guardrails keep the agent out.
4. cron-job.org cadence stays 5 min; nothing to change there.

## Upgrade paths (recorded, not built)

QStash exact-time callbacks if sub-5-minute precision or zero polling is ever required (new
vendor + per-mutation enqueue — rejected per the standing no-vendor-lock-in call). A
`clearSweepGate()` in `castVote` if turnout milestone emails ever need promptness — note the
compute is awake during real voting anyway, so only the complexity argument stands.
