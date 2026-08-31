# npm audit: closing the dependency-audit gate

Fix branch: `fix/npm-audit-vulnerabilities` · patch bump **0.9.34 → 0.9.35**

## Summary

`npm audit` reported 13 vulnerabilities (8 high, 5 moderate) at the start of this session, all
resolved without `npm audit fix --force`. `.github/workflows/ci.yml`'s `dependency-audit` job drops
the `continue-on-error: true` scaffolding it carried since the 2026-08-30 CI pipeline launch — its
own comment named this the trigger to remove it.

## What was actually going on

The working tree already carried a large **uncommitted** dependency bump — `next`, `react`,
`better-auth`, `zod`, `resend`, `stripe`, `typescript`, `eslint`, and others, all moved to their
current npm `latest`. This matches the CI job's own tracked "chore/dependency-updates" item and was
mostly correct and coherent.

One package broke it: **`prisma`'s npm `latest` dist-tag currently points at `8.0.0-rc.12`** — Prisma
is mid-rollout of v8 and has (unusually) tagged the release candidate as `latest` on the registry.
Whatever bumped these dependencies followed `latest` blindly and picked up the RC for the `prisma` CLI
package, while `@prisma/client` and `@prisma/adapter-neon` correctly stayed on stable `7.10.0` (their
`latest` tags still point at stable — only the `prisma` package's does not).

That mismatch was already invalid — `better-auth` peer-requires `prisma@^5||^6||^7`, not `^8` — and it
pulled in Prisma 8's new `@prisma/composer-cli` → `alchemy` → `@prisma/dev@0.20.0` tooling chain,
which is what actually carried the vulnerable `hono`, `lodash`, and `valibot`. None of this exists on
the last **committed** `package.json`, which pins `prisma@^7.8.0` throughout with no composer-cli
chain at all — this was entirely self-inflicted by the pending bump, not a pre-existing product risk.

A second, unrelated advisory (`deepmerge-ts <8.0.0`, high) was real and pre-existing: `@prisma/config`
(the CLI's config loader, used only by `prisma generate`/`migrate`/`studio` — never shipped in the
Next.js runtime bundle) pins `deepmerge-ts@7.1.5` exactly, and that version has a known stack-exhaustion
bug. `deepmerge-ts` has exactly one consumer in the whole dependency graph (`@prisma/config`), so
overriding it is safe and self-verifying: if the override broke Prisma's config loader, `prisma
generate` would fail immediately.

## The fix

1. **`package.json` `dependencies.prisma`**: `^8.0.0-rc.12` → `^7.10.0` — matches `@prisma/client`
   and `@prisma/adapter-neon`, satisfies `better-auth`'s peer range, and drops the entire
   composer-cli/alchemy/hono/lodash chain.
2. **`package.json` `overrides`** (new field): `{ "deepmerge-ts": "^8.0.2" }` — forces the one
   vulnerable transitive dependency up to its patched major. No other package in the tree depends on
   `deepmerge-ts`, so this cannot affect anything else.
3. `npm install` (not `--force`) to regenerate `package-lock.json` against both corrections.

Result: `npm audit` → **0 vulnerabilities**.

## Two more breaks the correction surfaced, not caused

Fixing the `prisma` pin dropped the vulnerability count from 13 to 3 (the `deepmerge-ts` chain,
resolved above). Verifying the rest of the pending bump against the real toolchain (not just
`tsc --noEmit`, which stayed green throughout) surfaced two more incompatibilities already present in
the uncommitted WIP, unrelated to the audit:

- **`typescript: ^7.0.2` breaks `typescript-eslint`.** `typescript-eslint`'s own compatibility guard
  refuses to run on TypeScript ≥7.0 (their tracking issue confirms support isn't shipped). `tsc
  --noEmit` itself was fine — only the ESLint integration rejected it. Pinned back to `^6.0.3`, the
  last version the peer-dependency warning itself pointed at.
- **`eslint: ^10.9.1` breaks `eslint-config-next`'s bundled `eslint-plugin-react`.** Next's own latest
  `eslint-config-next@16.3.3` bundles `eslint-plugin-react@7.37.5`, whose published peer range caps
  at `eslint@^9.7` — confirmed against the npm registry, no newer `eslint-plugin-react` exists yet.
  Running ESLint 10 anyway throws `contextOrFilename.getFilename is not a function` from inside the
  plugin's own React-version detection. Pinned back to `^9.39.5`, the last ESLint 9 release.

Both are upstream tooling not having caught up yet, not application bugs — confirmed by `tsc --noEmit`
staying clean and `npm run build`'s own internal TypeScript pass succeeding throughout. Both fixes are
version-pin corrections only; no application code changed.

## Verification

- `npm audit` — 0 vulnerabilities (was 13: 8 high, 5 moderate)
- `npx prisma generate` — succeeds (proves the `deepmerge-ts` override doesn't break Prisma's config
  loader)
- `npm run lint` — 0 errors, 8 pre-existing warnings (all `window.location.assign`/`.href` deliberate
  hard-navigation patterns flagged by a rule newly bundled in `eslint-config-next@16.3.3`; exit 0)
- `npx tsc --noEmit` — clean
- `npm run test` — **696/696** passing, 39 files (unchanged from the last recorded count)
- `npm run build` — clean, all 47 routes resolve

## Not touched

The rest of the pending dependency bump (next, react, better-auth, zod, stripe, resend, recharts,
tailwind, etc.) was left exactly as found — none of it is implicated in the audit findings, and all
of it verified green through the same lint/typecheck/test/build pass. No application source files
were edited.

## CI

`.github/workflows/ci.yml`'s `dependency-audit` job: removed the `continue-on-error: true` step and
its companion warning-annotation step (both existed only to keep the job green while this was
outstanding, per the job's own comment). It now runs `npm audit --audit-level=high` as a normal,
failing step.
