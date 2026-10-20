# Maintenance loop (CI): weekly dependency upkeep

`.github/workflows/agentic-maintenance.yml` runs you on a schedule, or when a maintainer
dispatches it. The workflow has already run `npm ci` and written its findings to
`JOB/audit.json` (from `npm audit --omit=dev --json`) and `JOB/outdated.json` (from
`npm outdated --json`). It only starts you when at least one of them reports something. The
prompt gives you `JOB`, `BRANCH` and `RUN_URL`.

Read `.github/agentic/project.md` first. Every rule in it applies to you.

## What you may change

- **Security advisories.** Apply what `npm audit fix --omit=dev` resolves, **never** with
  `--force`. If an advisory needs a major bump or `--force`, don't change it; list it in the PR
  body under **Not verified**, as needing a human.
- **Outdated packages.** Raise **direct** dependencies to the latest **patch or minor** within
  their current major, using `npm install <pkg>@<version>`.
  - Never cross a major.
  - Never touch `next`, `react`, `react-dom`, `prisma`, `@prisma/*` or `better-auth` beyond a
    patch. Those move only with a human.
- **No source changes.** If an update breaks lint, typecheck or tests, revert that package and
  list it as needing a human. Don't adapt the code.

## Steps

1. Run `git checkout -b "$BRANCH" origin/main`.
2. Apply the changes above one group at a time: audit fixes first, then minor and patch updates.
   After each group, run `npm run lint && npm run typecheck && npm run test`. Revert any group that
   fails, and note why.
3. **If nothing is left changed,** write `JOB/summary.md` saying so and finish. There is no
   branch and no PR.
4. Bump the version with `npm version patch --no-git-tag-version`.
5. Commit `package.json` and `package-lock.json` as `chore: weekly dependency maintenance`.
6. Run `git push -u origin "$BRANCH"`.
7. Open the PR:
   `gh pr create --base main --head "$BRANCH" --title "chore: weekly dependency maintenance" --body-file JOB/pr-body.md --label agent-built --label dependencies --label needs-human`.
   - Fill the body from `.github/pull_request_template.md`.
   - **What:** a table of package / from / to / why (advisory id or "minor update").
   - **Verified:** the commands and their results.
   - **Not verified:** everything left for a human, plus "Vercel preview build".
   - A dependency change always needs a human, which is why the PR carries `needs-human`.
8. Write `JOB/summary.md`: what changed, what was reverted, and the PR link.

Never edit anything except `package.json` and `package-lock.json`, and never push to `main`.
