# Dashboard UI Phase 4 — Election Row Management

The interactive management layer on the dashboard's recent-elections list,
carried over from the prototype but deferred in Phase 3 (which had no DB).
Adds per-row actions backed by **real Neon mutations**, inline rename, a
delete-confirm modal, toasts, and the live-polling turnout animation.
Spec: `context/features/dashboard-phase-4-spec.md`.

## What shipped

| Piece | Where |
| ----- | ----- |
| Server actions (rename / duplicate / archive / delete) | `src/actions/elections.ts` |
| Row three-dot menu, inline rename, delete modal, toasts, optimistic list | `src/components/dashboard/recent-elections.tsx` (now a client component) |
| Global `<Toaster>` (top-right) | `src/components/dashboard/dashboard-shell.tsx` |
| Live-polling turnout bar transition | `src/components/dashboard/live-hero.tsx` |
| i18n (`dashboard.page.actions`, hr + en) | `messages/{hr,en}.json` |
| DB verification script | `scripts/test-phase4.ts` |

## Decisions (from the spec + follow-up)

- **Real DB mutations.** Row actions call server actions (Prisma) and persist.
  The client updates optimistically for instant feedback, then `router.refresh()`
  re-runs the RSC so stat cards / charts / hero reflect the change. On failure a
  toast fires and `router.refresh()` pulls the authoritative rows back.
- **"New election" stays a no-op** until the creation wizard (`/elections/new`)
  exists — so the prototype's quick-create modal was **not** built (it would
  insert incomplete elections). Only the delete-confirm modal ships.
- **Toasts:** `react-hot-toast`. **Dropdown + modal:** the already-installed
  `@base-ui/react` primitives (`menu`, `alert-dialog`) — no new UI dependency.

## Server actions (`src/actions/elections.ts`)

All return `{ success, error? }`. No auth scoping yet (MVP) — that lands with
BetterAuth.

- `renameElection(id, title)` — `election.update`.
- `duplicateElection(id)` — creates a fresh **DRAFT** copy (`"… (Copy)"`) with
  the same config + vote options, **no** voters/votes.
- `archiveElection(id)` — sets `status = ARCHIVED`; the row drops off the
  dashboard (the recent list excludes archived).
- `deleteElection(id)` — **permanent.** `Vote` and `Archive` deliberately have
  no `onDelete` cascade (anonymity / integrity), so the transaction clears them
  first, then `election.delete` cascades voters → tokens and options:

  ```ts
  prisma.$transaction([
    prisma.archive.deleteMany({ where: { electionId: id } }),
    prisma.vote.deleteMany({ where: { electionId: id } }), // cascades vote_to_options
    prisma.election.delete({ where: { id } }),             // cascades voters, tokens, options
  ]);
  ```

## Client behaviour (`recent-elections.tsx`)

- Local `rows` state, seeded from props and re-synced on every props change
  (post-refresh), so optimistic edits show immediately and reconcile to the DB.
- Inline rename: menu → input in place. Enter commits, blur commits, **Escape
  cancels** (a ref guard skips the blur-triggered commit). Empty name → toast,
  stays editing. Unchanged name → no round trip.
- Three-dot menu: Base UI `Menu`. Delete opens a Base UI `AlertDialog`.
- The menu button is the last desktop grid cell; on mobile it's absolutely
  positioned top-right of the stacked row.

## Verification

- `npm run build` passes (TypeScript included).
- `npx tsx scripts/test-phase4.ts` — creates a fully-wired throwaway election
  (options, voter+token, vote+vote_to_option, archive), then exercises the
  duplicate and delete-transaction logic and asserts every dependent row is
  gone. Seed data is never touched.
- Page renders (HTTP 200) with row menus, the new grid track, and the hero
  animation, in the default `hr` locale.

## Deferred

- Auth scoping of the mutations (org ownership checks) — with BetterAuth.
- Wizard-based creation (`/elections/new`), results (`/results/[id]`) — the
  "New election" / "View results" placeholders wait on those.
