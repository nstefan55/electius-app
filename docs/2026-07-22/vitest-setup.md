# Vitest Setup — Unit Testing for Server Actions & Utilities

**Date:** 2026-07-22

## What

Vitest is the project's unit-test runner. Scope is deliberately narrow: **server actions (`src/actions/`) and utilities (`src/lib/`) only**. Components are not unit-tested — UI correctness is verified in the browser (Playwright + manual), per the project workflow.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run test` | Single run (CI / pre-commit check) |
| `npm run test:watch` | Watch mode during development |

## Configuration

One file, `vitest.config.ts`:

- **`environment: "node"`** — no jsdom, no DOM. Server actions and utilities run in Node, so tests do too.
- **`include: ["src/**/*.test.ts"]`** — `.test.ts` only (no `.test.tsx`), which structurally keeps component tests out.
- **`@/` alias** — mirrors the tsconfig path so imports look identical to app code.
- **`server-only` aliased to its no-op export** — modules like `src/lib/prisma.ts` and `src/lib/rate-limit.ts` start with `import "server-only"`, which throws when loaded outside a React Server Components bundler. Vitest resolves the package to `node_modules/server-only/empty.js` (the same file Next.js serves under its `react-server` condition), so these modules load in tests without weakening the runtime guard.

Tests are **colocated**: `src/lib/foo.ts` → `src/lib/foo.test.ts`. The build is unaffected — Next.js only bundles what pages import, and `npm run build` type-checks the test files for free (tsconfig includes `**/*.ts`).

## Patterns (with working examples in the repo)

### 1. Pure utilities — just call them

`src/lib/elections-view.test.ts`, `src/lib/rate-limit.test.ts`. No mocks needed. For time-dependent helpers (`retryAfterSeconds`), use `vi.useFakeTimers()` + `setSystemTime`.

### 2. Env-dependent modules — stub env, re-import

`src/lib/urls.test.ts`. `urls.ts` reads `NEXT_PUBLIC_*` into module-level consts **at import time**, so a static import would freeze whatever env the runner started with:

```ts
beforeEach(() => {
  vi.resetModules();                                  // drop the cached module
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dashboard.electius.com");
});
it("...", async () => {
  const { signInUrl } = await import("@/lib/urls");   // fresh evaluation
});
```

### 3. Server actions — mock the two seams

`src/actions/settings.test.ts`. Every server action has exactly two external dependencies: `requireSession()` (auth) and `prisma` (DB). Mock both with `vi.mock`, then assert on **what the action passed to them** — validation short-circuits, session scoping, error mapping:

```ts
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/require-session", () => ({ requireSession: vi.fn() }));
```

Key assertions this pattern makes cheap:

- **Validation rejects before auth/DB run** (`expect(requireSession).not.toHaveBeenCalled()`)
- **Writes are session-scoped** (`where: { email: session.user.email }` — the multi-tenant isolation guarantee)
- **DB errors map to the `{ success, error }` contract** without leaking internals (including typed Prisma errors — construct a real `Prisma.PrismaClientKnownRequestError` with `code: "P2002"` to exercise unique-collision branches)

Never hit the real database from a unit test. DB-touching verification stays in `scripts/test-db.ts`-style manual scripts against the dev branch.

## What is deliberately NOT set up

- **No component/UI testing** (no jsdom, no Testing Library) — out of scope by project decision.
- **No coverage tooling** — add `@vitest/coverage-v8` if/when a coverage gate is wanted.
- **No CI wiring** — `npm run test` slots into the pipeline when the CI/CD spec lands.

## Workflow change

`context/ai-interaction.md` step 4 now reads: write Vitest tests for server actions/utilities alongside the browser check, and run `npm run test` + `npm run build` before any commit. A new "Unit Testing (Vitest)" section documents the scope, colocation rule, and the two mocking patterns.
