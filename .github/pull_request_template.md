<!--
Electius PR template. The first three boxes are checked by the `pr-hygiene` job in ci.yml, so an
unchecked one becomes a red X rather than a review comment. The rest are the reviewer's job and
yours. Specs live in context/, which is deliberately not in this repo — name the file, do not link.
-->

## What

<!-- One paragraph: what changes and why. Name the spec, e.g. context/features/<name>-spec.md. -->

## Decisions taken at `start`

<!-- The ones a reviewer must not re-litigate. Delete this section if there were none. -->

## Checklist

Gated by CI:

- [ ] version bumped on this branch with `npm version <patch|minor> --no-git-tag-version`
      (feature/ → minor, fix/ and chore/ → patch; package.json and package-lock.json move together)
- [ ] no `context/`, `.env*`, `.claude/agent-memory/`, `.claude/settings.local.json`,
      `.claude/skills/`, `CLAUDE.md` or `AGENTS.md` in the diff
- [ ] schema change carries its migration (`prisma migrate dev` — never `db push`)

Yours:

- [ ] `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` green locally
- [ ] new server action or `src/lib` utility carries a colocated `*.test.ts` (invariant #8)
- [ ] `context/codebase-map.md` updated for any file added, moved or deleted (local, gitignored)
- [ ] new env keys added to **both** `.env.development` and `.env.production` **and** to Vercel —
      the app cannot detect a missing one
- [ ] no hardcoded UI strings; both `messages/hr.json` and `messages/en.json` carry every new key
- [ ] dev doc under `docs/<date>/` written or planned

## Verified

<!-- What you actually ran or clicked. Commands and results, not intentions. -->

## Not verified

<!-- What needs a browser, real Stripe/Resend, or production. State it here rather than implying it
     was covered. A migration on this branch is NOT applied to production by merging — that is a
     deliberate, watched `prisma migrate deploy` (Gate 8). -->
