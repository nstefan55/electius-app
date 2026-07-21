# Dashboard Phase 2 — Sidebar + i18n

Phase 2 of the dashboard UI: the collapsible sidebar, and the internationalization (i18n) foundation the whole app now runs on.

## Scope

- **Sidebar** — collapsible desktop rail + always-a-drawer on mobile, logo + brand, nav, account block, Settings, Log out.
- **i18n** — [next-intl](https://next-intl.dev/) with local translation catalogs and locale-based routing. No hardcoded UI strings anywhere.

## Sidebar

| Component | File | Role |
| --------- | ---- | ---- |
| `DashboardShell` | `src/components/dashboard/dashboard-shell.tsx` | Client chrome: owns collapse + mobile-drawer state, renders desktop aside + mobile `Sheet` + top bar + `{children}` |
| `SidebarNav` | `src/components/dashboard/sidebar-nav.tsx` | Shared nav content (logo, nav links, account block) — rendered in both the desktop aside and the mobile drawer |
| `LanguageSwitcher` | `src/components/dashboard/language-switcher.tsx` | Locale `<select>` — **built but not yet mounted** (destined for Settings) |

**Behavior**

- **Desktop:** the aside collapses between `240px` and `64px` (icon-only). Toggle is the `PanelLeft` button in the top bar. When collapsed, labels/brand/account text hide and icons center; each item keeps a `title` tooltip.
- **Mobile (`< md`):** the desktop aside is hidden; a `Menu` button opens the sidebar as a drawer (shadcn `Sheet`, slides from left). Tapping a nav item closes it. Accessibility (focus trap, Escape, scroll-lock) comes from the `Sheet`.
- **Active state:** derived from `usePathname()` (locale-aware — see below), so `/dashboard` and `/en/dashboard` both highlight Dashboard.
- **Logout** is a no-op until BetterAuth lands (marked with a `ponytail:` comment — wire `signOut()` then).

> The nav targets (`/dashboard/elections`, `/results`, `/archive`, `/voters`, `/settings`) 404 until Phase 3 builds those pages.

## i18n architecture

Local-first, repo-hosted translations with locale routing. Files under `src/i18n/`:

| File | Role |
| ---- | ---- |
| `config.ts` | `LOCALES` (`hr`, `en`), `DEFAULT_LOCALE` (`hr`), `Locale` type — the single source for locale constants |
| `routing.ts` | `defineRouting` — `localePrefix: "as-needed"` |
| `navigation.ts` | `createNavigation(routing)` → locale-aware `Link`, `useRouter`, `usePathname`, `redirect` |
| `request.ts` | `getRequestConfig` — resolves the locale from the URL (`requestLocale`) and loads its message catalog |
| `src/proxy.ts` | `createMiddleware(routing)` — resolves/redirects locales (Next.js 16 renamed `middleware` → **`proxy`**) |

**Routing — `localePrefix: "as-needed"`**

- Default locale `hr` has **no** prefix: `/dashboard`.
- Other locales are prefixed: `/en/dashboard`.
- App routes live under `src/app/[locale]/`. The root layout (`[locale]/layout.tsx`) guards the locale (`hasLocale` → `notFound`), calls `setRequestLocale`, sets `<html lang>`, and wraps children in `NextIntlClientProvider`. `generateStaticParams` prerenders both locales.

**Messages**

Catalogs are local JSON in `messages/` — `hr.json` (MVP, fully translated) and `en.json` (English, gated in the switcher until reviewed). Structure is **feature/domain namespaced**:

```
common.language.*          → shared (switcher labels)
dashboard.sidebar.nav.*    → sidebar nav labels
dashboard.sidebar.account.*→ Settings / Log out
dashboard.topbar.*         → breadcrumb, status, bell
```

## How-to

**Use a string in a component**

```tsx
import { useTranslations } from "next-intl";
const t = useTranslations("dashboard.sidebar");
return <span>{t("nav.elections")}</span>;
```

Server components: `import { getTranslations } from "next-intl/server"`.

**Link between pages** — always import from the locale-aware navigation, never `next/link`/`next/navigation`:

```tsx
import { Link, usePathname } from "@/i18n/navigation";
```

This keeps the correct prefix per locale; `usePathname()` returns the path **without** the locale prefix (so active-state checks stay locale-agnostic).

**Add a UI string** — add the key to **both** `messages/hr.json` and `messages/en.json` under the right namespace.

**Add a locale** — add it to `LOCALES` in `src/i18n/config.ts`, create `messages/<locale>.json`, and (for the switcher) flip its entry in `ENABLED` in `language-switcher.tsx`. No code migration.

## Conventions

- **No hardcoded UI strings** — everything goes through `useTranslations` / `getTranslations`.
- Internal navigation uses `@/i18n/navigation` (`Link`, `useRouter`, `usePathname`), not the bare Next.js equivalents.
- Croatian needs `latin-ext` (č ć š ž đ) — already added to the `next/font` subsets in the root layout.
- Logo is navy/blue → use the white-mark asset on the navy sidebar.

## Verification

`npm run build` — passes (TypeScript clean). Routes: `/hr`, `/en`, `/[locale]/dashboard`; `Proxy (Middleware)` active.
