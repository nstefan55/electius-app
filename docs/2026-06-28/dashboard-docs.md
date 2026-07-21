# Dashboard — Implementation Docs

Living documentation for the admin dashboard UI. Started with **Phase 1** (layout shell + shadcn setup).

## Status

| Phase | Scope | State |
| ----- | ----- | ----- |
| 1 | Layout shell, shadcn setup, `/dashboard` route, top bar | ✅ Done |
| 2 | Sidebar (collapsible + mobile drawer) + i18n — see [`dashboard-phase-2.md`](./dashboard-phase-2.md) | ✅ Done |
| 3 | (see `context/features/dashboard-phase-3-spec.md`) | ⏳ Not started |

> **Note (Phase 2):** the app tree moved under `src/app/[locale]/` for locale routing. Paths below are updated accordingly. See [`dashboard-phase-2.md`](./dashboard-phase-2.md) for the sidebar + i18n details.

## Routes

| Route | File | Purpose |
| ----- | ---- | ------- |
| `/dashboard` (`/en/dashboard`) | `src/app/[locale]/dashboard/page.tsx` | Main content area (placeholder until Phase 3) |
| — | `src/app/[locale]/dashboard/layout.tsx` | Renders the `DashboardShell` (sidebar + top bar) |

The dashboard is a Next.js **layout + page** split: `layout.tsx` mounts the always-on chrome (`DashboardShell`: sidebar + top bar) and `page.tsx` is the swappable main area. Future dashboard sub-routes nest under the same shell automatically.

## Files touched (Phase 1)

| File | What |
| ---- | ---- |
| `src/app/globals.css` | Electious design tokens + shadcn semantic vars remapped to the brand palette |
| `src/app/layout.tsx` | Root layout — loads Poppins / Noto Sans / Roboto Mono via `next/font` |
| `src/app/dashboard/layout.tsx` | Dashboard shell (sidebar + top bar) |
| `src/app/dashboard/page.tsx` | Main area placeholder |
| `src/components/ui/button.tsx`, `breadcrumb.tsx` | shadcn components |
| `src/lib/utils.ts` | shadcn `cn()` helper |
| `components.json` | shadcn config (style `base-nova`, base color `neutral`) |

## Top bar

`src/app/dashboard/layout.tsx` — 64px tall, white (`bg-card`), bottom border, `justify-between`.

- **Left:** breadcrumb `Home / Dashboard` (shadcn `Breadcrumb`).
- **Right** (`gap-4`):
  - **Election-status placeholder** — pulsing green dot (`bg-status-active`, `animate-pulse`) + "Updated just now" text. Mirrors the prototype's live-update indicator; static placeholder until real data wiring.
  - **Notification bell** — 38×38 button, 1px border (`border-border`), `rounded-md`, `lucide-react` `Bell` icon. `aria-label="Notifications"`, hover `bg-secondary`. No-op for now.

> Matches `context/design/electious-dashboard-prototype` top-bar pattern (prototype lines 92–107).

## Design tokens & theming

`globals.css` is the single source of truth, following `context/design-system-spec.md`:

- **Electious `@theme` tokens** — `brand-*`, `neutral-*`, semantic (`success/error/warning/info-*`), `status-*` (draft/scheduled/active/closed/archived), fonts, radius, shadow, layout max-widths. These generate utilities like `bg-brand-700`, `bg-status-active`, `font-heading`, `max-w-content`.
- **shadcn semantic vars** (`--primary`, `--background`, `--sidebar`, …) are remapped to the Electious palette so shadcn components are on-brand out of the box: primary → `brand-700`, page bg → `neutral-50`, sidebar → `brand-900` (navy), ring → `brand-700`.
- **Light mode only** (MVP). No `dark` class is applied; the `.dark` block from shadcn is left dormant.

### Fonts

Loaded in `src/app/layout.tsx` with `next/font/google` and exposed as CSS variables, which the theme points at:

| Role | Font | Variable | Utility |
| ---- | ---- | -------- | ------- |
| Headings | Poppins (600/700) | `--font-poppins` | `font-heading` |
| Body / default | Noto Sans | `--font-noto-sans` | `font-sans` / `font-body` |
| Mono (hashes, codes) | Roboto Mono | `--font-roboto-mono` | `font-mono` |

> Note: shadcn's init left a circular `--font-sans: var(--font-sans)`; fixed by pointing the theme font vars at the `next/font` variables.

## Conventions

- Light mode default; dark mode out of MVP scope.
- Use Electious token utilities (`bg-status-active`, `font-heading`, …) and shadcn semantic utilities (`bg-card`, `text-muted-foreground`, `border-border`) over ad-hoc hex.
- New dashboard sub-pages: add `src/app/dashboard/<route>/page.tsx` — they inherit the shell.

## Verification

`npm run build` — passes (TypeScript clean, `/dashboard` prerendered static).
