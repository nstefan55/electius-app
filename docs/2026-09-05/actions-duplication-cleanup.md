# Actions Duplication Cleanup — one home for two voter rules, one session fixture

**Describes:** the work shipped by `chore/actions-duplication-cleanup` as **v0.9.61**.
This document lands in the **same** pull request as the code, unlike `docs/2026-09-05/ci-required-checks-and-coverage.md`, which followed its merge.
**Date:** 2026-09-05 · **Application behaviour change:** none. No migration, no new dependency, no changed query, no changed response shape.

> A scan of `src/actions/` for duplication found six candidates. Three were taken; three were
> left alone, and the reasoning for leaving them is the more useful half of this document.
> The rule that separates them: **structural** repetition is the security contract and must
> stay visible, **logical** repetition is one rule with two implementations and will drift.

---

## 1. What was scanned, and what was found

All six action files (1,062 source lines) and their five colocated test files (1,936 lines).

| # | Finding | Verdict |
| --- | --- | --- |
| 1 | `resendInvitations` inlines a copy of `assertOwnedActive`, four lines above the helper's own callers | **taken** |
| 2 | Voter-row dedupe + name split implemented twice, in `create-election.ts` and `voters.ts` | **taken** |
| 3 | `updateProfile` / `setAccessibilityPref` / `setLocale` are the same ten lines three times | left |
| 4 | The `session` test fixture copied byte-identically into five test files | **taken** |
| 5 | `type ActionResult = { success: boolean; error?: string }` declared four times | left |
| 6 | Session email → user id resolved in three places | left |

Items 3, 5 and 6 are real duplication and were deliberately not taken: each is a handful of
lines, none of them can drift into a *wrong* answer, and the scan was asked for cleanups worth
making rather than every cleanup available. They stay recorded here so the next scan does not
re-derive them from scratch.

---

## 2. What was deliberately **not** touched

This matters more than the three that were, because each of these looks like duplication and is not.

### 2.1 `try { … } catch { return { success: false, error: "failed" } }` — sixteen times

The obvious refactor is a `withAction()` higher-order function. It is wrong here for three
concrete reasons, all visible in the current code:

- `startElection` deliberately places `publishElection` **outside** its `try`, because from the
  status flip onward the election *is* active and a send failure must never be reported as a
  start failure (`src/actions/elections.ts`).
- `deleteElection` carries a **second, nested** `catch` around the R2 object delete, so a failed
  storage call cannot report failure for a database transaction that already committed.
- `updateOrganization` maps `P2002` to a named `emailTaken` error instead of the generic one.

A wrapper would hide all three, and each exists because someone thought about that specific
action's failure mode. The repetition is the shape of the `{ success, data, error }` contract in
`context/coding-standards.md`, not an accident.

### 2.2 The repeated `findFirst({ where: { id, organizationId, … } })`

This is **invariant #3** — every admin query is org-scoped, and guards live in the WHERE clause
so that missing, cross-org and wrong-status collapse into one error with no existence oracle. It
appears in seven places because it is supposed to appear in seven places. Each `select` differs
because each caller needs different columns; `deleteElection` reads `reportKey` in the same round
trip precisely so it has the key before the row is gone.

Collapsing it into a helper would remove the thing a reviewer scans an action for.

### 2.3 The `mutationsFrozen` read-then-refuse block, three times

Superficially identical, structurally not: `renameElection` selects the election directly,
`addVoters` selects it *with its voters* in one query, and `updateVoterName` reaches it through
the voter relation. A shared helper would take a pre-fetched election and therefore save nothing
but the `if`.

---

## 3. The three changes

### 3.1 `resendInvitations` reuses the helper that already existed

`src/actions/elections.ts` defines `assertOwnedActive(id, organizationId)` and documents it as the
check for "anything that emails voters" — then `resendInvitations`, which emails voters, carried a
verbatim inline copy of its body. Same query, same `select`, four lines below two callers that use
the helper.

```ts
// before
const owned = await prisma.election.findFirst({
  where: { id, organizationId, status: "ACTIVE" },
  select: { id: true },
});
if (!owned) return { success: false, error: "invalidStatus" };

// after
if (!(await assertOwnedActive(id, organizationId))) {
  return { success: false, error: "invalidStatus" };
}
```

Behaviour-identical by construction, and proven so: the existing test
*"guards on org ownership AND ACTIVE status in one WHERE clause"* fails when the guard is removed
and passes unchanged after the swap.

### 3.2 Two voter rules move to `src/lib/wizard-csv.ts`

Both the creation wizard and later voter additions take rows validated by `voterRowSchema` and
turn them into `Voter` rows. Both therefore need the same two rules, and both had their own copy:

- **case-insensitive dedupe**, because `@@unique([email, electionId])` rejects the whole write on a
  duplicate, so the filter has to happen before it reaches Prisma;
- **the name split**, one `name` field into `firstName` + `lastName`.

Both now live in `wizard-csv.ts`, beside the schema they consume:

```ts
export function dedupeVoterRows(rows: VoterRow[], existing: string[] = []): VoterRow[]
export function toVoterFields(row: VoterRow): {
  email: string; firstName: string; lastName: string | null;
}
```

Two details are load-bearing:

- **`existing` is a parameter, because that is the only thing the two call sites ever differed
  on.** The wizard passes nothing (the election does not exist yet, so no addresses can be on it);
  `addVoters` passes the roster it already fetched in the ownership query. Neither call site needed
  a flag or a second function.
- **`toVoterFields` deliberately omits `electionId`.** The wizard writes voters nested inside
  `election.create`, where the foreign key is implicit; `addVoters` uses `createMany` and must
  supply it, which it does by spreading: `{ electionId, ...toVoterFields(r) }`. Putting
  `electionId` in the helper would force the wizard to strip it back out.

Behaviour is preserved exactly, including the existing treatment of a name with no surname
(`lastName: null`, never `""`).

### 3.3 One typed session fixture

The five action test files each declared the same ~18-line `session` object. That is not a
cosmetic duplication — **it has already caused a build failure.** When `Session` gained the
required `accessibility` field with settings phase 5 (2026-08-02), three of the five copies were
never updated. Vitest stayed green, because it strips types rather than checking them; `tsc`
carried 57 errors that surfaced only in the separate cleanup pass that went looking for them.

`src/actions/session-fixture.ts` now holds one copy, annotated with its real type:

```ts
import type { Session } from "@/lib/auth/require-session";
export const session: Session = { … };
```

The explicit `: Session` is the point. An untyped object literal is only checked where it is
*used* (through `mockResolvedValue`), so a missing field produces five identical errors in five
files; the annotation produces one error at the definition. The `import type` is also deliberate —
`require-session.ts` carries `server-only`, and a type import is erased at compile time, so no
runtime import exists.

---

## 4. Verification

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 errors, 7 warnings — all pre-existing `window.location.assign` in auth components, none in touched files |
| Test suite | **765 passing / 42 files** (from 758 / 42) |
| Line endings | CRLF preserved on all 11 files |

### 4.1 Mutation check — five mutations, all caught by named tests

The extraction is only safe if the tests actually pin the extracted behaviour. Each mutation was
applied to a byte-copy of the source, the suite run, and the source restored:

| Mutation | Caught by |
| --- | --- |
| `dedupeVoterRows` drops `toLowerCase()` | `voters.test.ts` › *skips duplicates against the existing roster case-insensitively* · `wizard-csv.test.ts` › *filtrira i prema adresama koje su već u bazi* |
| `dedupeVoterRows` ignores `existing` | same two, plus *writes nothing when every row is already on the list* |
| `toVoterFields` returns `""` instead of `null` | `wizard-csv.test.ts` › *jedna riječ ostavlja prezime praznim, ne praznim nizom* · `create-election.test.ts` › *splits the name on the first space and nulls a missing surname* |
| `toVoterFields` keeps the whole name as `firstName` | `wizard-csv.test.ts` › *prva riječ je ime, ostatak prezime* + two action tests |
| `resendInvitations` loses its guard | `elections.test.ts` › *guards on org ownership AND ACTIVE status in one WHERE clause* |

Every mutation was caught on **both** sides — by the seven new `wizard-csv.test.ts` cases *and* by
the pre-existing action tests, which never knew the logic moved. That is what makes this a
refactor rather than a rewrite.

A **control run on unmutated source ran first** and was green. Without it, a broken harness reports
every mutation as "caught" and the whole exercise is worthless — which is not hypothetical here:
the first harness attempt passed `--reporter=basic`, removed in Vitest 4, and the control run is
what turned that into a visible failure instead of five false passes.

---

## 5. Two traps hit while doing this

Both are recorded because both produced a convincing wrong result before being caught.

### 5.1 An anchor that matched twice

The first patch attempt anchored on

```
    if (parsed.success) rows.push(parsed.data);
    else skipped++;
  });
  return { rows, skipped };
}
```

which ends **both** `parseCandidatesCsv` and `parseVotersCsv`. The patch script asserts the match
count before writing and refused. Without that assertion the append would have landed inside the
first function. This repo has twice recorded the inverse failure — a multi-line pattern written
with `\n` silently never matching a CRLF file, so a mutation that failed to apply looked exactly
like a mutation no test caught. **Assert the anchor was found; never let a no-op look like a pass.**

### 5.2 `prettier --write` on a repo with no prettier config

Running Prettier over the touched files reformatted roughly forty **unrelated** lines — the
`await import(…)` wrapping and a `.mockReset().mockResolvedValue()` chain in `elections.test.ts` —
and rewrote every file from CRLF to LF.

There is no `.prettierrc` in this repository, so Prettier's defaults are not the committed style,
and its `endOfLine` default is `lf`. Everything was reverted with `git checkout --` and re-applied
by hand. **A formatter is only safe on a repository that pins one.** Git's `autocrlf` would have
normalised the endings on commit, so the staged diff would have looked clean while the working copy
drifted from every sibling file — the same divergence the 2026-08-02 cleanup pass had to undo.

---

## 6. What this does not do

- **No behaviour changed anywhere.** Same queries, same guards, same responses. The name-split
  quirk where a double space produces a leading space in `lastName` is preserved exactly; it now
  lives in one place, so it is fixable in one place, but fixing it was not in scope.
- **`settings.ts` was not consolidated** (finding 3), nor `ActionResult` (5), nor the user-id
  lookup (6).
- **`npm run build` was not run.** It clobbers the `.next` directory a running dev server serves
  from — a failure mode this project has hit twelve times. `tsc --noEmit` covers the same class of
  error, does not touch `.next`, and is what CI runs as `typecheck`.
