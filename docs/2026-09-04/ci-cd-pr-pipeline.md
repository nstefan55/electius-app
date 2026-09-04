# CI/CD PR Pipeline — pull requests, branch rules, and subagent reviews in Actions

**Describes:** the work shipped by `feature/pr-pipeline` as **v0.9.56**, merged via **PR #2** (`5552953`).
This document lands separately, in its own docs-only pull request, because it was written after that merge.
**Spec:** `context/features/ci-cd-pr-pipeline.md` (design, 2026-09-04) · **Builds on:** `context/ci-cd-pipeline/electius-ci-cd-pipeline-spec.md` (2026-08-30) and `docs/2026-08-30/ci-cd-pipeline.md`
**Date:** 2026-09-04 · **Application behaviour change in v0.9.56:** none. Two workflow files, one ignore rule, three agent files.

> The August pipeline work shipped four gates that run on every push. This ships the half it
> deferred: the pull-request flow those gates were designed to gate, the branch rules that make
> them binding, and Claude subagents reviewing pull requests from inside GitHub Actions.

---

## 1. What existed before, and the gap

`.github/workflows/ci.yml` has run four jobs on every push since 2026-08-30: `quality` (lint,
typecheck, test), `migration-presence`, `secret-scan`, `dependency-audit`. It already declared a
`pull_request` trigger.

That trigger had fired once. Every other change to `main` in 105 merges arrived through a local
`git merge --no-ff` pushed straight to the branch. The consequence is easy to miss: the gates ran
*after* the merge existed, so they told a developer who had already merged whether the thing they
merged was sound. Nothing stood between a commit and `main`.

Three rules were also being kept by hand rather than by machine, each documented in
`context/ai-interaction.md` and each forgotten at least once across 55 versions:

1. every branch that lands bumps the version, with `package.json` and `package-lock.json` moving together;
2. `context/`, `.env*` and the private `.claude` paths never reach the repository;
3. a schema change carries its migration.

Only the third had a gate.

---

## 2. What shipped

### 2.1 `pr-hygiene` — a fifth job in `ci.yml`

Runs on `pull_request` only, because both checks need a base commit to compare against. It installs
nothing: `node` is preinstalled on the runner and neither check needs the project's dependencies, so
the job finishes in seconds.

**Check one, the version.** Reads `package.json` at the base SHA, compares it to the head, and fails
unless the head is strictly higher. It also fails when `package.json` and `package-lock.json`
disagree, which is what happens when someone edits the version by hand instead of running
`npm version <level> --no-git-tag-version`.

Comparison is `sort -V`, not string comparison. This matters more than it looks: `0.9.10` sorts
*below* `0.9.9` as a string, so a naive check would reject a correct bump at exactly the point the
patch counter rolls into double digits.

**Check two, forbidden paths.** Fails if the diff touches `context/`, any `.env*`,
`.claude/agent-memory/`, `.claude/settings.local.json`, `.claude/skills/`, `CLAUDE.md` or
`AGENTS.md`. The pattern is anchored, so `src/CLAUDE.md.ts` is not a false hit.

Both scripts read the base SHA through an `env:` block rather than interpolating it into the shell
directly. A commit SHA cannot contain shell metacharacters, so this is habit rather than necessity,
but it is the habit GitHub recommends and it costs one line.

### 2.2 `claude-review.yml` — the reviewers

Three jobs, all advisory:

| Job | Runs when | Posts |
| --- | --- | --- |
| `code-review` | every non-draft PR from this repo | a COMMENT review with inline findings |
| `ui-review` | the same, and only if the diff touches `src/components/`, `src/app/` or `messages/` | one summary comment |
| `mention` | `@claude` in a PR comment from a collaborator | answers in the thread |

`code-review` delegates to the `pr-reviewer` subagent, which decides for itself whether to pull in
`auth-auditor`. `ui-review` delegates to `ui-reviewer` in a new code-level mode (§2.4).

**These are never required status checks.** They are non-deterministic, they cost money, and they
fail when an API is down. Making them required would convert an advisory into a lock-out for the
only person who can merge. The gate is `ci.yml`; this is a conversation.

**They cannot change code, by permission rather than by promise.** The workflow grants
`contents: read`, and `Edit`, `Write` and `NotebookEdit` are explicitly disallowed in every job. A
reviewer that wants a fix describes it in a suggestion block.

### 2.3 Three agents are now tracked in git

`CLAUDE.md`, `AGENTS.md` and the whole of `context/` are deliberately absent from this repository.
A CI runner therefore checks out a tree with no project instructions and no invariants in it. The
agent files are the only place a reviewer running there can learn them, which is why
`.claude/agents/pr-reviewer.md` inlines the invariants and the known failure classes. Keep it
self-contained.

Only the three agents a workflow actually invokes are tracked. `coder.md` and `code-scanner.md`
stay local: no workflow calls them, and a tracked agent that nothing runs is a file that drifts
unread.

`.gitignore` gained an explicit allow-list, which turns the long-standing "never stage `.claude`"
habit into a rule the tool enforces:

```gitignore
.claude/*
!.claude/agents/
.claude/agents/*
!.claude/agents/pr-reviewer.md
!.claude/agents/auth-auditor.md
!.claude/agents/ui-reviewer.md
```

The four negation lines are not decoration. Git cannot re-include a file whose parent directory is
excluded, so `!.claude/agents/` has to precede `.claude/agents/*`. After this, `git add .claude`
stages exactly three files and can no longer sweep in agent memory, machine-local settings, or the
skills directory.

One related fix: `pr-reviewer.md` recorded its memory directory as an absolute Windows path. It is
now relative, so it resolves on a runner as well as on the machine it was written on.

### 2.4 A code-level mode for `ui-reviewer`

The existing agent drives Playwright against a running application. In CI nothing is running: admin
pages need a session and a database, and the ephemeral-database stage is post-1.0. Vercel previews
do not help either, because they are SSO-walled and have no `dashboard.` host, so the admin UI is
unreachable on one regardless.

So the agent gained a section for that case. It reviews the changed files against rules this
codebase has already paid for once each: sizes in `rem` and never `px`, design tokens only,
`aria-hidden` on a drawn control but never `aria-disabled` on a row whose text is the explanation,
every visible string coming from both message catalogs, a native `<dialog>` needing `m-auto` because
Tailwind's preflight kills the margin that centres it, route boundaries inside the ISR tree not
importing `next/headers`. Browser-level review returns when the E2E stage exists and a server is
already up in the job.

---

## 3. The repository is public, and the design had assumed otherwise

The August spec recorded the repository as private, and several decisions rested on that. Reading it
live on 2026-09-04 showed `"private": false`. This cuts both ways.

**In your favour:** branch protection and rulesets are free for public repositories. The spec's
resigned position, that enforcement is a paid feature and should be treated as convenience rather
than as a control, does not apply here. The five checks can genuinely be required.

**Against:** anyone can fork the repository or comment on a pull request. Two guards follow, and
they are load-bearing:

- **Fork pull requests skip the reviewers.** GitHub deliberately withholds repository secrets from
  fork pull requests, so the Claude credential would be empty and the action step would fail on
  every one. A fork PR gets the deterministic gates, which need no secrets, and a human reader.
- **The `@claude` mention job answers only owner, member or collaborator.** Without that check, any
  passer-by could spend the repository owner's Claude subscription by typing two words in a comment.

---

## 4. Cost, and how it is bounded

A feature branch here is pushed many times before it merges. Reviewing every push is the obvious
way to make this expensive.

Reviews therefore run on `opened`, `reopened` and `ready_for_review`. On later pushes they run only
while the pull request carries the **`claude-review`** label. Re-review on demand means adding that
label or commenting `@claude`. Beyond that: `--max-turns` caps each run, `concurrency` cancels
superseded runs on the same PR, and `ui-review` skips its expensive step entirely when the diff
touches no UI files.

The reviewers are also told **not** to run `lint`, `typecheck`, `test` or `build`. The `quality` job
owns all four and is running on the same commit in parallel. A second install to reproduce a result
the PR already displays would cost about two minutes and a large share of the turn budget. The
prompt instead requires the reviewer to say plainly that it did not run them.

---

## 5. The new workflow for a human

Steps 6 to 8 of `context/ai-interaction.md` change shape. Previously: commit, merge locally with
`--no-ff`, delete the branch. Now:

```
git commit                     # as before, version already bumped on the branch
git push -u origin <branch>    # ci.yml runs the four gates on the push
gh pr create                   # ci.yml runs all five in PR context; the reviewers post
                               # read the checks, read the comments, fix locally, push again
gh pr merge --merge            # merge commit; the head branch is deleted automatically
```

`gh pr merge --auto --merge` also works and waits for green.

This has a side benefit the old flow could not give. The `secret-scan` job scans only the pushed
range along the first parent, so a branch merged locally and pushed as a single merge commit
contributed **zero** commits to it. Pushing the branch before merging was previously a procedural
rule that had to be remembered. Under a pull-request flow it happens by construction.

Repository settings that support this were already correct and needed no change: merge commits
allowed, squash and rebase disabled, auto-merge on, head branches deleted on merge. Merge commits
matter because 105 of them are the established shape of this history and the development docs cite
their SHAs, which is also why no linear-history rule is wanted.

---

## 6. Verification

Everything below was run locally before the branch was pushed.

| Check | Result |
| --- | --- |
| `pr-hygiene` mutation cases | 18 of 18, both gates |
| Workflow schema (`@action-validator/cli`) | both files pass |
| `.gitignore` allow-list, both directions | `git add .claude` stages exactly 3 files |
| `npm run lint` | 0 errors (7 pre-existing warnings, none in these files) |
| `npx tsc --noEmit` | clean |
| `npm run test` | 758 passing, 42 files |
| `npm run build` | clean |

The mutation harness runs byte-copies of the two shell scripts against synthetic inputs, so a check
that stops working fails a named case rather than passing silently. Two cases are worth naming
because each catches a bug that looks exactly like working code: `0.9.10 > 0.9.9`, and
`src/CLAUDE.md.ts` not matching the `CLAUDE.md` rule.

**Not verified.** Whether the action auto-discovers `.claude/agents/` from the checkout. Claude Code
does so locally, but the action's documentation does not state it, so both prompts carry a fallback
instructing the model to read the agent file directly if the subagent is unavailable. The fallback
needs only the `Read` tool, which is allow-listed. The check is whether the first run's log contains
an Agent tool call; if it does not, the fallback carried the review and the prompts should be
simplified to the read-the-file form.

---

## 6a. The first run, on PR #2

The pipeline's own pull request was the first to go through it. Every deterministic job behaved:

| Check | Result | Notes |
| --- | --- | --- |
| `pr-hygiene` | pass, 4s | on the PR run; correctly **skipped** on the push run, being PR-only |
| `quality` | pass, 1m1s | |
| `migration-presence` | pass, 5s | |
| `secret-scan` | pass, 6s | 757 added lines of YAML and agent markdown, no false positives |
| `dependency-audit` | pass, 27s | |
| `ui-review` | pass, 4s | computed `0 UI file(s) changed` and skipped its expensive step, as designed |
| `mention` | skipped | correct, this was not a comment event |

### The one thing it could not prove, and why

`code-review` reported success in 15 seconds without reviewing anything. The action skipped itself:

> Skipping action due to workflow validation: the workflow file must exist and have identical
> content to the version on the repository's default branch. [...] Action skipped due to workflow
> validation error. This is expected when adding Claude Code workflows to new repositories or on
> PRs with workflow changes. **If you're seeing this, your workflow will begin working once you
> merge your PR.**

This is a deliberate security property of the action, not a misconfiguration. Authenticating through
OIDC to Anthropic's GitHub App requires the workflow on the pull request to match the one on the
default branch. Without that rule, anyone opening a pull request could add a workflow that
immediately runs with the App's token.

The consequence is a chicken-and-egg that cannot be engineered around: **the reviewers cannot review
the pull request that introduces them.** The first review happens on the next pull request opened
after this one merges. That is also when the open question from §6 gets its answer, since the run
log will show either an Agent tool call or the read-the-file fallback carrying the review.

### An unrelated failure this run identified

`Prisma Compute Deploy`, owned by a **Prisma** GitHub App, fails on this commit and has been failing
on others. Its error is the guard in `prisma.config.ts` doing its job:

```
Database schema setup failed: prisma migrate deploy exited with code 1
injected env (0) from .env.development
Error: DIRECT_URL nije postavljen, pa migracija nema na što se spojiti.
```

It is worth stating plainly, because it was initially attributed to the CI workflow: **no YAML in
this repository runs `prisma migrate deploy`.** The string appears once, as the `db:migrate:deploy`
script in `package.json`, which nothing calls. `ci.yml` runs only `prisma generate`, which needs no
database URL and passes the guard.

The failing step belongs to a Prisma Compute integration connected to the repository. It runs its
own schema setup against an environment that has no `DIRECT_URL`, and `.env.development` is
gitignored, so it loads nothing there. This application's database is Neon, reached through the
pooled URL at runtime and the direct URL for migrations, so that integration is migrating something
it should not. Resolve it in the Prisma console by disconnecting the integration. Setting
`DIRECT_URL` there would also silence it, at the cost of re-creating exactly the unattended
per-push migration that both this pipeline and Gate 8 exist to prevent.

---

## 7. Manual steps, none of which the application can verify

1. A repository secret named `CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token`. It rides a Claude
   subscription rather than a metered API bill, and it belongs to a person, so rotate it if that
   person changes. Without it the review jobs fail.
2. The `claude-review` label.
3. Repository settings: merge commits only, auto-delete head branches, allow auto-merge.
4. **Optional, and now genuinely available:** a ruleset on `main` requiring the five checks. If you
   create one, `required_approving_review_count` must be **0**. GitHub does not let anyone approve
   their own pull request, so with a single maintainer and no bypass actor, a rule requiring one
   approval makes `main` permanently unmergeable.

---

## 8. What this does not cover

**Merging a pull request still deploys to production with nothing in between.** Vercel's Git
integration deploys `main` on push. The gate is the red or green check a human reads before
clicking merge, not an automated step that can refuse. The release workflow that adds one, with a
typed confirmation and a migration approval, is designed in the August spec §7.2 and is post-1.0.

Migrations remain a deliberate, watched `prisma migrate deploy` (Gate 8). Merging does not run one.

Browser-level UI review, end-to-end tests and the Merkle re-computation gate all wait on the
ephemeral-database stage, also designed and also post-1.0.
