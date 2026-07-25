# Voter Flow — Ballot & Vote Casting

> Branch: `feature/voter-flow` · v0.9.0 · Spec: `voter-flow-spec` (Voter Flow Spec Files) · Design: `context/design/voter-flow-pages/Voter Flow.dc.html`
> Implements **stage 2** of the Security & Integrity Model chain (stage 1 = election publication, v0.8.0; stage 3 = archive/Merkle, upcoming).

## What shipped

The voter-facing half of the product. A voter opens the magic link from their invitation email (`/vote/[token]`), casts a vote in 5 mobile-first screens, and leaves with a cryptographic verification code. Every state in the design prototype is a real screen — not just the happy path.

| Surface | File |
| --- | --- |
| State router + cast transaction | `src/lib/services/vote.service.ts` |
| Single-voter re-mint | `src/lib/services/token.service.ts` (`mintTokenForVoter`) |
| Voter-initiated resend | `src/lib/services/publication.service.ts` (`resendVoterLink`) |
| Vote API | `POST /api/vote` |
| Link-request API | `POST /api/vote/request-link` |
| 5-screen flow (client) | `src/components/voter/vote-flow.tsx` |
| Server state screens | `src/components/voter/state-screens.tsx` |
| QR / email entry form | `src/components/voter/request-link-form.tsx` |
| Shared voter UI bits | `src/components/voter/voter-ui.tsx` |
| Page entry | `src/app/[locale]/(voter)/vote/[token]/page.tsx` |

## The state router (read before touching `/vote/*`)

`getBallotState(segment)` resolves every request server-side. The URL segment is **either** a voter token (found by SHA-256 hash) **or** an election id (the wizard QR poster / "request a new link" entry) — the namespaces can't collide.

Check order is deliberate and design-driven:

| # | Condition | Screen |
| - | --- | --- |
| 1 | No token row, no election row | `invalid` |
| 2 | No token, election ACTIVE | `qrEntry` (email form) |
| 3 | No token, election SCHEDULED | `notStarted` (generic sub) |
| 4 | No token, election CLOSED/ARCHIVED | `closed` (no voted variant) |
| 5 | No token, election **DRAFT** | `invalid` — **an unstarted draft must not leak its existence or placeholder dates** |
| 6 | Token, election CLOSED/ARCHIVED | `closed` — voted/not-voted variant by `token.used` (checked **before** `used` so a voter who voted in a now-closed election gets the closed-voted framing, not "already voted") |
| 7 | Token, election SCHEDULED/DRAFT | `notStarted` (unreachable today — invitations only exist after activation; built per design) |
| 8 | Token `used` | `used` (reassurance tone, success alert) |
| 9 | Token expired, election still ACTIVE | `expired` — CTA links to the election-id entry (self-serve resend) |
| 10 | All pass | the 5-screen ballot |

Schema note: `VoterToken` has **no** election relation (`electionId` is a denormalized scalar) — the election rides through `token.voter.election`.

## The cast transaction

`castVote(rawToken, optionIds)` re-runs every validity check (the page check is UX; this is the security boundary), validates the selection (options belong to the election, deduped; SINGLE ⇒ exactly 1; MULTI ⇒ ≥1, **no upper cap** — decision (a), no `maxChoices` field), then runs one interactive `$transaction`:

1. `voterToken.updateMany({ where: { id, used: false }, data: { used: true } })` — `count === 0` ⇒ typed `VoteError("used")` → 409. The race guard lives in the WHERE clause; two tabs submitting the same token yield exactly one vote.
2. `voter.update` → `status: "VOTED"` — *who* voted, never *what*.
3. `vote.create` — `voteHash`, random `batchOrder` (`crypto.randomInt`), election connect, junction rows. **No `voterId` — the column doesn't exist** (verified live: `information_schema` shows `votes` = id, voteHash, batchOrder, createdAt, electionId).

`voteHash = SHA-256(electionId + sortedOptionIds.join(",") + timestampISO)` — sorted, so multi-choice hashes are selection-order-independent. The timestamp exists only inside the hash. The confirmation screen shows it as the voter's "verification code" (deliberately not "publicly verifiable proof" until the archive spec ships the Merkle tree).

## API contract

`POST /api/vote` — body `{ token, optionIds[] }` (zod):

| Status | Meaning | UI reaction |
| --- | --- | --- |
| 200 `{ voteHash }` | vote recorded | confirmation screen |
| 400 | malformed body / selection breaks the rules | fail state |
| 409 | token spent (race) | dedicated race screen — "retrying will not help" |
| 410 | token unknown/expired, election not ACTIVE | full page reload → server renders the matching state screen |
| 429 | rate limited (`Retry-After` header) | fail state |

`POST /api/vote/request-link` — body `{ electionId, email }`: **always 200** for a well-formed request (unknown email, already-voted, even a send failure — all identical), so the response can't enumerate the voter list. Only 400/429 differ. Serves PENDING + INVITED voters of ACTIVE elections; re-mint revokes the previously emailed link; PENDING flips to INVITED after a successful send.

Rate limits (`src/lib/rate-limit.ts`, fail-open): `vote` **30/15min per IP** — sized to survive a campus-NAT voting session (many voters, one public IP; tokens are 256-bit single-use, the limiter only deters junk load); `resendVoteLink` **3/15min per IP+email**.

## Token lifetime (recap)

- `expiresAt = election.endsAt`; unscheduled close (`endsAt <= startsAt`) → activation + 30 days.
- Effectively single-use: `used` flips atomically with the vote.
- Any resend = delete + re-mint → the old link dies instantly.
- Raw tokens are never stored: DB holds SHA-256 hashes only; the raw value lives in the emailed URL and, transiently, in the client for the one POST.

## i18n & UI notes

- Namespace `voter.flow` (hr + en), copy verbatim from the prototype's built-in translations; `voter.ballot` placeholder keys retired.
- Decision-(a) copy adaptations: method reads "Više glasova"/"Multiple votes", multi sub "Odaberite jednu ili više opcija", counter "Odabrano: {n}".
- Voter chrome now shows the logo + "Electius" wordmark (prototype alignment; asset `public/logo/logo-mark-light.png`).
- Date rendering is UTC (`formatVoterDateTime`) — deterministic across server/browser, no hydration mismatch.
- Refresh mid-flow restarts at screen 1 (client-only state; ballot is unsubmitted, so this is correct).

## Verified

- **Vitest 85/85** (34 new): state-router table, voteHash vector + order-independence, selection matrix, race abort writes nothing, no-voterId/no-raw-token pins, enumeration-safe resend, re-mint revocation.
- **Live (dev server + dev DB):** full 5-screen hr walk with real voteHash → SQL-proven (VOTED, used, 1 vote + junction); **two-tab race** → one 200 + one designed race screen, exactly 1 vote; all state screens incl. DRAFT-id no-leak and `/en`; QR resend round trip with a real Resend send + token-hash rotation; off-list email → identical response; 4th resend attempt → 429; curl matrix 409/410/410/400.

## Handoffs

- **Archive spec (stage 3):** Merkle tree over the voteHashes, lexicographic leaf order → makes the verification code independently checkable.
- **Results specs:** the closed state's "View results" CTA already links to public `/results/[id]` (gated by `resultsVisible`) — the page content is theirs.
- **Election overview (admin):** live turnout now moves for real as votes land.
