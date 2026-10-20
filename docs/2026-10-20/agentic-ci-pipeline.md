# Agentic CI/CD pipeline: the agent loop in GitHub Actions

**Branch:** `claude/wonderful-ride-d1vsj0` · **Version:** 0.9.89 · **Date:** 2026-10-20
**Settings:** `.github/agentic/project.md` · **Builds on:** `docs/2026-09-04/ci-cd-pr-pipeline.md`
**Application behaviour change:** none. Four workflow files (three new, one rewritten), three
instruction files, eight agent files now tracked, and two ignore rules.

> The September pipeline put Claude reviewers *next to* the deterministic gates. This puts the whole
> agent loop into CI. An issue can become a reviewed pull request; a red CI run on that PR can
> repair itself twice; dependencies get a weekly PR. Nothing in it can merge. `ci.yml` is still the
> gate, and a human still clicks merge, because merging deploys.

---

## 1. The four loops

| Workflow | Trigger | What it does | Writes code? |
| --- | --- | --- | --- |
| `agentic-build.yml` | an `agent:feat`, `agent:fix` or `agent:chore` label on an issue written by an owner, member or collaborator | spec → decide → build → four review lenses → approve → PR labelled `agent-built` | yes, on a `feat/`, `fix/` or `chore/` branch |
| `agentic-autofix.yml` | `ci.yml` fails on the `pull_request` run of an `agent-built` PR | the builder reads the failing logs, fixes, pushes; at most 2 attempts | yes, the same branch |
| `agentic-maintenance.yml` | Mondays 04:29 UTC, or dispatched | in-range dependency updates and non-forcing audit fixes, then a `chore/deps-<date>` PR labelled `needs-human` | `package.json` and the lockfile only |
| `claude-review.yml` | PR opened, ready or reopened, or pushes while labelled `claude-review` | four lenses in parallel jobs, one verdict comment, inline findings | no |

The loop is the one in the local `/feature-workflow` skill, which was itself reverse-engineered from
the zazencodes Software Factory and merged with this project's workflow. The CI version swaps the
worktree for the runner's checkout, the dev server for "not verified, see the Vercel preview", and
the local Decide prompt for an issue comment.

### Decisions in CI

When the spec has open questions, the build loop does not guess. It posts them on the issue, swaps
`agent:<kind>` for `needs-decision`, and stops. You answer in a comment that starts with
`Decisions:`, then re-apply the label. The next run reads your comment (only owner, member and
collaborator comments reach the agent), records the answers as D1, D2… and builds.

### ESCALATE in CI

Locally, ESCALATE stops before a PR exists. In CI it opens the PR as a **draft** labelled
`needs-human`, with the approver's reasons in the body. On this project the escalation list
(auth, money, voting integrity, schema, email, infra, dependencies, legal) covers a lot of the
app, so expect most feature PRs to arrive as drafts. That is intended.

## 2. Models

| Agent | Chain | How the chain is applied |
| --- | --- | --- |
| security lens | **fable → opus → sonnet** | three conditional steps in the lens job (`continue-on-error`, the next one runs only if the previous failed) |
| spec writer, builder, approver | opus → sonnet | the orchestrator passes `model` when it spawns them, and retries on unavailability |
| loop orchestrators | opus, `--fallback-model sonnet` | `claude_args` |
| code, ux, ui lenses, doc writer | sonnet | `claude_args` and the spawn |

The lens summary records which model each lens actually ran on.

## 3. Why the agents' pushes run CI

The action exchanges its OIDC token for the **Claude GitHub App** token and exports it as
`GH_TOKEN` (`claude-code-action` `src/entrypoints/run.ts`, `src/github/token.ts`). Both
`git push` and `gh pr create` inside Claude use it. App-token events trigger workflows, and
`GITHUB_TOKEN` events do not. So `ci.yml`, `claude-review.yml` and Vercel all run on an agent's
PR exactly as on yours.

The same App has **no `workflows` permission** (`claude-code-action` `docs/faq.md`). An agent
cannot change CI even if it were told to.

## 4. Guards (the repository is public)

- **Who can start it.** The build loop runs only for issues **written** by an owner, member or
  collaborator. An outsider's text never reaches a write-capable agent. Copy it into your own
  issue if you want it built. The action also re-checks the actor's write access.
- **Comment filtering.** Only owner, member and collaborator comments are copied into
  `request.md`. Everything the agent reads from GitHub arrives through a file or `env:`, never
  interpolated into a script.
- **Autofix scope.** Same-repository branches only, the three prefixes only, `agent-built` PRs
  only, and only while the branch is still at the failing commit. `allowed_bots: claude` is needed
  because the upstream run was started by `claude[bot]`.
- **Inline autofix prompt.** `workflow_run` runs the default-branch copy of the workflow, so its
  prompt lives inline there. A file on the PR branch could be edited by the very agent it
  instructs.
- **Read-only reviewers.** The lenses have no Edit and only read-only git commands in Bash. Their
  one Write lands in `.agentic/`, which is gitignored and uploaded as an artifact.
- **Still binding:** `ci.yml`, including `pr-hygiene`. Agents bump the version and stay out of
  forbidden paths, or their PR goes red like anyone else's.

## 5. What CI cannot do

- **No database:** a schema change can't be built in CI. The builder reports BLOCKED, and you
  build it locally with `/feature-workflow`.
- **No `next build`, no browser:** the Vercel preview is the build check, and page-level
  acceptance criteria are listed under *Not verified* in the PR.
- **No `context/`, `CLAUDE.md` or `.claude/skills/`:** `.github/agentic/project.md` names the
  tracked stand-ins. `pr-reviewer.md` inlines the invariants, and `ui-reviewer.md` and
  `auth-auditor.md` hold the UI and auth rules.

## 6. Manual steps, none of which the app can check

1. **Secret.** `CLAUDE_CODE_OAUTH_TOKEN` already exists for the September reviewers. Nothing new.
2. **Labels.** `agent:feat`, `agent:fix`, `agent:chore`, `needs-decision`, `agent-built`,
   `needs-human`, `autofix-1`, `autofix-2`, `dependencies`, and `claude-review` if September's
   setup did not create it. `/cicd-pipeline labels` creates whichever are missing.
3. **Required checks.** Keep every agentic job **out** of the `main` ruleset's required checks.
4. **First lens run.** This PR changes `claude-review.yml`, so the action skips the lenses here
   (the workflow must match the default branch). The first lens review is the next PR after the
   merge.

## 7. Verification

| Check | Result |
| --- | --- |
| `@action-validator/cli` on the four workflows | pass |
| `actionlint` 1.7.12 with shellcheck | pass, 0 findings |
| Branch-slug, autofix-gate, verdict-table and scan logic, dry-run on sample data | as designed; the dry run caught an empty-scan → "something to do" bug, now fixed |
| `.gitignore`: `fw-*` agents tracked, `.agentic/` and `context/jobs/` ignored, other local agents still ignored | `git check-ignore -v` confirms each |

**Not verified:** a live run of any loop. That needs these files on `main`, the labels, and an
issue to build. The first runs to watch: label a small UI issue `agent:feat`; open a human PR to
see the lens summary; let an agent PR fail a lint to see autofix.
