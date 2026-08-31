# The stale seed file only CI could see

**Branch:** `fix/stale-seed-typecheck` · **Version:** 0.9.39 (patch, 0.9.x lock)
**Date:** 2026-08-31 · **Migration:** none · **`src/` changes:** none

The first CI failure since the pipeline landed (`.github/workflows/ci.yml`, 2026-08-30), and it
found something no local command could.

---

## 1. Symptom

```
> electius@0.9.38 typecheck
> tsc --noEmit

prisma/seed.ts(137,5): error TS2322:
  Property 'issuer' is missing in type
  '{ accountId: string; providerId: string; userId: string; password: string; }'
  but required in type 'AccountUncheckedCreateInput'.
Error: Process completed with exit code 2.
```

The same command, same commit, on the developer machine:

| Where | `npx tsc --noEmit` |
| --- | --- |
| Local working tree | **exit 0** |
| CI (`quality` job) | **exit 2** |

## 2. Cause

Two independent things had to line up.

**The type error is real.** `Account.issuer` became a required field in migration
`20260831124324_add_account_issuer` — see [`better-auth-issuer-column.md`](./better-auth-issuer-column.md).
`prisma/seed.ts` writes a credential account and predates that migration by three weeks, so it
no longer satisfies `AccountUncheckedCreateInput`.

**The file should not have existed.** `prisma/seed.ts` and `prisma/seed-results.ts` were replaced
by `prisma/demo-user-seed.ts` in the demo-user-seed rewrite (2026-08-08). They were deleted **from
disk** and never from the index — a `D` in `git status` that sat there for three weeks.

So the error is in a file that is, from the developer's point of view, already gone.

## 3. Why every local gate said "clean"

> `tsc` type-checks the files **on disk**. CI type-checks the files **in the commit**.

A file deleted locally but not committed is invisible to one and fully visible to the other.
Nothing in the local toolchain closes that gap:

| Gate | Sees a tracked-but-deleted file? |
| --- | --- |
| `tsc --noEmit` | no — compiles the working tree |
| `eslint` | no — same |
| `vitest` | no — same, and it strips types anyway |
| `next build` | no — and `prisma/` is not in the app graph regardless |
| `git status` | shows ` D`, but says nothing about it breaking a build |

**Every "typecheck clean" recorded in this project's history was true of the working tree and was
never a statement about the committed tree.** CI is the first thing that has ever compiled what is
actually in git.

### The check that makes local evidence sound

If every file in the index also exists on disk, then the local file set is a *superset* of CI's,
and local-pass genuinely implies CI-pass for tracked files:

```bash
git ls-files -- '*.ts' '*.tsx' | while read -r f; do
  [ -f "$f" ] || echo "MISSING ON DISK: $f"
done
```

On the fixed branch: **232 tracked `.ts`/`.tsx`, 0 missing.** Before the fix this printed the two
seed files — i.e. it reproduces the bug class in one line, not just this instance. No new tooling
was added for it; CI is now the standing guard.

## 4. The fix — four files, no `src/` change

The working tree was already in the desired end state. The entire fix lived in the index.

| File | Action | Why |
| --- | --- | --- |
| `prisma/seed.ts` | delete (198 ln) | the file CI fails on |
| `prisma/seed-results.ts` | delete (191 ln) | dead half of the same pair; no `account` write, so not itself a type error |
| `prisma/demo-user-seed.ts` | **add** (584 ln) | the replacement — already sets `issuer: "local:credential"` |
| `prisma.config.ts` | commit the pending edit | its `seed:` at HEAD still named `prisma/seed.ts` |

**`prisma.config.ts` is not optional.** Deleting the seed without it trades a typecheck failure for
a `prisma db seed` that points at a file which no longer exists — quieter, not better.

`package.json` needed no change: `db:seed` / `db:seed:pro` have pointed at `demo-user-seed.ts`
since 2026-08-31. That is the other half of the same gap — **the scripts named a file that was in
no clone but one.** A fresh `git clone` can now seed for the first time.

### Rejected alternatives

- **Patch `seed.ts` only** (add the missing field) — resurrects a deliberately deleted file, keeps
  two dead seeds on `main`, and leaves `db:seed` naming an untracked file. Fixes the symptom.
- **Commit the deletions, leave the replacement untracked** — CI green, but `db:seed` then names a
  file that exists nowhere in the repo. The gap widens.

## 5. Found while verifying: a credential already in git history

`prisma/demo-user-seed.ts` hardcoded the demo account password as a literal, and so did the
`prisma/seed.ts` this fix deletes.

> ⚠ **Correct the intuition here, because the first reading was wrong.** The obvious assumption is
> that the string lives only in gitignored `.env.development` and that committing the new seed
> would introduce it. It would not have — **the same literal has been on `origin/main` since
> 2026-08-03**, at `prisma/seed.ts:31`, added by `babee92`. A `git grep` run against a tree that
> already has `seed.ts` staged for deletion cannot see it, which is exactly how the first check
> came back clean. **Grep history (`git log -S`), not just the tree, before concluding a secret is
> not in a repo.**

So this commit **ends** a four-week exposure rather than preventing a new one:

| | Before | After |
| --- | --- | --- |
| Literal in the working tree | yes (`demo-user-seed.ts`) | no |
| Literal in the committed tree | yes (`seed.ts`, since 2026-08-03) | **no** |
| Literal in git *history* | yes | **yes — unchanged** |

**Consequences that follow, and do not follow.**

- Removing it from the tree is still right, and merging still improves the repository.
- **Rotating the demo password is the actual remedy.** Deleting a secret from the tip does nothing
  about the four weeks of history behind it; only rotation invalidates what was exposed. Scrubbing
  history (`git filter-repo` / BFG + force-push) is the alternative and is far more disruptive on a
  pushed repo.
- **The Monday 03:17 UTC full-history gitleaks scan will flag `babee92`.** Push-range scans use
  `--first-parent` over new commits only, so they will stay green; the scheduled scan reads
  everything. Expect it, and resolve it by rotating rather than by allowlisting the string.
- Practical severity is low but not nil: `demo@electius.com` is a demo account on the Neon
  **development** branch, and the repository is private. It is still a working credential in a
  repository, and the fix for that is a new password.

`codebase-map.md` already documented the correct behaviour ("refuses to run without
`TEST_DEMO_PASSWORD` rather than falling back to a literal"). **The file had drifted from its own
documentation.** Restored:

```ts
// Lozinka iz .env.${NODE_ENV} (učitan gore); ugrađena bi završila u gitu.
const DEMO_PASSWORD = process.env.TEST_DEMO_PASSWORD;
if (!DEMO_PASSWORD) {
  throw new Error(
    "TEST_DEMO_PASSWORD nije postavljen — sjeme odbija raditi s ugrađenom lozinkom.",
  );
}
```

Zero runtime friction: line 9 already loads `.env.${NODE_ENV}` and the variable is already there.

### The guard is at module scope on purpose

`main()` wipes the demo organization — `vote`, `archive`, `election`, `user`, `organization`
`deleteMany` in one `$transaction`. A throw placed where `password` is *consumed* would destroy
data and **then** fail. At module scope the script refuses to start at all.

Proven rather than assumed, and proven safely — the variable was blanked **and** `DATABASE_URL`
pointed at an unreachable host, so a non-firing guard still could not have written anything:

```
Error: TEST_DEMO_PASSWORD nije postavljen — sjeme odbija raditi s ugrađenom lozinkom.
    at prisma/demo-user-seed.ts:43   exit 1
```

`main()`'s first two `console.log`s never printed. Placement re-confirmed structurally (column 0,
while `main()` is invoked at line 587) because the tsx/esbuild transform produces a misleading
stack frame name here.

## 6. Flagged, not fixed: `dotenv` is a phantom dependency

Imported by both `prisma.config.ts` and `prisma/demo-user-seed.ts`, declared in neither
`dependencies` nor `devDependencies`. It resolves only because `@dotenvx/dotenvx` and `c12` —
Prisma's own dependencies — hoist it to the top-level `node_modules`.

It works on a fresh clone today (`npm ci` reproduces the lockfile), which is why this fix's
"a clean clone can seed" goal holds without touching it. But a Prisma dependency-tree change
breaks `prisma.config.ts` *and* `db:seed` with no warning.

Different class from this fix — **present-but-undeclared, not absent** — so it was recorded rather
than folded into the diff. One line plus a lockfile change whenever it is wanted.

## 7. Verification

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errors (8 pre-existing `window.location.assign` warnings, none in touched files) |
| `npm run test` | **730 passing / 41 files** — unchanged, as predicted; no `src/` edit |
| `npm run build` | exit 0, 47/47 static pages |
| Staged scope | exactly 4 paths; unrelated working-tree WIP untouched |

**The committed tree was verified, not the working tree** — the whole point:

- `git write-tree` → `git ls-tree` on the would-be commit: `prisma/` contains only
  `demo-user-seed.ts` + `schema.prisma`; both old seeds are **0 hits**.
- Index/disk parity: 232 tracked, 0 missing (§3).
- The credential is absent from the written tree (`git grep` against the tree object).
- CI runs `npx prisma generate` **before** lint and typecheck, so the newly-tracked file's
  `src/generated/prisma/client` import resolves there — the one way this fix could itself have
  broken CI.

**Not verified.** `npm run db:seed` was deliberately not executed: it wipes and rebuilds the demo
organization, and the dev branch holds a fixture baseline. gitleaks is not installed locally, so
"would have tripped `secret-scan`" is a prediction, not a measurement — the credential is removed
either way.

## 8. Carry-forward

- **A green local `tsc` is not evidence the commit compiles.** If `git status` shows a ` D` on a
  `.ts` file, CI is still compiling it. Run the §3 parity check, or just read `git status` as part
  of the gate.
- **The generalized rule:** any local tool that reads the working tree can disagree with CI
  whenever the index and the disk differ. Deletions are the asymmetric case — extra untracked
  files fail *safe* (local sees more), uncommitted deletions fail *unsafe* (local sees less).
- **A file's documentation can be true when written and false later.** `codebase-map.md` described
  the env-var behaviour that §5 had to restore. Treat map claims about a file as a hypothesis to
  check, not a fact — as `CLAUDE.md` already says of recalled memory.
- **To ask "is this secret in the repo", grep history, not the tree.** `git grep <s> <tree>` answers
  a different and much narrower question, and answers it "no" the moment the offending file is
  staged for deletion. Use `git log -S <s> --all` (§5). Same shape as the parity trap in §3: the
  index, the disk and the history are three different things, and a check that reads one of them
  says nothing about the other two.
- ⚠ **Push a branch before merging it.** `ci.yml` scans only the pushed range with
  `--first-parent`, so a locally-merged `--no-ff` branch is **never secret-scanned** unless the
  branch itself was pushed first. This project's entire history merges without pushing the branch;
  this fix is the first to follow the new rule. The Monday 03:17 UTC full-history scan is the
  backstop, not the plan.
