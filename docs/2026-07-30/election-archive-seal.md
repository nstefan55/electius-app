# Election Archive Seal — Merkle Tree, Integrity Stage 3

**Branch:** `feature/election-archive-seal` · **Version:** stays 0.9.8 (bump skipped at user request)
**Spec:** `context/features/Archived Spec Files/election-archive-merkle-seal-spec.md`

Archiving stops being a status flip and becomes **sealing**: every `voteHash` of the election is
built into a deterministic Merkle tree, and the root plus the full proof data is frozen into an
`Archive` row alongside a snapshot of the election's configuration.

From that point a voter's on-screen verification code is an **independently checkable claim** —
anyone holding the archive JSON can recompute the tree offline and prove (a) the vote set is
exactly what was sealed and (b) their own code is in it, without the database, without this app,
and without trusting Electius.

This is stage 3 of the Security & Integrity chain (stage 1 publication v0.8.0, stage 2 voter flow
v0.9.0). No new npm package — `crypto` is stdlib. No schema change — the `Archive` model has been
in v2 since the start and nothing had ever written to it.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/services/merkle.service.ts` | **new** — `buildMerkleTree` · `merkleProof` · `verifyMerkleProof` |
| `src/lib/services/archive.service.ts` | **new** — `sealElection` · `ElectionSnapshot` · `ArchiveError` |
| `src/actions/elections.ts` | `archiveElection` rewritten onto the seal (**+ bug fix**, see below) |
| `src/lib/db/elections.ts` | `getElectionResults` **+** `sealed` · **+** shared `ArchiveSeal` type |
| `src/components/dashboard/recent-elections.tsx` | Archive item CLOSED-only · seal toast with the short root |
| `src/components/elections/election-results.tsx` | `AuditPendingCard` → `AuditCard`, two branches |
| `src/components/elections/election-report.tsx` | sealed sentence + root in the PDF report |
| `src/components/elections/archive-list.tsx` | sealed sentence in the audit modal |
| `messages/{hr,en}.json` | **+4 keys**, **−1** (`actions.toast.archived`, orphaned) |

**311 tests pass** (+27). `npm run lint` and `npm run build` clean.

---

## The algorithm IS the contract

Documented in code **and** persisted in `proofData.algorithm`, because a third party has to be able
to reimplement it in ~30 lines of any language. Do not change these rules without a new version
string.

```
algorithm:    "sha256-hex-concat/dup-last/lex-asc"
leafOrdering: "lexicographic-asc"
```

1. **Leaves** = all `voteHash`es of the election (64-hex), sorted **lexicographically ascending**.
2. **Parent** = `SHA-256(leftHex + rightHex)` — UTF-8 concatenation of two 64-hex strings, output hex.
3. **Odd node count** → the last node is duplicated (bitcoin-style).
4. Level by level until one root remains.

Two edge rules that are deliberate, not oversights:

- **0 votes** → `root = SHA-256("")`, `tree = [[]]`. Sealing a zero-vote election is legal and still
  tamper-evident about its emptiness.
- **1 vote** → `root = SHA-256(leaf + leaf)` via the odd rule. The root is **not** the leaf. A
  smaller tree would mean two rules instead of one, and every undocumented exception is a place two
  implementations quietly disagree.

**Why lexicographic sorting matters beyond determinism:** it destroys any time-order signal
(complementing `Vote.batchOrder`) *and* makes the tree derivable from the bare hash set. If the root
depended on insertion order, an auditor would need to know the order votes were written — which is
exactly the correlation the anonymity model removes. Sorting is what lets the seal be reproducible
and anonymity-preserving at once.

**Proof paths are not persisted.** They are derivable from `tree`; storing them would be O(n log n)
hashes of data the verifier recomputes anyway. `proofData` holds exactly five keys:
`algorithm`, `leafOrdering`, `leaves`, `tree`, `root`.

### `position` is the sibling's side

`merkleProof` returns steps of `{ hash, position }` where `position` is which side the **sibling**
sits on — so `"left"` means the sibling goes first in the concat:

```ts
position === "left" ? sha256Hex(hash + acc) : sha256Hex(acc + hash)
```

Get this backwards and it still passes on even-leaf trees: on duplicated levels the sibling *is* the
node, so the concat is symmetric and the error is invisible. That is why a **3-leaf tree has its own
test** — it is the smallest tree that mixes symmetric and asymmetric levels.

`verifyMerkleProof` rejects an empty path explicitly rather than letting the fold compare a leaf to
the root and return `false` by arithmetic accident. It deliberately does **no** shape or length
validation: a garbage step already fails reconciliation, and coupling the primitive to a digest
format would reject valid proofs the day the format legitimately changes. Bounds belong at the
future public verify route, where a malformed body can return a 400 instead of a silent `false`.

---

## `sealElection` — one transaction, guards in the WHERE

```ts
sealElection(electionId: string, organizationId: string): Promise<{ merkleRoot, votesSealed }>
```

1. Load the election `where { id, organizationId, status: "CLOSED" }` with its options, vote hashes,
   voter count and `createdBy.isPro`. Missing, cross-org and wrong-status all return `null` and
   collapse into one `ArchiveError("invalidStatus")` — **no existence oracle**.
2. Build the tree.
3. Assemble the `ElectionSnapshot`.
4. **One interactive `$transaction`**: `archive.create`, then
   `election.updateMany({ where: { id, organizationId, status: "CLOSED" }, data: { status: "ARCHIVED" } })`.
   `count === 0` throws, which rolls the Archive row back.

The create-then-check order looks backwards but is the point: `updateMany`'s count **is** the check,
and it only exists once the write is attempted. Guard and mutation being the same statement means no
window exists where two concurrent seals both see "still CLOSED". `Archive.electionId` being unique
is the second belt.

**Immutable once sealed.** There is no update path; re-sealing an ARCHIVED election returns
`invalidStatus`. The existing `deleteElection` transaction already clears Archive rows first.

### The snapshot's no-PII rule is a type, not an assertion

`ElectionSnapshot` declares config, options and counts — and **no voter fields at all**. Because the
object is built as a typed literal, adding an email is a *compile error*, not something a reviewer
has to catch. Same technique as `VoterExportRow` making a token export impossible.

Individual votes exist in the archive only as hashes in the tree, so a sealed archive can prove
integrity but can never reconstruct who voted for what.

### Retention

`expiresAt = createdAt + 1 calendar year` (Free) or `null` (Pro), read from **`createdBy.isPro`**,
not the acting admin's session — on a multi-admin org the person clicking Archive is often not the
person who owns the record, and retention attaches to the election.

Use a calendar year (`setFullYear`), not `365 * 24 * 60 * 60 * 1000`; the latter lands a day early
in a leap year and nothing would notice, because **nothing prunes yet**. Only the stamp is in scope
here — the pruning job and the Pro-downgrade clawback belong to the retention/billing spec.

---

## This is also a bug fix — say so in review

`archiveElection` was the one mutation in the codebase that **read then checked**:

```ts
if (!(await assertOwned(id, organizationId))) return { success: false, error: "forbidden" };
await prisma.election.update({ where: { id }, data: { status: "ARCHIVED" } });
```

Two live defects: **no status guard at all**, so an ACTIVE election could be archived mid-vote; and
ownership verified in a separate round trip from the write — the check/write race that invariant #3
exists to forbid. The `sealElection` transaction closes both as a side effect, which is exactly why
it needs calling out: a reviewer scanning the diff would otherwise read pure feature work.

Tightening archive to **CLOSED-only** is a deliberate behaviour change, not a regression. Sealing a
live election would freeze it mid-vote.

---

## The three audit surfaces, and one shared key

`getElectionResults` now carries `sealed: ArchiveSeal | null` (same shape `getArchivedElections`
already returned), so all three surfaces speak one vocabulary:

| Surface | Sealed | Unsealed |
| --- | --- | --- |
| `/archive` audit modal | green shield · full root · seal date | grey clock · "— dostupno nakon arhiviranja" |
| `/elections/[id]/results` audit card | green shield · full root | grey clock · pending copy |
| PDF report | sealed sentence · root | audit note alone |

**`dashboard.election.report.auditBody` stays soft and is never forked.** It describes *how* votes
are recorded — anonymous record, per-ballot hash — and is true for every election. The stronger
claim lives in a **new** `auditSealedBody`, rendered only where a real `merkleRoot` exists.

This matters because the report renders for CLOSED and LIVE elections, which are never sealed
(sealing happens at archival). Strengthening the shared key would print a false integrity claim on a
document an organization keeps permanently — the same failure the PDF report's D3 decision avoided
by softening its original wording.

The results page's audit card previously read "…ta je značajka u pripremi" ("that feature is in
preparation"). Shipping the seal makes that false everywhere and flatly wrong on a sealed archive,
so it grew the same two branches — outside the spec's literal goal list, but leaving it would have
meant knowingly shipping a lie.

---

## Elections archived before this shipped stay unsealed — permanently

Sealing is CLOSED-only and immutable, so the elections already sitting in `ARCHIVED` have no Archive
row and **can never acquire one**. That is deliberate: a backfill would build a tree over a vote set
nobody witnessed at close time, manufacturing exactly the assurance the seal exists to provide.

**The unsealed branch of every audit surface is permanent, not scaffolding.** Do not delete it.

---

## Verifying a sealed archive offline

This is the story the feature exists to support, and it is worth re-running whenever the algorithm
is touched. Given `proofData` and the vote hashes:

1. **Recompute** — sort `leaves`, rebuild by the documented rule, check the root equals `merkleRoot`.
2. **Membership** — a voter's code must appear in `leaves`, and
   `verifyMerkleProof(code, merkleProof(tree, code).path, root)` must hold.
3. **Tamper** — any leaf added, removed or altered changes the root; a forged path fails the fold.

Verified live on a real 252-vote sealed election, with an implementation written from the algorithm
string alone that imports nothing from `merkle.service`: the independent root matched the stored
root byte-for-byte, all 252 codes proved membership, and altered code / forged sibling / wrong root /
never-sealed were all rejected. Dropping or adding a vote changed the root; reordering did not.

> Scripts note: a one-off verification script needs `npx tsx --conditions react-server` — the
> `server-only` guard blocks a plain `tsx` import, and tsx does not load `.env.development` the way
> `prisma.config.ts` does for the Prisma CLI.

---

## Recorded ceilings

- **No auto-seal.** The cron sweep closes; the admin archives. If an org never archives, CLOSED
  elections simply accumulate — harmless.
- **`proofData` stores the full tree** (O(n) hashes). Fine at Free scale (≤50 voters ⇒ ≤50 leaves);
  revisit only if Pro-scale JSONB size ever matters.
- **Pruning is not enforced.** `expiresAt` is stamped correctly, but nothing deletes expired
  archives.
- **R2 fields stay null** — `fileUrl` / `fileName` / `fileSize` / `url` belong to a later storage spec.
- **`autoCloseOnDeadline` is a dead column** — no reader, no writer, no UI since
  `fix/expired-token-sends`. Do not reintroduce it into a WHERE clause; auto-close decides on
  `windowOver(e)`.
- **No public verify page yet.** `proofData` ships ready for one; the route is post-MVP.
