# Dashboard Phase 3 — Main Content Area

Phase 3 (final phase) of the dashboard UI: the main content area that fills the shell built in phases 1–2. Everything is **static** and reads `src/lib/mock-data.ts` directly until the database lands.

## Scope

- **Page header** — "Dashboard" title + organization name, with a `+ New election` button.
- **Summary stat cards** — active elections, total voters, avg. turnout %, archived.
- **Live hero** — featured active election with live turnout.
- **Recent elections** — list sorted Active > Scheduled > Closed > Draft (Archived excluded).
- **Pinned sidebar/top bar** — only the content area scrolls (changed in `dashboard-shell.tsx` + `sidebar-nav.tsx`).

## Components

The page is composition-only; each section is a self-contained server component.

| Component | File | Role |
| --------- | ---- | ---- |
| `DashboardPage` | `src/app/[locale]/dashboard/page.tsx` | Stacks the four sections in a `flex-col` |
| `DashboardHeader` | `src/components/dashboard/dashboard-header.tsx` | Title + org name + `New election` button |
| `StatCards` | `src/components/dashboard/stat-cards.tsx` | The 4 summary cards (from `dashboardStats`) |
| `LiveHero` | `src/components/dashboard/live-hero.tsx` | Featured live-voting card; renders `null` if no election is active |
| `RecentElections` | `src/components/dashboard/recent-elections.tsx` | Sorted list; also exports `recentElections()` |

**Data shaping.** The "non-archived, sorted Active > Scheduled > Closed > Draft" rule lives once, as the exported `recentElections()` in `recent-elections.tsx`. `LiveHero` imports it and picks the active election with the most ballots cast. The trivial helpers (turnout %, number formatting) are inlined per component rather than shared — duplicating a one-liner beats a module everyone imports. When the DB lands, `recentElections()` becomes a Prisma query.

## Status colors

The design-system spec (`context/design-system-spec.md`) is the source of truth and **conflicts with the prototype** — the prototype had scheduled=blue / draft=amber; the spec says scheduled=orange / draft=blue. The spec wins. Canonical hues come from the `--color-status-*` tokens already in `globals.css`:

| Status | Badge (tint + text) | Dot / bar hue |
| ------ | ------------------- | ------------- |
| Active | `success-50` / `success-700` | `status-active` (#10b981) |
| Scheduled | `warning-50` / `warning-700` | `status-scheduled` (#f59e0b) |
| Closed | `error-50` / `error-700` | `status-closed` (#ef4444) |
| Draft | `brand-50` / `brand-700` | `status-draft` (#3b82f6) |
| Archived | `neutral-100` / `neutral-600` | `status-archived` (#6b7280) |

The map (`STATUS_STYLES`) lives in `recent-elections.tsx`.

## Scroll behavior (pinned chrome)

The sidebar and top bar stay pinned while the content scrolls. The scroll boundary is pushed as deep as possible so both the desktop aside and the mobile `Sheet` drawer behave identically:

- **`dashboard-shell.tsx`** — root container is `h-screen overflow-hidden` (no page-level scroll); the top bar is `shrink-0`; the content area is the lone scroll container (`flex-1 overflow-y-auto`) with an inner `max-w-content` wrapper so the scrollbar sits at the window edge. The mobile `Sheet` gets `gap-0 overflow-hidden` (its default `gap-4` was overflowing the drawer and causing a scroll).
- **`sidebar-nav.tsx`** — the `<nav>` is `flex-1 overflow-y-auto min-h-0`. Logo (top) and account block (bottom, `mt-auto`) stay pinned; only the nav links scroll, and only when the viewport is too short to fit them. This is the shared piece, so it fixes desktop and mobile at once.

## Responsiveness

- **Stat cards** — `grid-cols-1 → sm:grid-cols-2 → xl:grid-cols-4`.
- **Live hero** — `flex-col` on mobile (sections stack), `sm:flex-row` on desktop. The turnout block (big %, label, button) is a horizontal row on mobile and a right-aligned column on `sm:`; the number scales `text-5xl → sm:text-[56px]`.
- **Recent elections** — desktop is a 4-column grid (`Election / Status / Turnout / Voting window`) with a column header; on mobile the header hides and each row stacks to a single column.

## i18n

All copy is in the `dashboard.page` namespace of `messages/{hr,en}.json`. The recent-elections count uses an ICU plural (Croatian one/few/other). No hardcoded UI strings. Browser locale auto-detection is now off (`routing.ts` `localeDetection: false`), so the root serves Croatian regardless of `Accept-Language`; `/en` is reached only by explicit navigation.

## Out of scope (deferred)

Carried over from the prototype but **not** part of Phase 3 (no DB yet): three-dot row menus (rename / duplicate / archive / delete), the create/delete modals, inline rename, toasts, and the live-polling animation. The `New election`, `View live results`, and `View all` actions are placeholders (`New election` / `View live results` are no-ops marked with `ponytail:` comments; `View all` links to `/elections`) until the wizard (`/elections/new`), results (`/results/[id]`), and elections pages exist.

## Charts (follow-up — `feature/dashboard-phase-3-chart`)

`DashboardCharts` (`src/components/dashboard/dashboard-charts.tsx`) sits below the recent-elections list — a client component (recharts needs the DOM) using the shadcn `chart` + `card` primitives (`recharts@3`). Two charts in a `grid-cols-1 lg:grid-cols-2` (side by side on desktop, stacked on mobile):

- **A — Turnout by election** — horizontal bar, one bar per **non-archived** election, colored by status. Long names truncate on the axis; the tooltip shows the full name.
- **B — Elections by status** — donut over **all** elections (includes archived, so the grey slice appears), with a wrapping legend.

The two use different datasets on purpose: A is the actionable "what's open now" view (matches the list above it); B is the whole-portfolio overview. A shared `ChartConfig` maps each status to its `--color-status-*` hue + i18n label (`dashboard.page.charts` + `dashboard.page.status`), so colors stay consistent with the list and badges.

**Mobile:** the donut stays circular (`aspect-square`); the legend is `flex-wrap` so labels wrap to 2–3 rows instead of clipping "Archived".

## Verification

`npm run build` — passes (TypeScript clean). Route `/[locale]/dashboard` server-renders; `/hr` and `/en` prerender.
