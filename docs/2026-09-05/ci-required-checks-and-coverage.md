# CI Required Checks — coverage reporting, CodeQL, and two rules that blocked every PR

**Describes:** the work shipped by `chore/ci-required-checks-and-coverage` as **v0.9.59**, merged via **PR #5** (`a25a5c8`).
This document lands separately, in its own pull request, because it was written after that merge — the same shape as `docs/2026-09-04/ci-cd-pr-pipeline.md`.
**Builds on:** `docs/2026-09-04/ci-cd-pr-pipeline.md` (the PR flow) and `docs/2026-08-30/ci-cd-pipeline.md` (the four original gates)
**Date:** 2026-09-05 · **Application behaviour change:** none. Two workflow files, one vitest config block, one npm script.

> The PR pipeline made the gates binding. Then two rules were added to the `main` ruleset —
> minimum code coverage and CodeQL scanning — with nothing in the repository reporting to
> either. A required check that no workflow produces never becomes green, so both rules
> blocked every pull request. This supplies the two missing producers.

---

## 1. The gap

The `main` ruleset (`enforcement: active`) carries six rules. Two of them name a *tool* rather than
a workflow job:

| Rule | Expects | Existed on 2026-09-05 |
| --- | --- | --- |
| `code_coverage` | a coverage report, minimum 80% | nothing produced one |
| `code_scanning` | CodeQL, `errors` / `high_or_higher` | no CodeQL workflow |

This is a failure mode worth naming, because it does not look like one. A required status check
with no producer is not reported as failing — it is reported as **missing**, and a pull request
with a missing required check simply never becomes mergeable. There is no red X to click into and
no log to read. The repository looked healthy and merges were impossible.

The fix is not to relax the rules. It is to supply what they are asking for.

---

## 2. What shipped

### 2.1 Coverage — scoped to what this repo actually tests

`vitest.config.ts` gained a v8 coverage block. The scope is the load-bearing decision:

```ts
include: ["src/actions/**/*.ts", "src/lib/**/*.ts"],
```

Invariant #8 says tests cover `src/actions/` and `src/lib/` **only** — no component tests, because
the browser and Playwright own that surface. A whole-`src` percentage would therefore be measuring
components that deliberately have no tests, and the number would say nothing about whether the
tested code is tested well. Measured under this scope: **82.23% lines**, comfortably above the
ruleset's 80% floor.

**The exclude list replaces Vitest's defaults, it does not extend them.** That was the second
commit on the branch and it is the subtle one. Written as `["**/*.test.ts"]` the list drops
Vitest's own defaults, which quietly readmits `.spec.ts`, `.bench.ts` and `__tests__/` into the
denominator. Nothing matches any of those today — the convention is colocated `*.test.ts` — and
the measured number is unchanged. But a test file entering the denominator pushes the percentage
**up**, so the gate would get *easier* at the exact moment someone deviated from the convention.
The list now covers all three conventions:

```ts
exclude: ["**/*.{test,spec,bench}.ts", "**/__tests__/**", "**/*.d.ts"],
```

`cobertura` is in the reporter list because it is the only format `actions/upload-code-coverage`
accepts. `text` and `text-summary` stay so a local run still prints something a human reads.

### 2.2 The `quality` job uploads the report

`npm run test` became `npm run test:coverage` in the job — the same 758 tests across 42 files,
plus the report. The job gained one permission, `code-quality: write`, which is the only scope the
upload needs and the only job that has it.

### 2.3 `codeql.yml` — advanced setup, deliberately

GitHub's default CodeQL setup is a UI toggle. Its PUT endpoint refuses this account's token
(code-scanning writes need the `security_events` scope), and every other gate this repo has
already lives in `.github/workflows` where a reviewer can see it in the diff. So CodeQL is a
workflow file like everything else.

It analyses two languages:

- `javascript-typescript` — the application.
- `actions` — the workflows in this directory, which interpolate `${{ }}` into shell. That is
  precisely the injection class the `actions` queries exist to catch, and this repository now has
  three workflow files doing it.

`build-mode: none` because neither language compiles, which also means no database environment is
needed. `fail-fast: false` so a failure analysing one language still reports the other.

---

## 3. The fork guard, and the run log that settled it

This is the part worth reading, because the branch argued both sides.

The upload step needs a condition — `ci.yml` fires on bare `push` *and* `pull_request`, so a
branch with an open PR produces two complete runs (visible in PR #5's check rollup: two `quality`,
two `secret-scan`, two `dependency-audit`). Without an `if`, the same report uploads twice.

The first condition keyed on the event name. It was then **replaced** by one keyed on the head
repository:

```yaml
if: github.event.pull_request.head.repo.full_name == github.repository || github.ref == 'refs/heads/main'
```

The reasoning was sound on its face: `github.event_name == 'pull_request'` also matches a **fork**
PR, forks receive a read-only token, so the upload would fail there and a soft failure in our own
CI reads like our bug.

The reasoning was also unnecessary, and the run log proves it. GitHub Actions prints the body of a
composite action's shell step verbatim in its `##[group]Run` block, and
`actions/upload-code-coverage@v1` carries this:

```bash
if [ "nstefan55/electius-app" != "" ] && \
   [ "nstefan55/electius-app" != "$GITHUB_REPOSITORY" ]; then
  echo "::notice::Skipping coverage upload for fork PR (from nstefan55/electius-app)"
  exit 0
fi
```

The literal is the interpolated `head.repo.full_name`. On a fork PR it would not equal
`$GITHUB_REPOSITORY`, and the action **exits 0** — a clean skip with a notice, not a failure. The
workflow-level guard was duplicating a guard the action already performs.

So the condition went back to the simpler form, with the comment now stating what is true:

```yaml
# PRs and main only: ci.yml fires on bare push AND pull_request, so a branch with an open
# PR would otherwise upload the same report twice. Forks need no clause here — the action
# skips them itself (verified in the run log: "Skipping coverage upload for fork PR").
if: github.event_name == 'pull_request' || github.ref == 'refs/heads/main'
```

The two conditions are behaviourally identical for this repository, which has no forks. They
differ on exactly one input — a fork PR — where the old one skipped the step and the new one runs
it and lets the action no-op. The reason to prefer the new one is not behaviour, it is that the
old one's comment asserted the upload would *fail* on a fork, and the log shows it does not. A
wrong comment on a CI gate is how a future reader re-adds a redundant guard.

**Transferable:** the `##[group]Run` block prints what a composite action actually executes.
Reading it settles questions about action behaviour that reasoning from documentation cannot.

---

## 4. Known open items

**The coverage upload currently returns HTTP 404.** This is expected and is why the step ships
with `fail-on-error: false`:

```
##[error]Coverage upload failed: Coverage upload failed (HTTP 404): Not Found.
```

There is nowhere to upload to until **Settings → Security → Code quality → "Code coverage
analysis"** is switched on for the repository. A gate must not go red over a toggle nobody has
flipped, so the failure is soft. **Flip `fail-on-error: true` once the first report lands** — until
then the `code_coverage` ruleset rule has a producer that cannot deliver, and the 82.23% is
measured locally and in the job log but never recorded against a commit. This is owner console
work; the application cannot detect it, the same silent-no-op class as the Upstash, R2 and Resend
variables.

**`@action-validator/cli` reports `ci.yml` invalid.** It is a false positive, and it pre-dates this
branch:

```
"detail": "Additional property 'code-quality' is not allowed"
```

The validator's bundled schema predates GitHub's `code-quality` permission scope. The job runs and
succeeds on GitHub. `codeql.yml` validates clean. Do not "fix" this by removing the permission —
the upload needs it.

---

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 7 warnings (all pre-existing `window.location.assign`, none in these files) |
| `npm run typecheck` | clean, exit 0 |
| `npm run test:coverage` | **758 passed** across **42 files** |
| Coverage | Lines **82.23%** · Statements 81.7% · Branches 81.59% · Functions 79.66% |
| `@action-validator` `codeql.yml` | exit 0 |
| `@action-validator` `ci.yml` | exit 1 — pre-existing false positive, §4 |
| CI on PR #5 | `quality`, `migration-presence`, `secret-scan`, `dependency-audit`, `pr-hygiene` all green; both CodeQL analyses green |

Confirmed on the live runs rather than assumed: the upload step ran **once** per PR, in the
`pull_request` run only. The `push` run contained zero `upload coverage report` step lines, which
is the condition doing its job.

One measurement caveat worth carrying forward: `npx @action-validator/cli ... | tail` reports
`tail`'s exit status, not the validator's, so a failing validation reads as a pass. Capture the
output into a variable and read `$?` immediately.

---

## 6. The ruleset as it now stands

All six rules on `main` have a producer, and PR #5 was the first merge to satisfy every one:

| Rule | Producer |
| --- | --- |
| `required_status_checks` — `quality`, `migration-presence`, `secret-scan`, `dependency-audit`, `pr-hygiene` | `ci.yml` |
| `code_scanning` — CodeQL | `codeql.yml` |
| `code_coverage` — min 80% | `ci.yml` upload step (soft until the setting is enabled, §4) |
| `pull_request` — 0 approvals, merge commits only, thread resolution required | the flow itself |
| `deletion` · `non_fast_forward` | GitHub |

`required_approving_review_count` is **0**, which is correct for a single-maintainer repository:
GitHub does not permit self-approval, so any non-zero value with no bypass actor makes `main`
permanently unmergeable. `allowed_merge_methods` is `["merge"]` alone, matching the `--no-ff`
convention every dev doc in this directory cites by SHA.
