# D11 — cohort-sized load smoke

`mvp-launch.md` §4 · run 2026-09-14 · no application code changed

## Scope, and why it is this narrow

The launch checklist names exactly two targets and says "nothing broader": **`/results/[id]`**, the
app's only ISR route and the one page a whole cohort opens at once, and **`/api/vote`**, the write
path. A "cohort" here is bounded by the product's own entitlements — **50 voters on Free, 500 on
Pro** — so the largest legitimate cohort is 500. That is the number used throughout.

**No load-testing dependency was added.** 500 concurrent requests is well within Node's `fetch` plus
a bounded promise pool, so the smoke is a ~150-line throwaway in gitignored `scripts/`.

## Where it ran, and the two guards that matter

A local production build (`next build && next start`) against the Neon **development** branch, with
`DATABASE_URL`/`DIRECT_URL` overridden — a local production build otherwise loads `.env.production`
and talks to the **production** database.

The script refuses to start unless the database is the development branch **and** the base URL is
loopback. `/api/vote` writes ballots; pointed at production it would cast real votes into real
elections and burn real single-use tokens. Those two guards are the most important lines in it.

Simulated voters use reserved ranges — `198.18.0.0/15` (RFC 2544 benchmarking) and `198.51.100.0/24`
(TEST-NET-2) — so the rate-limit keys they create can never collide with a real client's, which
matters because **dev and prod share one Upstash instance**.

---

## Result 1 — `/results/[id]` passes cleanly

| Run | Result |
| --- | --- |
| 1 cold request | `200`, **`x-nextjs-cache: MISS`**, 435 ms |
| **500 concurrent, warm** | **`200` × 500**, **`HIT` × 500**, p50 356 ms · p95 450 ms · max 455 ms |

Zero errors, zero misses, no stampede. The ISR decision (v0.9.38) is validated under cohort load:
**one render served the entire cohort.** Absolute latencies are local-machine numbers and would be
lower behind Vercel's CDN; the signal that matters is 500/500 HIT.

---

## Result 2 — ⚠ `/api/vote` has a real bug, and the smoke is what found it

### The headline: duplicate `voteHash` under concurrency → HTTP 500

| Run | Concurrency | Result |
| --- | --- | --- |
| 440 voters, distinct IPs | 50 | `200` × 398, **`500` × 42** (9.5%) |
| 40 voters, repeat | 2 | `500` × 1 (2.5%) |
| 40 voters, repeat | 40 | **`500` × 13 (32.5%)** |
| 200 voters, refill | 40 | `200` × 173, **`500` × 27 (13.5%)** |

Clearly concurrency-dependent. The cause, once the error was made visible:

```
PrismaClientKnownRequestError P2002
Invalid `prisma.vote.create()` invocation:
Unique constraint failed on the fields: (`voteHash`)
```

`vote.service.ts:223` builds it as:

```ts
computeVoteHash(token.electionId, picked, new Date().toISOString())
// SHA-256(electionId + sortedOptionIds.join(",") + timestampIso)
```

`voteHash` is `@unique` (`schema.prisma:336`). For two voters in the **same election** choosing the
**same options**, every input is identical except `toISOString()` — **millisecond** resolution. Two
such ballots in the same millisecond produce the same hash, and the second one is rejected.

It gets worse exactly where it matters: the more popular an option is and the more concurrent the
voting, the likelier the collision. A two-option referendum at a deadline rush is the worst case.

### The mitigating fact, verified rather than assumed

**Atomicity held perfectly.** After the main run: **420 ballots, 420 tokens burned, 80 unused** —
not one token consumed without a ballot. Every 500 rolled back cleanly, so the voter's magic link
still works and a retry (in a different millisecond) succeeds. The voter flow already has a
retry-safe fail screen that keeps the selection.

So this is **not** lost ballots. It is a failure screen shown to a double-digit percentage of voters
at peak, on the one interaction the product exists for.

### The recommended fix was already designed, for a different reason

`future-updates-spec.md` § Integrity & Archive already recommends replacing the derived hash with
**`randomBytes(32).toString("hex")`**, on anonymity grounds: the millisecond timestamp baked into
`voteHash` is a far stronger timing signal than the random `batchOrder` exists to destroy, and a
five-day window is brute-forceable.

That one change fixes both problems, and it is safe because **nothing recomputes the hash**:

- `merkle.service.ts` treats each `voteHash` as an **opaque 64-hex leaf**, sorts them, and pairs them;
- the voter receipt only displays and downloads it.

Same length, same shape, no migration, collisions become statistically impossible, and the recorded
timing leak closes with it. D11 supplies the urgency the privacy argument lacked: this is not only a
theoretical disclosure risk, it is an active double-digit failure rate under cohort load.

### Second finding — the ballot route discards its own error

`api/vote/route.ts:52` returns `{ code: "FAILED" }` with a 500 and **logs nothing, captures
nothing**. The server log was empty through the entire first run; the cause was only obtainable by
temporarily instrumenting the route and rebuilding.

This is the same defect class fixed in the cron sweep hours earlier (v0.9.76) — except here it is
the **ballot write path**. With D9 now in place it should be a `Sentry.captureException`.

### Third finding — the rate limiter is the binding constraint for a real cohort

`api/vote/route.ts:24` keys on `clientIp` alone: **30 requests per 15 minutes per IP**. The comment
at `rate-limit.ts:46` says the limit "must survive a campus-NAT voting session (many voters, one
public IP)" — the intent is right; the arithmetic does not support the number.

Measured, 60 voters behind one IP: **`200` × 22, `429` × 30, `500` × 8.** Exactly 30 passed the
limiter (22 became ballots, 8 lost the hash race) and **30 were refused**.

Extrapolated against the product's own caps:

| Cohort on one public IP | Refused in the first 15 min | Time for all to clear |
| --- | --- | --- |
| 50 (Free cap) | 20 | 25 min |
| 250 | 220 | ~2 h |
| **500 (Pro cap)** | **470** | **~4 h** |

The stated demo case in `project-overview.md` is university elections. A lecture hall on campus wifi
is one public IP, and mobile CGNAT makes it worse, not better. This needs a product decision — raise
the limit, key it on something better than the IP, or accept it and say so.

---

## Not tested, stated rather than implied

- **Production was never touched.** `/api/vote` writes ballots; the smoke is structurally incapable
  of pointing there. Production is also 14 commits behind `main`.
- **Absolute latency is not a production number.** Local Node, Neon dev compute pinned at **0.25 CU**
  (production autoscales 0.25 → 4), no CDN. Treat the status distributions as the finding and the
  milliseconds as indicative only.
- Nothing broader than the two named routes — no dashboard, no exports, no auth.

## Teardown

Fixture destroyed; dev branch SQL-verified back to baseline (2 orgs · 2 users · 19 elections ·
3994 voters · 2087 votes · 2309 junction · 3 archives), **0 smoke leftovers**. 723 smoke rate-limit
keys removed from the shared Upstash by exact match on the two reserved ranges — never a blind
`ratelimit:*` flush — with `sweep:nextDue` confirmed untouched afterwards.

⚠ The state file holding 500 **raw** tokens was deleted: invariant #2 says raw tokens do not linger.
⚠ The standing dev-DB trap is **still armed** — 3 SCHEDULED elections with a past `startsAt` will
send real invitations on the next cron sweep ping. The sweep was never pinged during this run.
