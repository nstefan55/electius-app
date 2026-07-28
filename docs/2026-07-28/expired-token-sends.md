# Expired-Token Sends — Dead Magic Links After the Voting Window

`v0.9.8` (unchanged — version held at the user's request) · branch `fix/expired-token-sends` · spec `context/fixes/expired-token-sends-spec.md`

## The bug

`tokenExpiry()` pins a token's life to the election's `endsAt`. **Nothing closed an election at `endsAt`**, so an election sat ACTIVE with its window already over — indefinitely — and every send path in that state minted a token that was dead on arrival.

Verified live, not inferred: adding a voter to an ACTIVE election on 2026-07-26 produced `voter_tokens.expiresAt = 2026-07-23` and emailed it anyway. On the dev branch, 4 of 5 ACTIVE elections were in this state.

Six send paths, one of which knew the rule:

| Path | Before |
| --- | --- |
| `publishElection` ← `startElection` · cron · `resendInvitations` · `addVoters` | mints dead tokens, emails the roster |
| `inviteVoter` ← `resendVoterInvite` · `resendVoterLink` | mints one dead token, emails it |
| `sendReminders` | ✅ already correct — reported 0 recipients |

It was also a **closed loop for voters**: expired link → screen CTA "request a new one" → new link inherits the same dead expiry → expired link. No exit, while the admin UI still said *Aktivan*.

## The fix

### One predicate, imported everywhere

```ts
// src/lib/services/token.service.ts
export function windowOver(election: { startsAt: Date; endsAt: Date }, now = new Date()) {
  return tokenExpiry(election.startsAt, election.endsAt, now) <= now;
}
```

It asks about the **mint**, not the date: *would a token created right now be born expired?* That phrasing matters — `endsAt < now` is a different rule that silently drops the wizard-placeholder branch (`endsAt <= startsAt` ⇒ open-ended, 30-day ceiling) which `tokenExpiry` already handles.

All six paths, `getReminderTargets`, the ballot router and the close sweep import it. The rule that used to live inside `getReminderTargets` now lives beside the function it derives from.

### Guards + a distinguishable result

`PublishResult` gained one discriminator so "nobody needed an invitation" and "nobody is reachable" stop rendering identically:

```ts
{ sent: 0, failed: 0, blocked: "windowOver" }
```

`inviteVoter` returns `"sent" | "notFound" | "windowOver"` and takes a `SendableElection` (`title` + `organizationName` + the two dates). **The guard sits before the mint**, which is why a refused resend leaves the voter's existing working link intact instead of revoking it.

`resendVoterLink` checks the election *before* looking up the voter — window-over is a property of the election, not of the voter, so `/api/vote/request-link` stays enumeration-safe by construction.

### The voter loop, closed at the source

`isClosed` → `votingOver` in `vote.service.ts`:

```ts
e.status === "CLOSED" || e.status === "ARCHIVED" || windowOver(e, now)
```

A window-over election now reads as **closed** to voters: the token holder gets the closed screen (no "request a new link" CTA), the QR visitor gets it instead of the email form. No new screen, no new voter string, and `resendVoterLink` becomes unreachable from the UI (still guarded — the endpoint is public).

The behavioural delta is confined to window-over ACTIVE elections; for every other election `votingOver` returns exactly what `isClosed` did. `castVote` never used it and already rejected on `token.expiresAt`.

### The close sweep

Folded into the existing `/api/cron/activate-elections` — one endpoint, one `CRON_SECRET`, one pinger. A second route would have added infrastructure the app cannot verify exists, which is what caused this bug in the first place.

`endsAt` is **not** rewritten (unlike the manual close, which moves it to the click): the deadline is real and recorded; the sweep only enforces it.

### `autoCloseOnDeadline` removed from the wizard

The toggle was written, displayed in review, and **read by nothing**. Turning it off also made voting impossible at exactly the moment it promised to continue, because `tokenExpiry` killed every token at `endsAt` regardless. Auto-close is now unconditional.

The **column stays** (no schema change): the wizard no longer collects it, nothing reads it, existing rows keep their default. Dropping it is a later migration.

## Two bugs found during verification

### The sweep, written with the wrong rule — caught in the browser

The first sweep was `where: { status: "ACTIVE", endsAt: { lte: now } }` — a raw date comparison, exactly the re-phrasing the fix exists to prevent, and the one place it couldn't be a function call (a Prisma WHERE clause).

It only surfaced live. `startElection` sets `startsAt = now`, so starting a stale draft makes `endsAt <= startsAt` — the placeholder state, tokens valid 30 days. The guard correctly stood down and sent two *working* links; the sweep would then have closed that election on the next tick and killed them.

The sweep now prefilters in SQL and lets `windowOver` decide per row, so **tokens alive ⟺ voting open** holds. Route files are outside the Vitest scope, so the rule is pinned by the placeholder case in `token.service.test.ts`.

### Hydration mismatch in the datetime formatters (pre-existing)

`hour: "numeric"` in `formatVotingDateTime` (`elections-view.ts`) and `formatVoterDateTime` (`voter-ui.tsx`) — the latter's comment actively claimed the strings were hydration-safe.

Direction confirmed by running both engines rather than assuming:

| `hr-HR`, 09:41 UTC | `numeric` | `2-digit` |
| --- | --- | --- |
| Node (server) | `9:41` | `09:41` |
| Browser | `09:41` | `09:41` |

The **browser** pads; Node does not. Only `hr-HR` diverges — `en-US` agreed on `9:41 AM` in both, so `2-digit` is a pure cosmetic change there (`09:41 AM`), accepted for one rule over two and matching `step-review.tsx`, which already used `2-digit`.

Invisible until now because every seeded election runs at 21:48; only hours below 10 differ.

> **A unit test cannot catch this class of regression** — Vitest only ever sees Node, which passes with either option. The three new `formatVotingDateTime` cases pin format and UTC; the divergence itself is proven by the two-engine comparison above.

## Starting a draft with a passed deadline is now refused

`startElection` returns `deadlinePassed` instead of starting. Without it, `startsAt = now` silently reinterprets `endsAt` as the placeholder and voting runs 30 days instead of to the admin's date.

The check uses the same `windowOver`, so an **unscheduled** draft (`endsAt <= startsAt`) still starts normally — the case a naive `endsAt < now` would have broken. It cannot go in the WHERE clause (column-vs-column comparison); the atomic `updateMany` below it still guards status, and dates don't change concurrently, so there is no race.

⚠️ **Known consequence:** the Edit action is still a toast stub, so an admin who hits this has no in-app way to change the date and must duplicate or recreate the election. Acceptable pre-launch; disappears when wizard edit mode ships.

## Files

| File | Change |
| --- | --- |
| `src/lib/services/token.service.ts` | `windowOver` exported |
| `src/lib/services/publication.service.ts` | guards in `publishElection` / `inviteVoter` / `resendVoterLink`; `PublishResult.blocked`; `SendableElection`; `InviteResult` |
| `src/lib/services/vote.service.ts` | `isClosed` → `votingOver` |
| `src/actions/elections.ts` | `deadlinePassed` refusal; `blocked` passthrough |
| `src/actions/voters.ts` | `blocked` passthrough; `windowOver` error from `resendVoterInvite` |
| `src/app/api/cron/activate-elections/route.ts` | close sweep |
| `src/lib/elections-view.ts` · `src/components/voter/voter-ui.tsx` | `hour: "2-digit"` |
| `src/components/elections/start-election-card.tsx` · `voters/add-voters-dialog.tsx` · `voters/voter-roster.tsx` | render the blocked outcome |
| wizard: `step-settings` · `step-review` · `wizard-shared` · `election-wizard` · `actions/create-election.ts` | `autoCloseOnDeadline` removed |
| `messages/{hr,en}.json` | `windowOverNote` · `deadlinePassed` · `addedWindowOver` · `toast.windowOver`; toggle keys removed |

**No schema change. No new dependency.**

## Verification

`npm run test` **276/276** (+18) · `npm run build` clean · **0 console errors**.

Live against the dev branch, with the 4 genuinely-broken elections used as the fixture *before* the sweep closed them:

| Check | Result |
| --- | --- |
| QR entry on a window-over election | 0 forms, 0 inputs, "Glasovanje je završilo" |
| Healthy election (control) | form + input still render |
| `request-link`, real on-list voter | 200, **0 tokens minted** |
| Same, off-list address | byte-identical 200 |
| Cron: no auth / wrong secret | 401 / 401 |
| Sweep | `{activated: 0, closed: 4}`, second ping `{closed: 0}` |
| `endsAt` after sweep | byte-identical to before |
| Start card / add voters / roster resend | all three blocked messages render (hr) |
| Refused resend | voter's existing token **not** rotated |
| Start on passed deadline | toast fires, row stays DRAFT, `startsAt` untouched, 0 tokens |
| Hydration on a 00:00 election | 0 console errors (was 1) |

Fixtures were created via a temporary script and removed through the app's own delete flow; dev DB SQL-verified back to 22 elections / 1660 votes / 0 orphan tokens.

## Dev-environment notes

- **`npm run build` clobbers the `.next` a running dev server is serving** — restart before browser-verifying, or you get `ChunkLoadError` on any route needing fresh compilation.
- **`TaskStop` on `npm run dev` can leave a zombie holding port 3000.** The next `npm run dev` silently moves to 3001 while the zombie serves a deleted `.next`. Check `netstat -ano | grep ":3000"` and kill by PID.

## Open

- The `autoCloseOnDeadline` column is dead weight until a migration drops it.
- A voter who reaches an old link during the gap before the sweep runs sees the closed screen — correct, but the admin UI still reads *Aktivan* for those minutes (deliberate, `context/fixes/expired-token-sends-spec.md` Decision 5).
- Wizard edit mode would remove the `deadlinePassed` dead end.
