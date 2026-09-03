# Fix: Sweep gate TTL 1 h → 30 min (v0.9.52)

**Branch:** `fix/sweep-gate-ttl` · inline request (`final-checklist.md`, carried from Phase E) · retunes D5 of the cron-sweep-gate spec

## The gap

`computeSweepNextDue` schedules four of the sweep's five passes — activation, close, the 24 h voter reminder, and the archive prune. It deliberately schedules **nothing** for the fifth. D9 left turnout milestones out on the reasoning that during real voting the Neon compute is awake from the votes themselves, so a milestone crossing has no entry in `sweep:nextDue` and is reached only when the key's TTL expires and the gate falls open.

That made the TTL the sole bound on turnout-email latency: a milestone crossed one minute after a sweep waited up to an hour for its email.

Phase E made it concrete. `Anketa Test` crossed a milestone and never sent, because the sweep's **close pass runs before its turnout pass** in the same invocation and the turnout query is itself `status: "ACTIVE"`-gated — so an election with less remaining window than the TTL is closed away before the turnout pass ever looks at it.

## The fix

One constant and its comment, `src/lib/services/sweep-gate.ts:14-16`:

```ts
// D5: 30 min — najgore kašnjenje svega što invalidacija ne pokriva (prečke
// izlaznosti jašu samo na njemu, D9); u praznom hodu ~48 buđenja dnevno.
export const SWEEP_GATE_TTL_SECONDS = 30 * 60;
```

The D3 invariant — *late by at most the TTL, never forever* — is unchanged in shape; only the bound moves. Every sweep pass is idempotent and WHERE-guarded (the claim is an `updateMany` whose count **is** the check), so running them twice as often cannot make any of them wrong. Shortening the TTL strictly tightens a guarantee; it cannot loosen one.

**30 min rather than the 15 originally asked for** (user's call at `load`): it halves the latency at half the idle cost, and a 30-minute worst case is still well inside "an admin notices turnout crossed 50 %". Going to 15 later is the same one-line change; nothing here is shaped around 30.

## The finding: no test can catch a wrong value here

`sweep-gate.test.ts` asserts the TTL at two sites, and both reference the **imported constant** rather than a literal:

```ts
expect(client.set).toHaveBeenCalledWith(SWEEP_GATE_KEY, ts, { ex: SWEEP_GATE_TTL_SECONDS });
```

That assertion is tautological with respect to the value. Changing `60 * 60` to `30 * 60` cannot fail a test, and the suite passing is **not** evidence the new value took. What it does pin is that a TTL is applied at all, which is the part worth pinning and which survives the change.

Left unpinned on purpose: a `=== 1800` assertion would force a second file edit on every retune and catch nothing a reader would not see in the three-line diff. If proof of the live value is ever wanted, read `sweep:nextDue`'s TTL in Upstash after a ping — not the test output.

## Cost

Idle wakes go 24/day → 48/day. Phase D measured the production compute at **3.9 % duty** (`active_time_seconds: 4760` over ~34 h) under the 1 h TTL, which is what proved the gate closes at all in production. Doubling idle wakes puts that near ~8 % — an order of magnitude below the ~100 % the gate was built to escape, and at 41 MB with near-zero writes the Neon cost is noise.

## What this does NOT fix

1. **Turnout still schedules nothing.** D9 stands; the proper fix is a turnout read inside `gatherSchedule()`, which is more query and more surface than a retune should carry.
2. **The close-before-turnout ordering stands.** A milestone crossed with less than 30 minutes of window left is still closed away before the turnout pass runs. This halves that dead zone from 60 minutes to 30; it does not remove it.

## Not affected: the shared Upstash instance

Dev and production share one Upstash instance, so a locally-run ping writes the key production's gate then reads — a real, pre-existing hazard (recorded 2026-08-26). It is **orthogonal to this change**: the TTL is applied at write time from the constant compiled into whichever build wrote the key. There is no environment variable to drift and nothing to set in Vercel.

## Verification

- `npx tsc --noEmit` clean · `npm run lint` 0 errors (7 pre-existing `window.location.assign` warnings, none in this file) · `npm run test` **758/758, 42 files** · `npm run build` clean
- The value itself was confirmed by reading the compiled server chunk in `.next/server`, which carries `SWEEP_GATE_TTL_SECONDS = 30 * 60` — deliberately, rather than trusting a green suite that the section above shows cannot fail.
- No sweep ping was run. ⚠ The standing dev-DB trap is still armed: a `SCHEDULED` election with a past `startsAt` makes **any** sweep ping open it and send real invitation email. It has fired twice. Check for those rows before pinging.

## Files

`src/lib/services/sweep-gate.ts` · `context/codebase-map.md` (two TTL references) · `package.json` · `package-lock.json` · this document
