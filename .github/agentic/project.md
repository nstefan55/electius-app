# Agentic CI settings · electius-app

The CI counterpart of the local `.claude/skills/feature-workflow/project.md`. The `fw-*` agents read
this file when they run inside GitHub Actions. Keep it self-contained: a CI runner checks out a tree
with **no** `CLAUDE.md`, **no** `context/` and **no** `.claude/skills/`. Those are local-only by
design, and `pr-hygiene` fails any PR that adds them.

This repository is **public**. Nothing in this file is secret, and nothing secret may ever be
added to it.

## Paths

| Key | Value |
| --- | --- |
| BASE | `main` |
| JOBS | `.agentic/<run-id>/` in the workspace (gitignored; uploaded as a workflow artifact) |
| WORKTREES | none: the workspace checkout is the worktree (`Repo` = `Worktree`) |
| PR_TEMPLATE | `.github/pull_request_template.md` |
| DEV_DOCS | `docs/<YYYY-MM-DD>/<slug>.md` |

**Project docs every agent reads.** These are tracked stand-ins for the local `context/` files:

- `.claude/agents/pr-reviewer.md`, "Phase 3 — Scan the diff": invariants #1–#8 and the known
  failure classes. These are hard rules.
- `.claude/agents/ui-reviewer.md`, "When no browser is available (CI)": the UI rules.
- `.claude/agents/auth-auditor.md`: the scope and checks for anything under AUTH_PATHS.
- `README.md`: what the app is.
- The neighbouring code. Without `context/coding-standards.md`, the code around the change *is*
  the standard.

Use the agent files as checklists only. Ignore their instructions about output format, pending
reviews or report files.

## Models

| Agent | Chain |
| --- | --- |
| `fw-reviewer-security` | `fable` → `opus` → `sonnet` |
| `fw-spec-writer`, `fw-builder`, `fw-approver`, loop orchestrators | `opus` → `sonnet` |
| `fw-reviewer-code`, `fw-reviewer-ux`, `fw-reviewer-ui`, `fw-doc-writer` | `sonnet` |

Move down a chain only when a model is unavailable, never because of a verdict.

## Setup and validation

- **SETUP** (the workflow has already run it): `npm ci` and `npx prisma generate`.
- **VALIDATION:** `npm run lint && npm run typecheck && npm run test`.
  - **No `npm run build` in CI.** It needs `NEXT_PUBLIC_*` values the runner doesn't have. Vercel
    builds every push and posts its own status, so the PR's Vercel check is the build gate.
- **There is no database in CI.** `prisma migrate dev` can't run, so **a schema change can't be
  built in CI**. Report BLOCKED and say "build locally with /feature-workflow".

## Dev server and browser

| Key | Value |
| --- | --- |
| BROWSER | `none`. There is no dev server and no browser in CI. Review UI at code level only, and list every page-level criterion under **Not verified**, to be checked on the Vercel preview. |
| SIGN_IN | none |

## Branches, commits, versions

- **Branch:** `feat/<slug>` · `fix/<slug>` · `chore/<slug>`. The build loop names it from the
  issue's label and title.
- **Commits:** conventional (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Stage explicit paths
  only, never `git add -A`. No attribution lines.
- **NEVER_STAGE:** `context/`, `.env*`, `.claude/` except `.claude/agents/`, `CLAUDE.md`,
  `AGENTS.md`, `workflow-spec.md`, `.agentic/`, `.github/workflows/`. The Claude GitHub App has no
  workflow permission, so a push that touches workflows is refused anyway.
- **VERSION_BUMP:** `npm version patch --no-git-tag-version`. The version is locked to 0.9.x
  until 1.0, so every agent branch takes a patch bump. `pr-hygiene` checks it.
- **Never:** push to `main`, force-push, rebase, merge a PR, approve a PR, run `prisma db push` or
  `migrate deploy`, or change repository settings or labels other than the ones named in a loop's
  instructions.
- **i18n:** every visible string goes in both `messages/hr.json` and `messages/en.json`.
- **Tests:** a new server action or `src/lib` utility gets a colocated `*.test.ts`. No component
  tests.
- **Env keys:** list every new key under "Manual steps before merge". The agent can't add it
  anywhere.

## Review scope

- **AUTH_PATHS:** `src/lib/auth/**`, `src/proxy.ts`, `**/require-session.ts`, `src/app/api/auth/**`,
  rate-limit rules, and anything that changes how `isPro`, `stripeSubscriptionId` or
  `organizationId` flows.
- **UI_PATHS** (the `ux` and `ui` lenses are skipped otherwise): `src/components/`, `src/app/`,
  `messages/`.

## Approver: always ESCALATE when the change

- touches AUTH_PATHS, sessions, rate limits or permissions;
- touches money: Stripe, entitlements, plans, pricing, `isPro` gating, or billing copy;
- touches voting integrity or anonymity: the `Vote` model, tokens, receipts, hashing, the archive
  seal, results derivation, or public results and verification;
- changes `prisma/schema.prisma` or adds a migration;
- adds or changes an email send, a Resend template alias, or the cron sweep;
- changes `next.config.ts` (headers, CSP), Sentry or Vercel config, or build scripts;
- adds a dependency or a new env key;
- changes legal pages or public claims about the business;
- rests on a spec Assumption that is really a product decision.

In CI, ESCALATE does not stop the PR. The PR opens as a **draft** labelled `needs-human`, with the
approver's reasons in its body.

## Labels

| Label | Meaning |
| --- | --- |
| `agent:feat`, `agent:fix`, `agent:chore` | a maintainer asks the build loop to build this issue |
| `needs-decision` | the loop stopped on open decisions; answer in a comment, then re-apply the `agent:*` label |
| `agent-built` | the PR was opened by a loop. The autofix loop acts only on these. |
| `needs-human` | a loop gave up or escalated |
| `autofix-1`, `autofix-2` | autofix attempts used on this PR (max 2) |
| `claude-review` | re-run the review lenses on every push |
