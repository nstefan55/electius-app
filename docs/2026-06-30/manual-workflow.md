# Manual Feature Workflow

Step-by-step process for every feature/fix, with the exact git commands. Based on
`context/ai-interaction.md`. Run all commands from the project root (`electious-app/`).

## Rules

- **Don't commit until `npm run build` passes** and the change works.
- One feature/fix per branch and per commit.
- Conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, …). No "Generated with Claude".
- Branch naming: `feature/<name>` or `fix/<name>`.
- Database: **never** `prisma db push` — always create migrations.

---

## 1. Document

Describe the feature in `context/current-feature.md` (set **Status: In Progress**) and,
if it has a spec, add it under `context/features/<feature>.md`.

## 2. Branch

```bash
git checkout main
git pull origin main                     # start from latest
git checkout -b feature/<name>
```

## 3. Implement

Write the code. Keep changes minimal and matched to existing patterns.

## 4. Test

```bash
npm run build                            # must pass before committing
```

Fix any errors and re-run until green. Verify the change in the browser (`npm run dev`).

## 5. Iterate

Repeat steps 3–4 until the feature works and the build is clean.

## 6. Commit

Only after the build passes — and ask before committing.

```bash
git status                               # review what changed
git add <files>                          # stage intentionally (avoid unrelated edits)
git commit -m "feat: <concise description>"
```

## 7. Merge to main

```bash
git checkout main
git merge --no-ff feature/<name> -m "Merge branch 'feature/<name>': <summary>"
git push origin main
```

## 8. Delete the branch

```bash
git branch -d feature/<name>             # local
git push origin --delete feature/<name>  # remote (only if it was pushed)
```

## 9. Review

Review the code: security (auth checks, input validation), performance (N+1 queries,
re-renders), edge cases, and pattern consistency. Optionally run `/security-review`.

## 10. Mark complete

In `context/current-feature.md`: set **Status: Completed** and add a dated entry to the
**History** section.

## 11. Document

Write a developer-facing doc in `documentation/<feature>.md` (kebab-case), then commit
the doc + history update:

```bash
git add context/current-feature.md documentation/<feature>.md
git commit -m "docs: mark <feature> complete and add developer guide"
git push origin main
```

---

## Quick reference

```bash
# branch
git checkout main && git pull origin main && git checkout -b feature/<name>

# … implement, then: npm run build

# commit + merge + push + cleanup
git add <files> && git commit -m "feat: <description>"
git checkout main
git merge --no-ff feature/<name> -m "Merge branch 'feature/<name>': <summary>"
git push origin main
git branch -d feature/<name>
```
