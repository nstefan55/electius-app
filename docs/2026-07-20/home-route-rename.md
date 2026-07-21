# Home Route Rename (/dashboard → /home)

The logged-in default route is now **`/home`** (`dashboard.electius.com/{locale}/home`), labeled **"Početna" / "Home"**. The dashboard-host root (`/`, `/hr`, `/en`) still rewrites to it, so most users never see the path change.

## What changed

| Area | Change |
| --- | --- |
| Route folder | `src/app/[locale]/(app)/dashboard/` → `(app)/home/` (git mv — history preserved). |
| `src/proxy.ts` | Host-root rewrite targets `/{locale}/home`; `DASHBOARD_ONLY_PATHS` lists `/home` (apex still 307s it to the app host). |
| Redirect targets | `SessionBounce` (signed-in login/signup bounce), setup form's Skip button, both onboarding CTAs → `/home`. |
| Labels | Sidebar nav + page title: "Nadzorna ploča"/"Dashboard" → "Početna"/"Home" (`dashboard.sidebar.nav.dashboard`, `dashboard.page.title` — key names unchanged, values only). |
| Sidebar icon | `LayoutDashboard` → `House` (matches the new label). |
| Breadcrumb | On the home page the crumb is a single "Početna" — the old two-part crumb would have read "Home / Home". Other pages keep "Početna / <page>". |

## Deliberately NOT changed

- **Internal component names** (`DashboardShell`, `components/dashboard/*`, `actions/dashboard.ts`) — code identifiers, not user-facing; renaming them is churn without benefit.
- **Sidebar href** — stays `/` (the host-root rewrite serves home), so the nav item needed no edit.
- **`domain-architecture-spec.md` and other context/ specs** still document `/dashboard` — spec updates are a deliberate separate pass (context files are never staged by the workflow).

## Known consequence

The old `/{locale}/dashboard` URL now 404s for signed-in users (anonymous users still land on login via the auth gate). No redirect shim was added — pre-launch, nothing external links to it. Add one in `proxy.ts` if bookmarks ever matter.

## Verified

Build passes (`/[locale]/home` in the route list, `/dashboard` gone). Runtime: host root `/` serves home (200 signed-in), `/hr/home` 200, signed-in `/hr/login` → 307 `/hr/home`, no-cookie `/hr/home` → 307 login, apex `/hr/home` → 307 to the dashboard host, page renders "Početna".
