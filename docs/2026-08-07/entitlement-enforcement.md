# Entitlement Enforcement — Phase 8

**Branch:** `feature/entitlement-enforcement` · **Version:** 0.9.15 → **0.9.16** (patch — the 0.9.x lock holds)
**Spec:** `context/features/entitlement-enforcement-spec.md`
**Depends on:** stripe phase 1 (the pure `entitlements.ts`) and phase 2 (`billing.service.ts`, the
projection that makes `isPro` true and trustworthy)

Phase 7 made `isPro` trustworthy and deliberately gated nothing. Phase 2 mounted Stripe and
deliberately gated nothing. **This phase turns gating on** — the resolver every gate reads through,
the voter caps, the branded-PDF line, and the archive prune sweep that finally reads a column stamped
since the seal shipped.

**One migration** (`Archive.prunedAt`). No new route file, no new server action, no new dependency.

---

## Read this first

1. **Nothing enforces in production yet, and that is the design.** `BILLING_ENABLED` is now the
   enforcement flag. While it is unset, `resolveEntitlement` returns `pro` for everyone — no cap
   refuses anyone and the sweep prunes nothing. See [§1](#1-the-entitlement-seam).
2. **The migration exists to avoid a silent bug, not to store data.** A negated Prisma JSON path
   filter would have made the sweep prune *nothing*, invisibly. See [§4](#4-why-prunedat-is-a-column).
3. **The prune touches `proofData` and nothing else.** No R2 call, no `report*` column. The spec
   contradicted itself here; the table won. See [§3](#3-the-archive-prune-sweep).
4. **The sweep does not trust `expiresAt`.** It re-derives the expiry from live entitlement, because
   the retention stamp is one-directional. See [§3](#3-the-archive-prune-sweep).
5. **Two advertised Pro features still do not exist.** Deliberately deferred — see
   [§7](#7-what-this-phase-did-not-do).

---

## 1. The entitlement seam

New: **`src/lib/services/entitlement.service.ts`** (`server-only`).

```ts
export const BILLING_ENABLED: boolean;   // process.env.BILLING_ENABLED === "true"
export async function resolveEntitlement(
  electionId: string | null,
  organizationId: string,
): Promise<Entitlement>;
```

Resolution order is fixed and must not vary per call site:

> **per-election purchase → `isPro` → Free**

**No gate reads `isPro` directly.** If one does, the resolution order lives in one more place than
there are gates.

### Why it lives in `services/`, not `src/lib/entitlement.ts`

The spec named `src/lib/entitlement.ts`. That is **one character** from the shipped, client-safe
`src/lib/entitlements.ts` — a trap for every future reader — and `services/` is this repo's
convention for `server-only`. Decided at stripe-phase-2 `start`, confirmed here.

The **pure** half (`voterCap`, `canBrandReports`, `archiveExpiresAt`, `nearCap`) stays in
`src/lib/entitlements.ts` with no `server-only`, because a client component has to render
*"42 of 50 voters used"*.

### Why it resolves by organization, not by session

`requireSession()` already carries `isPro`, so reading it would be free. It is still wrong:

- the **cron sweep has no session** and must resolve entitlement for arbitrary orgs;
- the **seal's retention** must follow the record's owner, not whoever clicked Archive.

So the resolver runs one `findFirst` for any `isPro` admin in the org. `billing.service.ts` writes
`isPro` org-wide, so any admin carrying it is a correct answer for the organization.

`ponytail:` one extra query per gated action. Acceptable and explicitly budgeted by the spec.

### `BILLING_ENABLED` folded in (carried over from stripe phase 2)

It used to be read directly in `(app)/settings/page.tsx:15`. It now lives here and the settings page
imports it.

```ts
export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
```

`=== "true"`, never `!== "false"`: **absence and a typo both mean "everyone is Pro"** — the legally
safe side while there is no entity to take money. This is the inverse of
`EMAIL_VERIFICATION_ENABLED`, where the strict path is the safe one.

It doubles as the enforcement flag, so this phase needs **no second
`ENTITLEMENT_ENFORCEMENT_ENABLED`**. One flag, one meaning.

---

## 2. Voter caps

Free **50** / Pro **500**, **per election**. Exactly two enforcement points, both **after dedupe and
before any write**.

| Path | Check | Refusal |
| --- | --- | --- |
| `createElection` | `voters.length > cap` (after its own dedupe) | `{ success: false, error: "voterCap", cap }` |
| `addVoters` | `election.voters.length + fresh.length > cap` | `{ success: false, error: "voterCap", cap, current }` |

### Count `fresh`, not `rows`

`addVoters` dedupes *before* writing. Counting the submitted rows would refuse a Free org at 50
voters who re-uploads the same 50-row CSV — `50 + 50 > 50` — even though `fresh.length === 0` and the
call inserts nothing. The check sits **after** the dedupe filter and costs no query: `election.voters`
is already selected by the ownership `findFirst`.

There is a test named for exactly this, and mutating the formula back turns it red.

### The refusal is a failure, not a `blocked` qualifier

`AddVotersResult.blocked` is read **only on the success path** — it means *"the voters were added,
but the invitation did not go out"*. A cap refusal is the opposite: a failure that adds nothing.
Routed through `blocked` it would have fallen silently into the generic `failed` toast.

`add-voters-dialog.tsx` handles it inside its existing `!res.success` branch. `cap` and `current`
ride along because a bare `error: string` cannot name the numbers the message needs.

### A refusal writes nothing

The check precedes `createMany` / `election.create`, and tests assert the Prisma mock was **never
called**. A guard that rejects after inserting is worse than no guard.

### Publishing does not re-check

Settled by stripe phase 2 D2, which already amended `project-paywall-spec.md` §4. An org that
downgrades holding a 400-voter DRAFT can still start it: the voters were added under a valid
entitlement, and blocking Start is the nearest thing to *"a billing state invalidated a real vote"*.

> **The rule that must not be broken:** a running election is never interrupted by an entitlement
> change. Caps are evaluated when voters are **added** — never mid-vote, never at read time, never by
> a background job.

---

## 3. The archive prune sweep

The one genuinely new machinery. `Archive.expiresAt` has been stamped since the seal shipped and
**had never been read**.

`pruneExpiredArchives(now?)` lives in `src/lib/services/archive.service.ts`; the pure decisions live
in **`src/lib/archive-prune.ts`** (`shouldPrune`, `readProofMeta`, `buildArchiveTombstone`).

### It prunes the payload, never the row — and only `proofData`

| | Free, past expiry | Pro / purchased |
| --- | --- | --- |
| `merkleRoot` | **kept forever** | kept |
| `electionData` snapshot | **kept forever** | kept |
| Stored PDF report + R2 objects | **kept forever** | kept |
| `proofData` tree + leaves | **pruned to a tombstone** | kept |

The spec contradicted itself: its table said the PDF is kept forever, a paragraph below said to
delete `reportKey` and the three `report*` columns. **The table won**, matching the Free-tier promise
in `project-overview.md` — *"Archive record kept forever (root hash, result summary, PDF); the heavy
proof payload is pruned after 12 months."*

Consequence: **the sweep makes no R2 call at all**, and the spec's open question about retention for
a report on a CLOSED-but-never-archived election dissolves — nothing prunes reports, so nothing needs
an expiry date for them.

`proofData` is `NOT NULL`, so the prune writes a tombstone rather than nulling the column:

```json
{ "pruned": true, "prunedAt": "2027-06-01T00:00:00.000Z",
  "algorithm": "sha256-hex-concat/dup-last/lex-asc",
  "leafOrdering": "lex-asc", "root": "b4f2…" }
```

`algorithm` and `root` stay readable so an auditor can still see what the record committed to and how
the tree was built — and so a pruned row stays distinguishable from an election archived before the
seal existed. **The sweep is an `UPDATE`. It is never a `DELETE`.**

### The algorithm is read off the row, not from today's constants

`readProofMeta` takes the stored `proofData` and falls back to `MERKLE_ALGORITHM` /
`MERKLE_LEAF_ORDERING` only if the field is missing. The algorithm string **is** the contract
(`merkle.service.ts`); stamping today's onto a row sealed under a different rule would sign a claim
that is not true.

### It re-checks entitlement at prune time — it does not trust the stamp

`stampArchiveRetention` writes `expiresAt` on **downgrade**. Nothing clears it on **upgrade**. So:

```
Free org seals an archive   → expiresAt = sealedAt + 1 year
org later upgrades to Pro   → the stamp remains
sweep runs                  → would prune a paying customer's proof payload
```

Harmless until now, because nothing read `expiresAt`. **This phase is what would have made it bite.**

The fix is *not* a mirror `clearArchiveRetention` on upgrade — a missed or reordered webhook would
then silently destroy data. Instead:

- `expiresAt <= now` **selects candidates**;
- `archiveExpiresAt(entitlement, createdAt)` **re-derives the real expiry** from live entitlement;
- `shouldPrune(expiry, now)` decides.

Pro returns `null` → `shouldPrune` is false → the row survives its own stamp. Proven live:
`{ pruned: 0, kept: 1 }`.

> **Carry-forward rule:** a destructive operation verifies entitlement *when it destroys*, never from
> a stamp written months earlier by a different code path.

### Where it runs

Folded into **`POST /api/cron/activate-elections`** as a third job behind the same `CRON_SECRET` and
the same pinger. A separate route would add infrastructure the app cannot verify exists — the same
reasoning that put election closing there.

**No daily guard.** A real one needs a last-run timestamp the schema does not have, so the guard
would cost a migration more than it saves. The sweep is idempotent and its indexed WHERE matches
nothing on almost every ping. `ponytail:` add the guard only if the query cost ever shows up in
measurements.

The prune is wrapped in its own `catch`: activation and closing are time-critical, the archive can
wait for the next ping.

```jsonc
// response gained one key
{ "activated": 0, "closed": 0, "elections": [], "archives": { "pruned": 0, "kept": 0 } }
```

---

## 4. Why `prunedAt` is a column

Migration `20260807091739_add_archive_pruned_at` — one additive nullable `DateTime` on `archives`.

The alternative was filtering the tombstone with a negated Prisma JSON path filter and no migration.
Prisma does support `path` + `equals` on PostgreSQL, but the negation walks into SQL three-valued
logic:

```
row has no "pruned" key  →  path yields NULL
NOT (NULL = true)        →  NULL
NULL in a WHERE          →  row excluded
```

Every **unpruned** archive would be silently skipped and **nothing would ever prune** — a destructive
job failing by doing nothing, which no test, log or metric would surface. The column turns that into
`prunedAt: null`: exact, indexable, and free of JSON reads.

```ts
where: { expiresAt: { lte: now }, prunedAt: null }
```

The tombstone still carries `prunedAt` inside the JSON for whoever reads the payload directly.

The per-row write keeps the house atomic-guard shape, so two concurrent sweeps prune each row exactly
once:

```ts
prisma.archive.updateMany({ where: { id, prunedAt: null }, data: { … } })
```

---

## 5. Branded PDF — one line

```ts
// src/app/[locale]/(app)/elections/[id]/results/report/page.tsx
const entitlement = await resolveEntitlement(id, organizationId);
…
orgLogoUrl={canBrandReports(entitlement) ? user.organizationLogo : null}
```

`election-report.tsx` already renders the Electius mark when the prop is `null` — **no component
change**, which is the whole reason this is one line. `/api/elections/[id]/report/pdf` drives this
same page through Chromium, so the gate covers the stored PDF for free.

Two deliberate consequences:

1. **A stored report keeps whatever branding it was rendered with.** `Election.reportKey` freezes a
   PDF at close time; a report generated while Pro stays branded after a downgrade. Correct — the
   document is a record of an election, not a live view of a subscription. Stored reports are **not**
   invalidated on plan change.
2. **The gate reads the election's entitlement, not the viewer's.** At MVP the two answers are always
   identical, so it costs nothing; once pay-per-election lands, a purchased election gets branding
   even on a Free org.

---

## 6. Retention fold-in — invariant #5

`archive.service.ts` carried its **own** `oneYearFrom` plus a direct `createdBy.isPro` read: a second
implementation of the calendar-year rule, `ponytail:`-marked in `entitlements.ts` as *"fold in when
the resolver exists"*. This is that moment.

```diff
- const expiresAt = election.createdBy.isPro ? null : oneYearFrom(new Date());
+ const expiresAt = archiveExpiresAt(
+   await resolveEntitlement(electionId, organizationId),
+   new Date(),
+ );
```

`oneYearFrom` is deleted and `createdBy` is out of the seal's `select`. The seal and the sweep now
compute the same date from the same source. Both use a **calendar** year, never
`365 * 24 * 60 * 60 * 1000` — in a leap year that lands a day early, and nothing would notice.

---

## 7. What this phase did NOT do

### Live results and automatic reminders are not gated

Both gate features that **do not exist**: `Election.resultsMode` is never written by any user-facing
path, and `voterReminder24h` / `adminTurnoutReminder` are display-only with no job sending either.
Gating a toggle that drives nothing sells a feature the product does not have.

### The Pro grid honesty pass is deferred (product decision)

The `/settings` Pro grid, the marketing pricing cards and the comparison table still advertise those
two features. **Launch blocker L2 stays open**; `pro-features-implementation-spec.md` owns it. No
marketing or billing surface was touched by this branch.

⚠ Enforcement is now live code sitting next to a grid advertising two features the code cannot
deliver. That is a deliberate, recorded state — not an oversight.

### Never gated, at any tier

Quorum · abstain · 2FA · GDPR export & deletion · Merkle seal, audit page, public results · manual
"Send reminder" · CSV exports. If a reviewer proposes gating one, the answer is no.

---

## 8. UI and i18n

- **Cap refusal** — inline at the point of failure (`add-voters-dialog.tsx`, wizard step 3), naming
  the cap, the current count and a link to `/settings`. Never a bare "upgrade required".
- **Approaching the cap** — `nearCap(used, cap)` in `entitlements.ts`, threshold **80%**. One rule,
  two screens, so the wizard and the roster cannot disagree. `cap > 0` is a real guard: without it
  `nearCap(0, 0)` is true and every empty list claims to be nearly full.
- **The dialog clears its refusal on any row change** (`changeRows`) — a red box beside a list the
  user just trimmed reads as still-blocked.
- Cap is resolved in the two **server** pages (`elections/new`, `elections/[id]/voters`) and passed
  down as a prop. The client never computes an entitlement.
- i18n: existing namespaces only (`dashboard.voters`, `dashboard.wizard`). Catalogs injected with the
  byte-identical round-trip guard → **18-line diffs**, CRLF preserved.

---

## 9. Tests

**501 passing** (+37). Vitest scope is `src/actions/` + `src/lib/` only (invariant #8).

| File | Covers |
| --- | --- |
| `src/lib/services/entitlement.service.test.ts` | flag off → `pro` **without touching the DB**; typo → `pro`; org scoping in the WHERE |
| `src/lib/archive-prune.test.ts` | `shouldPrune` null/future/now/past; `readProofMeta` reads the row and falls back; tombstone carries exactly 5 keys and **no leaves or tree** |
| `src/lib/entitlements.test.ts` | `nearCap` boundaries incl. `cap === 0` |
| `src/actions/voters.test.ts` | at cap passes · one over refused writing nothing · **re-uploaded CSV at cap passes** · Pro 500/501 · `electionId` reaches the resolver |
| `src/actions/create-election.test.ts` | same, plus **drafts are capped too** (otherwise the draft path is a bypass) |
| `src/lib/services/archive.service.test.ts` | sweep WHERE shape · tombstone written · `data` keys are exactly `proofData` + `prunedAt` and `deleteObject` is never called · **Pro survives an expired stamp** · one resolve per org |

### All 9 new guards are mutation-checked

Each guard was deleted or inverted and a **specific** test confirmed red:

```
createElection: cap guard removed                          RED
addVoters: cap guard removed                               RED
addVoters: counts rows instead of fresh                    RED
shouldPrune: null no longer protects                       RED
prune sweep: trusts the stamp                              RED
prune sweep: tombstone keeps the proof payload             RED
nearCap: cap > 0 guard removed                             RED
resolveEntitlement: org scoping dropped                    RED
BILLING_ENABLED: enforcement flag ignored                  RED
```

A green test that cannot fail proves nothing.

---

## 10. Verification

`npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build` all clean.

**Live on the Neon `development` branch**, with `BILLING_ENABLED=true` and `isPro` flipped both ways,
everything restored in a `finally`:

- Free archive past expiry → pruned; tombstone shape correct; `merkleRoot` and `electionData` survive
- keys after prune: `algorithm, leafOrdering, pruned, prunedAt, root` — no `leaves`, no `tree`
- archive row **not deleted**; `deleteObject` never called
- second run `{ pruned: 0, kept: 0 }`; `prunedAt` did not move
- **Pro org with an expired stamp → `{ pruned: 0, kept: 1 }`**, payload intact, `prunedAt` still null
- the dev DB's one real archive untouched (`expiresAt` null, `prunedAt` null, before and after)
- restored and SQL-proven: 1 archive / 22 elections / 1 org / 0 pruned rows / 0 fixture rows

### Not verified live (recorded, not implied)

The **browser** half of the spec's bar — 50 accepted / 51 refused in the UI, branded vs Electius mark
on a rendered report — was not run. Both paths are unit-tested and mutation-checked, but the visual
confirmation needs `BILLING_ENABLED=true` in `.env.development` and a dev server.

---

## 11. Gotchas for the next person

- **Adding a fourth filter or list?** Resolve the cap in the **server** page and pass it down. A
  client component must never call the resolver.
- **Writing a new gate?** Call `resolveEntitlement`. Reading `isPro` directly re-creates the
  resolution order in a second place.
- **Editing `nearCap` or `voterCap`?** Two screens read them. That is the point.
- **Touching `archiveExpiresAt`?** The seal *and* the sweep depend on it. A leap-year regression here
  is invisible until a customer loses a payload.
- **`prisma migrate dev` does not regenerate the client here** — `generate` is wired to `build` and
  `postinstall` only. Run `npx prisma generate` or TypeScript will insist `prunedAt` does not exist.
- **A one-off script importing `server-only` modules** needs
  `npx tsx --conditions react-server`, must be `.mts` for top-level await, and must load
  `.env.development` itself (tsx does not).
- **The plugin security hook false-positives** on the literal `RegExp.prototype` match-call form
  written with parentheses, reading it as a shell call. Use `String.prototype.match` instead.
- **This repo is CRLF.** Prefer the Edit tool; a text-mode Python or `sed -i` rewrite turns a 20-line
  diff into a whole-file one.

---

## Related

- `context/features/entitlement-enforcement-spec.md` — the spec, incl. the four defects its
  pre-implementation review caught
- `docs/2026-08-06/stripe-integration-phase-2.md` — the projection this phase reads
- `docs/2026-08-06/stripe-integration-phase-1.md` — the pure `entitlements.ts`
- `context/features/pro-features-implementation-spec.md` — launch blocker L2
- `docs/2026-07-30/election-archive-seal.md` — the seal that stamps `expiresAt`
