# The vote receipt stops being derived — and stops colliding

`fix/vote-receipt-collision` · v0.9.78 · fixes the bug D11 found the same day
(`docs/2026-09-14/load-smoke-d11.md`)

## The bug

`Vote.voteHash` is `@unique` (`schema.prisma:336`) and was built as:

```ts
SHA-256(electionId + sortedOptionIds.join(",") + new Date().toISOString())
```

For two voters in the **same election** choosing the **same options**, every input is identical
except `toISOString()` — **millisecond** resolution. Two such ballots in the same millisecond produce
the same value, and Postgres refuses the second: `P2002`, which the route turned into an HTTP 500.

Measured under the D11 smoke: **13.5% of 200 ballots at concurrency 40**, 32.5% on a repeat run,
2.5% at concurrency 2. It worsens with option popularity and concurrency — a two-option referendum
at a deadline rush is the worst case.

It never lost a ballot: the transaction is atomic, so a failure rolled back the token flip too
(**420 ballots / 420 tokens burned / 0 burned without a ballot**, measured). The voter kept a working
magic link and a retry in another millisecond succeeded. What they got was a failure screen, on the
one interaction the product exists for.

## The fix, and why it was already written down

```ts
export function newVoteReceipt(): string {
  return randomBytes(32).toString("hex");
}
```

`future-updates-spec.md` § Integrity & Archive already recommended exactly this — on **anonymity**
grounds, not availability. The derived value embedded the millisecond *and stored it*, so with a
known voting window the leaf set is brute-forceable, handing back the per-ballot timing that random
`batchOrder` and the lexicographic Merkle leaf order exist to destroy.

One change closes both. D11 supplied the urgency the privacy argument lacked: a deprioritised
"theoretical disclosure risk" and an active double-digit failure rate turned out to be the same line.

## Why it is safe

Checked rather than assumed — **nothing recomputes the value**:

| Consumer | What it does with it |
| --- | --- |
| `merkle.service.ts` | Treats each one as an **opaque 64-hex leaf**: sorts, pairs, hashes. Never re-derives. |
| voter receipt (`vote-flow.tsx`) | Displays, copies, downloads. |
| `organization-export.ts` | Emits the string. |
| anywhere | **Never a lookup key** — grep for `where`/`findUnique` on `voteHash` returns nothing. |

Same length, same alphabet, same sort behaviour, **no migration**.

**The published copy needed no change**, which was checked before writing code. The receipt says
*"This code confirms your vote was recorded. Your vote is anonymous and cannot be linked back to
you."* — it never claimed derivation, and a random receipt satisfies the anonymity half **better**
than the old one did.

**The column keeps the name `voteHash`.** Renaming it would mean a migration, a new archive-snapshot
shape and an `EXPORT_VERSION` bump, to buy a better noun. The comment carries the meaning instead.

`computeVoteHash` is deleted — it had no other caller.

## Tests

`newVoteReceipt` gets three (shape · **no repeat across a 10 000-call burst in one millisecond** ·
not a function of the ballot), and `castVote` gets a fourth asserting it writes a **fresh** receipt
per ballot for an identical selection.

That fourth one exists because of a surviving mutation. The first run caught 3 of 4: hardcoding the
receipt **at the call site** left the suite green, because `newVoteReceipt`'s own tests say nothing
about whether `castVote` calls it. A surviving mutation is as often a missing test as a missing
guard. Re-run: **4/4 caught**, after a green control.

> ⚠ The mutation that matters is M1 — `Date.now().toString(16).padStart(64, "0")`. It keeps the
> shape, so it passes the shape test and fails **only** the burst test. That is the proof the burst
> test is the load-bearing one rather than decoration.

## Verified

`tsc --noEmit` 0 errors · `npm run lint` 0 errors (7 pre-existing `window.location.assign` warnings
in auth components, none in touched files) · **852 tests / 49 files** · `npm run build` clean, with
all 10 prerenders, the `/results/[id]` ISR registration and zero `.map` files intact.

**And the smoke that found it was re-run against the fix** — same targets, same concurrency, same
dev branch:

| Run | Before | After |
| --- | --- | --- |
| 60 voters, one NAT | `200`×22 · `429`×30 · **`500`×8** | `200`×**30** · `429`×30 · **`500`×0** |
| 440 voters, distinct IPs | `200`×398 · **`500`×42** | **`200`×440** · **`500`×0** |

**Zero HTTP 500s across 500 requests**, 470 ballots recorded (30 + 440 — the other 30 were the
limiter doing its job). The 429s are unchanged and expected: that is the separate rate-limit finding,
still open in §1.

⚠ The build and server ran with `DATABASE_URL`/`DIRECT_URL` overridden to the **development** branch;
a local production build otherwise talks to the **production** database.

## Still open, and deliberately not done here

- **The rate limit** (§1) — 30 per 15 min keyed on IP alone refuses 470 of a 500-voter cohort behind
  one campus NAT. A product decision, not a bug fix.
- **`/api/vote` discards its own error** (§4) — `route.ts:52` still returns `{ code: "FAILED" }` with
  no log and no capture. It is why this bug needed a temporary instrumented rebuild to diagnose at
  all. Three lines, same pattern as the cron sweep fix (v0.9.76).
- **Existing rows are untouched.** Every ballot cast before this still carries a derived value, so
  the timing leak persists for them. Forward-only by design: rewriting historical `voteHash` values
  would invalidate every sealed `merkleRoot`.
