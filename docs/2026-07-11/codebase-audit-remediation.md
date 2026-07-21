# Codebase-Audit Remediation — Org-Ownership + Server-Only

Fix branch that closed the three High-severity findings and one Medium finding from
the 2026-07-11 codebase audit. **No real auth was wired** — the mock-backed
`requireSession()` seam stays; the change reshapes the seam so that swapping to real
BetterAuth later is a body swap, not a signature swap.

- **Trigger:** 2026-07-11 audit report (findings #1, #2, #3, #5)
- **Branch:** `fix/org-ownership-server-only` → merged to `main` (2026-07-11, `527df17`)
- **Scope:** 15 source files, +168 / −67 lines

---

## What the audit flagged

| # | Severity | Problem |
|---|----------|---------|
| 1 | High | Server actions had no org-ownership check — any authed user could rename / duplicate / archive / delete another org's election by ID |
| 2 | High | `getDashboardData()` was unbounded — no `where: { organizationId }`, no `take` cap; cross-org data leak the moment multi-tenancy is real |
| 3 | High | `mock-data.ts` (real dev email) was imported directly by client components (`sidebar-nav.tsx`, `dashboard-header.tsx`), shipping PII to every browser |
| 5 | Medium | `force-dynamic` marker on four pages was redundant — the session seam should drive dynamic rendering instead |

---

## The single seam: `requireSession()`

Every fix threads through `src/lib/auth/require-session.ts`. Before, it was an async
no-op returning the mock user. After, it's the **single source of truth** for who the
caller is, which org they belong to, and (indirectly) whether the render is dynamic.

```ts
// src/lib/auth/require-session.ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/mock-data";

export interface Session {
  user: { name: string; email: string; organization: string; isPro: boolean };
  organizationId: string;
}

export const requireSession = cache(async (): Promise<Session> => {
  await cookies();                                    // (A) marks all callers dynamic
  const admin = await prisma.user.findUnique({        // (B) resolves the mock org id
    where: { email: currentUser.email },
    select: { organizationId: true },
  });
  if (!admin?.organizationId) {
    throw new Error("Mock admin has no organization — run `npx prisma db seed`");
  }
  return { user: { ... }, organizationId: admin.organizationId };
});
```

**Three things this does at once:**

1. **`(A) await cookies()`** — Reading a dynamic API forces every caller to be
   server-rendered on demand. That's what replaced per-page `export const dynamic = "force-dynamic"`
   on the four admin pages. Real BetterAuth will read cookies anyway (for the session
   token) so this is future-consistent, not a placeholder.
2. **`(B) DB lookup by mock email`** — cuids aren't stable across seeds, so the mock
   org id can't be hardcoded. `React.cache()` memoises the lookup per request, so the
   dashboard/list/detail routes still cost exactly one org lookup per request.
3. **New return shape `{ user, organizationId }`** — every consumer destructures
   `organizationId` and threads it into DB calls / mutations. Swapping in real auth
   changes only the body of this function.

---

## Data-layer changes (`src/lib/db/elections.ts`)

Every admin query now takes an `organizationId` and scopes with it. `getElectionDetail`
switched from `findUnique({ id })` to `findFirst({ id, organizationId })` so a cross-org
`id` returns `null` — the layout then renders `notFound()`, matching the "never expose
'exists but forbidden'" rule.

| Function | Before | After |
|----------|--------|-------|
| `getDashboardData()` | `findMany({ orderBy })` | `getDashboardData(orgId)` → `findMany({ where: { organizationId } })` |
| `getElectionsByStatus(status?)` | `findMany({ where: status })` | `getElectionsByStatus(orgId, status?)` → adds `organizationId` to `where` |
| `getElectionDetail(id)` | `findUnique({ id })` | `getElectionDetail(id, orgId)` → `findFirst({ id, organizationId })` |
| `getElectionTurnout(id)` | `findUnique({ id })` | `getElectionTurnout(id, orgId)` → `findFirst({ id, organizationId })` |
| `getPublicResultsElection(id)` | *(unchanged)* | *(unchanged — public route, no session)* |

### `cache()` still works

`getElectionDetail` stays `cache()`-wrapped. React de-dupes by argument value, so
`(id, orgId)` from the layout + facet page (same request → same session → same orgId)
still resolves to **one** DB round trip.

### `take` cap deliberately skipped

The audit suggested `take: 100` as a defensive ceiling. Not added — org-scoping already
bounds the query, and a silent cap would drop rows the moment an org grows past it.
Real pagination is scoped to the future elections-list spec.

---

## Server-action ownership guards (`src/actions/elections.ts`)

Each mutation now calls `requireSession()` first, then verifies the target election
belongs to the session's org before running. A shared helper avoids repeating the
check three times:

```ts
async function assertOwned(id: string, organizationId: string): Promise<boolean> {
  const owned = await prisma.election.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  return owned !== null;
}
```

Rename / archive / delete use it directly. `duplicateElection` folds the check into
its existing `findFirst({ id, organizationId })` — it needs the source row anyway, so
a second query would be waste.

**Failure mode:** cross-org call returns `{ success: false, error: "forbidden" }`.
The client already surfaces that as a generic error toast — no UI change needed.

`fetchTurnout()` in `src/actions/dashboard.ts` got the same treatment: it derives
`organizationId` from the session before delegating.

---

## PII removed from the client bundle

Fixed at the seam, not with a marker. Before, `sidebar-nav.tsx` and
`dashboard-header.tsx` imported `currentUser` directly from `mock-data.ts` — so the
dev email landed in the browser bundle for anyone to grep. Two changes:

**1. `(app)/layout.tsx` projects the shell user explicitly:**

```tsx
export default async function AppLayout({ children }) {
  const { user } = await requireSession();
  // TypeScript doesn't strip runtime fields — the projection is defensive against
  // a widened ShellUser later leaking email/isPro into the RSC payload.
  const shellUser = { name: user.name, organization: user.organization };
  return <DashboardShell user={shellUser}>{children}</DashboardShell>;
}
```

**2. Client components accept props, no lateral imports:**

- `DashboardShell` gained a `user: ShellUser` prop and forwards it.
- `SidebarNav` receives `user`, computes `initials` inside the function body (was
  module-level — couldn't react to session changes).
- `DashboardHeader` receives `organization: string` (narrowest surface).

Both client files' `import { currentUser } from "@/lib/mock-data"` were removed. The
only place that still imports `mock-data` is `require-session.ts` (server-only) and
`prisma/seed.ts` (Node-only).

### Why `mock-data.ts` did NOT get `import "server-only"`

`prisma/seed.ts` runs under `tsx` in raw Node — no `react-server` export condition.
`server-only`'s default export throws in that context, so adding it would break seeding.
The fix relies on **no client component reaching the file**, not on a runtime marker.
The comment at the top of `mock-data.ts` documents this trade-off.

---

## `force-dynamic` — removed from four pages

Deleted from:

- `src/app/[locale]/(app)/dashboard/page.tsx`
- `src/app/[locale]/(app)/results/page.tsx`
- `src/app/[locale]/(app)/archive/page.tsx`
- `src/app/[locale]/(app)/voters/page.tsx`

The `await cookies()` inside `requireSession()` marks every caller as dynamic
automatically. Build output confirms: all admin routes now show `ƒ` (dynamic,
server-rendered on demand). Before the cookies read, Next 16 was prerendering
`/hr/dashboard` at build time with the seeded DB baked in — the `●` static-prerender
state is gone.

---

## Verified

- `npm run build` passes (TypeScript included, 25 pages).
- Runtime smoke test on dev server: `/hr/dashboard`, `/hr/results`, `/hr/archive`,
  `/hr/voters` all 200 on the dashboard host.
- **PII closure:** `grep <dev-email> .next/static/` empty. RSC-payload `"email"`
  grep empty (confirms the `(app)/layout.tsx` projection strips the field).

---

## Migration notes for future work

- **When wiring real BetterAuth**, replace the body of `requireSession()`. The
  return shape `{ user, organizationId }` is already the shape callers expect.
- **Widening `ShellUser`** in `dashboard-shell.tsx` will silently reintroduce the
  PII leak — the projection in `(app)/layout.tsx` is defensive by convention, not
  compiler-enforced. If you widen it, verify the RSC payload afterwards.
- **New DB queries in `lib/db/elections.ts`** should take `organizationId` as their
  first non-id parameter. `getPublicResultsElection` is the only exception (public
  route, no session).
- **New server-action mutations** should call `requireSession()` and either
  `assertOwned()` or fold the org check into their `findFirst`.

## Out of scope (still open)

Audit findings #4, #6–14 (Medium/Low) remain untouched:

- Duplicate `ElectionStatus` type in `mock-data.ts` + `elections-view.ts` + Prisma
- `live-hero` immediate-poll gap + `sortRecent` recomputation per render
- Weighted-turnout vs mean-of-percentages in `computeStats`
- `/voters` fetches every status (DRAFT/SCHEDULED/ACTIVE is the actionable set)
- Hardcoded `"en-US"` locale in `live-hero.tsx`
- Stray `TODO` comments in `dashboard-shell.tsx` and `archive-list.tsx`
- Hardcoded "Electious" brand string in `sidebar-nav.tsx`

These are safe to bundle into a follow-up cleanup branch.

## Related

- `context/current-feature.md` — history entry for this fix
- `documentation/2026-07-11/next-intl-locale-config.md` — same-day change (locale prefixes)
- `documentation/2026-07-09/routing-structure-phase-2.md` — where `requireSession()` was first introduced as a no-op seam
- `context/domain-architecture-spec.md` §5 (decision B) — the "single auth choke point" convention this fix hardens
