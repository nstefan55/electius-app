# Dependency audit, October 2026

**Branch:** `chore/vitest-mocker-advisories` · **Version:** 0.9.88 → 0.9.89 · **Date:** 2026-10-26

## Trigger

A plain `npm audit fix` on `main` left three moderate advisories. All three were one root
cause, `@vitest/mocker` below 4.1.12, and `npm audit fix` cannot resolve it: `@vitest/coverage-v8`
pins `vitest` with an **exact** peer (`"vitest": "4.1.12"`), so both have to move together and
the resolver gives up on the pair. Bumping the two declared ranges by hand is the fix.

The audit of the committed lockfile was worse than the three moderates suggested. Against the
`main` lockfile `npm audit` reports **15 advisories: 2 critical, 8 high, 5 moderate**. The
non-force `npm audit fix` had already resolved twelve of them inside the declared ranges; the
remaining three are the vitest pair above.

## What the committed `main` lockfile was exposed to

| Severity | Package | Advisory | Exposed here? |
| --- | --- | --- | --- |
| critical | `next` 16.3.8 | GHSA-2464-fhr4-w9xw RCE in Image Optimization with SVG | No. `dangerouslyAllowSVG` is unset (default off), SVGs are never optimized. |
| critical | `next` 16.3.8 | GHSA-673q-mjm6-r5xr RCE in `use cache` functions returning typed arrays | No. `cacheComponents` is off and `"use cache"` appears nowhere in `src/`. |
| high | `next` 16.3.8 | GHSA-p3m5-59mp-jv5r DoS in App Router Server Actions | Yes, in principle. Server Actions are live on the dashboard host. |
| critical | `@sentry/nextjs` 10.74 | GHSA-mchm-gjx6-7h55 middleware bypass via the tunnel route | **Yes.** `next.config.ts` sets `tunnelRoute: "/monitoring"`. Mitigated by design: `src/proxy.ts` only checks cookie presence, the real auth boundary is `requireSession()` in `(app)/layout.tsx` (invariant #4), so bypassing the proxy reaches no data. |
| high | `zod` 4.5.4 | GHSA-mrhx-c7xc-m3w5 memory exhaustion on oversized constrained collections | Partly. zod validates every action and API body; the vote and CSV paths take arrays. |
| high | `undici` ×3, `body-parser`, `vite` ×1 | DoS and launch-editor issues | Transitive / dev-only. |
| moderate | `@vitest/mocker` ×2 | GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp | No. Both live in the Vite **dev-server** WebSocket handlers registered by `mockerPlugin()`. This project runs `vitest run` in the node environment and never starts that server. |
| moderate/low | `fast-uri` ×4, `ip-address`, `vite` ×5 | parsing and dev-server issues | Transitive / dev-only. |

Verdict: nothing was exploitable for a vote or an admin session on the committed tree, but
production ran inside the range of two critical Next advisories and one critical Sentry advisory.
That is reason enough to ship this before anything else.

## What changed

`package.json`: `vitest` and `@vitest/coverage-v8` `^4.1.11` → `^4.1.12` (the floor must move,
or a fresh `npm ci` can resolve below the fix), plus the version bump. Nothing else in
`package.json`.

`package-lock.json`: 137 entries moved, all inside declared ranges. The ones that matter:

| Package | From | To |
| --- | --- | --- |
| `next` (+ `@next/*`) | 16.3.8 | 16.4.3 |
| `@sentry/nextjs` (+ `@sentry/*`) | 10.74.0 | 10.76.2 |
| `zod` | 4.5.4 | 4.6.7 |
| `vitest`, `@vitest/*` | 4.1.11 | 4.1.12 |
| `vite` (vitest's) | 8.2.2 | 8.3.5 |
| `puppeteer-core` / `chromium-bidi` | 25.9.0 / 17.0.2 | 25.16.0 / 157.0.8090-0 |
| `undici` | 7.30.0 | 7.30.1 |
| `shadcn` / `@shadcn/registry` | 4.21.4 / 0.1.3 | 4.22.1 / 0.2.0 |
| `body-parser`, `fast-uri`, `ip-address`, `webpack`, `postcss` | patch bumps | |

`npm audit` after: **0 vulnerabilities**, with and without `--omit=dev`.

Procedure that reproduces it from `main`: `npm install --save-dev vitest@4.1.12
@vitest/coverage-v8@4.1.12` then `npm audit fix` (never `--force`, see below).

## Verification

- `npm run typecheck` clean · `npm run lint` 0 errors (3 pre-existing `no-location-assign-relative-destination` warnings)
- `npm run test` **928 / 52 files**, which also exercises `zod-jitless.test.ts`'s runtime cases against zod 4.6.7
- `npm run build` clean on Next 16.4.3, run with `DATABASE_URL`/`DIRECT_URL` on the **development**
  branch and `SENTRY_AUTH_TOKEN=""` (a local production build otherwise reads `.env.production`).
  `prerender-manifest.json` unchanged: 8 static routes (`/hr`, `/en`, both `/privacy`,
  `/privacy/voters`, `/terms`) and `/[locale]/results/[id]` still ISR.

Not verified: a browser pass. No source file changed; the Next minor is covered by the build
and the test suite.

## Addendum 2026-10-29: `shadcn` removed (deepmerge)

A new advisory arrived on the same branch: GHSA-gcqx-w48m-w2h4 (CVE-2026-93753), prototype
poisoning in `deepmerge` `mergeObject()`, 3 lows via `shadcn` → `@shadcn/registry` → `deepmerge`.
`npm audit --omit=dev` was already 0, so CI was never red.

- **There is no patch.** `deepmerge` 4.3.1 (2023) is the newest release, and the advisory has
  `first_patched_version: null`. Every `shadcn` tag (latest 4.23.0, rc, beta, canary) and every
  `@shadcn/registry` tag still depends on `^4.3.1`. No drop-in fork matches the API shadcn calls
  (`deepmerge.all`, `{ arrayMerge }`), so an `overrides` entry is not an option.
- **The app never ran the vulnerable code.** The `deepmerge` calls sit in the CLI's `init`/`add`
  paths, which merge registry JSON. The app took exactly one thing from the package:
  `@import "shadcn/tailwind.css"` in `globals.css`. Nothing in `src` used any of that file's
  variants, utilities or keyframes, and `tw-animate-css` already supplies the accordion
  animations.
- **Fix: remove the dependency.** The import line was dropped and `shadcn` was uninstalled. The
  compiled `globals.css` was diffed before and after, through `@tailwindcss/postcss` directly:
  **0 lines added and 54 removed**. All 54 were the eight `@property --scroll-fade-*` /
  `--shimmer-*` registrations, their fallback defaults, and a reduced-motion override for a
  `.shimmer` class nothing renders. The full `npm audit` is now **0**, and the lockfile went from
  16 254 to 14 194 lines.
- **Adding components still works:** `npx shadcn@latest add …` downloads the CLI on demand and
  reads `components.json`, which stays. ⚠ If a future component uses shadcn's `data-open:`-style
  variants (which also match `data-state="open"`) or `scroll-fade`/`shimmer`, it needs that CSS
  back. Vendor the file into `src/app/` rather than re-adding the package. The CLI may also try
  to re-add the import or the dependency on `init`, so read its diff.
- The `ci.yml` audit comment had named "the shadcn CLI" and the `braces` advisory as its reasons.
  Both are gone (`braces` 3.0.3 is still installed via ESLint but no longer flagged), so the
  comment was trimmed.
- Gates: typecheck 0 · lint 0 errors (7 pre-existing warnings) · **928 / 52** · `next build`
  clean against the dev DB with `SENTRY_AUTH_TOKEN=""`; the 8 static prerenders and the
  `/results/[id]` ISR route are unchanged. One run of `stripe.test.ts` failed straight after the
  uninstall and passed on every rerun. This was a cold dynamic import after the `node_modules`
  change, not a regression.

## Two traps worth recording

1. **`git diff` in this repo is rewritten by the RTK hook** and prints every line indented, so a
   `grep '^[+-]'` over its output matches nothing and reads as "no changes". The first pass here
   concluded the user's lockfile diff changed zero versions and discarded it. Use
   `rtk proxy git diff` for raw output, or compare the two lockfiles' `packages` maps in Node.
2. **`npm audit fix --force` stays banned** (recorded 2026-10-05): it downgrades `shadcn` to 1.0.0,
   which has no `shadcn/tailwind.css` export, and `globals.css` breaks.

## Follow-ups

- Push and deploy. Production is on 16.3.8 until this lands. No migration rides along.
- `better-auth` did not move (1.7.2), so the BetterAuth-internals re-verification rule does not fire.
- The `vite` entry now sits at top level (hoisted out of `vitest/node_modules`); harmless, it is
  vitest's own dependency, nothing in the app imports Vite.
