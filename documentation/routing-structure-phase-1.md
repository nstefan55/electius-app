# Routing Structure — Phase 1: Route-Group Skeleton & Host Proxy

Foundation phase of the domain-split migration. Establishes the two-host, four-route-group
layout and the host proxy. Structure only — page contents are owned by later phases / their
own feature specs.

- **Spec:** `context/features/routing-structure-phase-1-spec.md`
- **Authority:** `context/domain-architecture-spec.md` (host topology)
- **Branch:** `feature/routing-structure-phase-1` → merged to `main` (2026-07-08)

---

## The model

**Host = audience. Route group = chrome + auth boundary.** Two orthogonal axes.

| Host | Route group | Serves | Chrome | Auth |
|------|-------------|--------|--------|------|
| `electious.hr` (apex) | `(marketing)` | `/` landing | marketing | none |
| `electious.hr` (apex) | `(voter)` | `/vote/[token]`, `/results/[id]` | mobile voter | token / public |
| `dashboard.electious.hr` | `(auth)` | `/login`, `/signup`, `/setup`, `/onboarding` | bare | pre-session |
| `dashboard.electious.hr` | `(app)` | `/dashboard`, `/elections*`, `/results`, `/archive`, `/voters` | sidebar + topbar | guarded (Phase 2) |

Route groups (`(...)`) add **no** URL segment — they only attach a layout + (later) an auth boundary.

### Route tree (`src/app/[locale]/`)

```
[locale]/
├── layout.tsx                 root layout (fonts, NextIntlClientProvider) — unchanged
├── (marketing)/page.tsx       /                landing stub
├── (voter)/
│   ├── vote/[token]/page.tsx  /vote/[token]    ballot stub
│   └── results/[id]/page.tsx  /results/[id]    public results stub
├── (auth)/
│   ├── login/page.tsx         /login           stub  (→ Phase 2)
│   ├── signup/page.tsx        /signup          stub
│   ├── setup/page.tsx         /setup           stub
│   └── onboarding/page.tsx    /onboarding      stub
└── (app)/
    ├── layout.tsx             DashboardShell — NO guard yet (seam → Phase 2)
    ├── dashboard/page.tsx     /dashboard       ← proxy rewrites dashboard-host "/" here
    ├── elections/…            /elections, /elections/new, /elections/[id] (flat stub)
    ├── results/page.tsx       /results
    ├── archive/page.tsx       /archive
    └── voters/page.tsx        /voters
```

**Why siblings, not nested?** Nesting a group inherits the parent's `layout.tsx` (wrong chrome),
and `(auth)` under a guarded `(app)/layout.tsx` would bounce `/login` in an infinite redirect loop.
So `(voter)`/`(marketing)` and `(auth)`/`(app)` stay siblings even though each pair shares a host.

---

## The host proxy (`src/proxy.ts`)

> In Next.js 16, `proxy.ts` **is** the middleware file (renamed from `middleware.ts`).

Only the **dashboard-host root** is rewritten — `dashboard.electious.hr/` → the localized
`/dashboard`. Every other admin route is already root-level under `(app)`, so it needs no
rewrite. Non-dashboard hosts and all non-root paths fall through to next-intl untouched.

The **root-collision constraint** forces this: two `page.tsx` can't both own `/`, so `(marketing)`
owns the real `/` and the dashboard overview stays a real page at `/dashboard`, reached via the rewrite.

### ⚠️ Gotcha: don't delegate the rewrite to next-intl

The proxy must emit its **own** `NextResponse.rewrite('/{locale}/dashboard')`. The obvious
approach — rewrite the URL then hand a fresh request to next-intl and let it carry the rewrite —
**silently fails for `/en`**:

- `/` → `/dashboard`: `/dashboard` lacks the `hr` prefix, so next-intl emits
  `x-middleware-rewrite: /hr/dashboard`. Works (by luck).
- `/en` → `/en/dashboard`: already canonical, so next-intl returns `NextResponse.next()` (no
  rewrite). `.next()` then re-routes the **original** `/en` → the marketing page. **Bug.**

Emitting the rewrite directly is locale-correct for both locales; the `[locale]` segment drives
`getRequestConfig`, so no next-intl middleware pass is needed for the root.

```ts
if (isDashboardHost(host)) {
  const prefix = localePrefix(pathname);           // "en" | null (hr/default)
  const rest = prefix ? pathname.slice(prefix.length + 1) : pathname;
  if (rest === "" || rest === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${prefix ?? routing.defaultLocale}/dashboard`;
    return NextResponse.rewrite(url);
  }
}
return handleI18n(request);
```

`config.matcher` still skips `api`, `_next`, `_vercel`, and files with an extension.

---

## Local development

`*.localhost` resolves to `127.0.0.1` in modern browsers — no hosts-file edit.

| URL | Serves |
|-----|--------|
| `http://localhost:3000/` | marketing (hr) |
| `http://localhost:3000/en` | marketing (en) |
| `http://dashboard.localhost:3000/` | dashboard (hr) |
| `http://dashboard.localhost:3000/en` | dashboard (en) |

To test host routing with curl (browser DNS isn't involved), set the `Host` header:

```bash
curl -s http://localhost:3000/en -H "Host: dashboard.localhost:3000"   # → dashboard, en
```

---

## Verified

- `npm run build` passes (TS included); no `/results` vs `/results/[id]` collision → `/results/[id]` kept.
- Host-header smoke test, both hosts × `hr`/`en` (7 cases): all correct, no regressions.

## Out of scope (later)

- `(app)/layout.tsx` auth guard — Phase 2 (seam is a no-op TODO now); real BetterAuth is a later spec.
- `(auth)` bodies + funnel redirects — Phase 2.
- `/elections/[id]` layout + Results/Voters facets + list routes — Phase 3.
- Real marketing/voter UI, language switcher mounting, cross-host env vars, QR — Phase 4.
- `/settings` — flattened in the nav but owned by its own Settings spec (link 404s until then).
