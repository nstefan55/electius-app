# Dependency audit findings — 2026-10-12

Branch `fix/dependancy-audit-findings`, v0.9.87. No application code changed.

## What failed

The weekly scheduled CI run on `main` (2026-10-12) failed the **production** audit gate
(`npm audit --omit=dev --audit-level=high`) on two new high advisories:

| Package | Advisory | Fixed in |
| --- | --- | --- |
| `sharp` (optional dependency of `next`) | GHSA-wq5f-xc86-pv6w — librsvg CVE-2026-96889 | 0.35.5 |
| `source-map-js` | GHSA-68fv-2mgg-jv7q — event-loop DoS via indexed source-map offsets | 1.2.2 |

Both had a non-breaking fix (`npm audit fix`, no `--force`). The lockfile update carries them;
`shadcn` 4.21.1 → 4.21.4 and `eslint-config-next` 16.3.8 → 16.4.0 came with it (both dev-only).

## What was left out, and why

- **No `@shadcn/registry` in `dependencies`, no `overrides.braces`.** Both were tried locally and left
  out. `@shadcn/registry` is only a transitive dependency of the shadcn CLI, and listing it in production
  pulls `fast-glob` → `braces` into the production tree (GHSA-vfj7-8cjw-p6xm), failing the gate. A
  `braces` override is a no-op: 3.0.3 is the newest release and is itself the vulnerable version.
- **The non-blocking full-audit step in `ci.yml` is removed.** It audited dev tooling with
  `continue-on-error`, so it never blocked a merge but drew a failed step on every run. The production
  gate is unchanged.

## Trade-off

A high advisory in a devDependency no longer appears in CI at all. Run a full `npm audit` locally to
see dev tooling. `braces` will keep appearing there until upstream publishes a fix — never resolve it
with `npm audit fix --force`, which installs shadcn 1.0.0 (no `shadcn/tailwind.css`, so `globals.css`
breaks) and downgrades `eslint-config-next` to 14.x.

## Verified

Production audit 0 vulnerabilities · lint 0 errors · typecheck clean · 915/915 tests · `next build`
clean against the development database, all 8 static prerenders and the `/results/[id]` ISR route intact.
