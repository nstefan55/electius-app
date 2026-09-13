# zod jitless — silencing the CSP eval violation

**Branch:** `fix/zod-jitless` · **Version:** 0.9.74 · **Date:** 2026-09-13
**Closes:** `mvp-launch.md` §9, the prerequisite §4/D9 names by number.

---

## What was wrong

Every production page that builds a zod schema in the browser logged one console error:

```
Content-Security-Policy: The page's settings blocked a JavaScript eval (script-src)
from being executed because it violates the following directive:
"script-src 'self' 'unsafe-inline'" (Missing 'unsafe-eval')
```

zod v4 decides whether it can use its faster JIT validator by **constructing a function at
runtime** — the `Function` constructor with an empty body — the first time it builds an object
schema. Our production CSP carries no `'unsafe-eval'`, so the browser reports a
`securitypolicyviolation` *before* zod catches and swallows the throw. zod then falls back to its
interpreted validator: **validation was never broken.** Only the console was dirty.

That is why it sat open. It becomes a real problem the day **D9 (error tracking)** ships: a
reporter listening to the console turns one cosmetic line into a steady stream of reports from
every signed-out visitor. Hence the ordering in §4 — this first, D9 second.

## The fix

One shared module, `src/lib/zod.ts`:

```ts
import { z } from "zod";

if (typeof window !== "undefined") z.config({ jitless: true });

export { z };
```

Everything that reaches the browser imports `z` from there instead of from `"zod"`:

| Imports from | Files |
| --- | --- |
| `@/lib/zod` | the 7 client components that build schemas, plus `src/lib/wizard-csv.ts` — no `"use client"`, but the wizard runs it in the browser |
| raw `"zod"` | `src/actions/**` and `src/app/api/**` — server-only, no CSP, and they keep the faster JIT path |

`jitless` is zod's own escape hatch for exactly this case. From `zod/v4/core/util.cjs:216`:

> *Skip the probe under `jitless`: strict CSPs report the caught `new Function` as a*
> *`securitypolicyviolation` even though the throw is swallowed.*

## Two things the next reader will get wrong

### 1. The shared module is about ORDERING, not sharing

`mvp-launch.md` §9 justified the rewrite by saying zod's config is *"global per module instance"*.
**It is not** — `zod/v4/core/core.cjs:142` parks it on `globalThis`:

```js
(_a = globalThis).__zod_globalConfig ??= {};
exports.globalConfig = globalThis.__zod_globalConfig;
```

So one call anywhere would reach every module instance. The reason the shared module still earns
its place is different and sharper: **`allowsEval` is memoised** (`cached()`) and read when a schema
is **built**, not when it is parsed —

```js
const jit = !core.globalConfig.jitless;
const fastEnabled = jit && allowsEval.value;   // short-circuits: jitless ⇒ no probe
```

— so the config has to land before the **first** `z.object()` call in the browser. Re-exporting `z`
makes that true by construction: you cannot obtain `z` from this module without having run the
config. A bare side-effect `import "@/lib/zod-config"` would leave it to chunk evaluation order,
and a side-effect import in a *server* component never reaches the browser at all.

### 2. The `typeof window` guard is not a micro-optimisation

Because the flag lives on `globalThis`, setting it while a client component is **server-side
rendered** would disable JIT for every server action in that Node process, for the life of the
process. The guard is what keeps the blast radius in the browser, where the CSP actually is.

## ⚠ Never fix this by widening the CSP

Adding `'unsafe-eval'` to `script-src` would silence the same message and re-open runtime code
evaluation on an application whose ballot pages are public. `zod-jitless.test.ts` fails if
`'unsafe-eval'` ever escapes the `isDev` branch in `next.config.ts`.

## Why there is a test

The regression is **silent in every direction**: swapping one import back to `"zod"` is the same
type, compiles, passes lint, breaks no other test — and **cannot be seen in dev at all**, because
the development CSP deliberately allows `'unsafe-eval'`. It shows up only in a production build,
in the console.

`src/lib/zod-jitless.test.ts` is the fourth contract test in the repo with no source module of its
own (after `better-auth-schema`, `static-route-boundaries`, `locale-cookie`). Six cases:

- the file list is **derived from the filesystem**, so a new client component falls under the rule
  without anyone editing the test
- raw `"zod"` appears only in the shared module and the two server trees
- the shared module still guards and still configures
- `'unsafe-eval'` stays behind `isDev`
- two **runtime** cases: the text tests prove the *shape*, these prove zod still *reads* the option —
  if a future zod renamed `jitless`, every text assertion would still pass

Mutation-checked 4/4, each caught by a named test, with a green control run before and after.

## How it was verified

Unit tests can only see the shape of the fix, so the proof is a before/after pair on the **same
production build** of `/hr/login`, differing by one import line:

| `import { z } from …` | `/hr/login` console |
| --- | --- |
| `"zod"` | ⛔ `CSP: blocked a JavaScript eval (script-src) … (Missing 'unsafe-eval')` |
| `"@/lib/zod"` | clean |

Also checked clean: `/hr/signup`, `/hr/forgot-password`, `/hr/reset-password`. Across the whole
session there was exactly **one** eval violation — the one deliberately reintroduced. A
`_vercel/insights/script.js` 404 appears on every page and is unrelated: that endpoint only exists
when deployed to Vercel.

Gates: `tsc --noEmit` 0 errors · `lint` 0 errors (7 pre-existing `window.location.assign` warnings)
· **834 tests / 47 files** · `next build` clean, with all six static prerenders and the
`/results/[id]` ISR route still present in `prerender-manifest.json`.

## Reproducing the check yourself

⚠ **A local production run reads `.env.production`, which points at the PRODUCTION database.**
Shell variables win over the `.env` file, so override them:

```bash
export DATABASE_URL='<dev branch URL>'   # ep-restless-cell-…, not ep-calm-butterfly-…
export DIRECT_URL='<dev branch URL>'
npm run build && npm start
# dashboard-host routes need the host header; browsers resolve *.localhost
#   http://dashboard.localhost:3000/hr/login
```

`npm run dev` will **not** reproduce the violation — the dev CSP allows `'unsafe-eval'` on purpose
(`next.config.ts`, the `isDev` branch).

## Cost

Browser-side object parsing loses zod's fastpass. zod's own comment puts the generated parser at
~13% faster than the interpreted one on object schemas; the schemas here are login forms and CSV
rows, so the difference is not observable. The server keeps the fast path.

## Adding a new client component that validates

Import `z` from `@/lib/zod`, never from `"zod"`. If you forget, `zod-jitless.test.ts` fails with
the offending path — that failure is the reminder, not a bug in the test.
