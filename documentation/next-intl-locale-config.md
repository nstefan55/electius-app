# Next-Intl Locale Config — Prefix All Locales

Switched next-intl from `localePrefix: "as-needed"` to `"always"`. **Every** locale is now
URL-prefixed, including the default (`hr`). URLs are `/hr/…` and `/en/…`
(prod: `electious.com/hr`, `electious.com/en`).

- **Spec:** `context/features/next-intl-locale-config-spec.md`
- **Branch:** `feature/next-intl-locale-config` → merged to `main` (2026-07-11)

---

## What changed

| Before (`as-needed`) | After (`always`) |
|----------------------|------------------|
| `hr` unprefixed: `/dashboard`, `/elections` | `hr` prefixed: `/hr/dashboard`, `/hr/elections` |
| only `en` prefixed: `/en/dashboard` | `en` still prefixed: `/en/dashboard` |
| bare `/` served the default locale directly | bare/unprefixed paths **307-redirect** to `/hr/…` |

One flag, in one file — everything downstream reads the routing config dynamically, so the
change propagated on its own. The only hand-edit beyond the flag was the proxy helper that had
hard-coded the old assumption.

### `src/i18n/routing.ts`

```ts
localePrefix: "always",   // was "as-needed" — prefix ALL locales, including default hr
localeDetection: false,   // unchanged — no Accept-Language sniffing
```

### `src/proxy.ts` — the one real code change

Under `as-needed` the default locale never appeared in a URL, so `localePrefix()` deliberately
**excluded** it. Under `always`, `/hr` is a valid prefix, so that exclusion had to go:

```ts
// BEFORE: returned the segment only if it was a NON-default locale (en)
// AFTER:  returns any recognized locale segment (hr | en), null for a bare "/"
function localePrefix(pathname: string): string | null {
  const seg = pathname.split("/")[1];
  return (routing.locales as readonly string[]).includes(seg) ? seg : null;
}
```

The dashboard-host root-rewrite block needed **no** logic change — it was already written with a
default fallback, so it now maps `/`, `/hr`, and `/en` all to `/{locale}/dashboard`:

```ts
const prefix = localePrefix(pathname);            // "hr" | "en" | null (bare root)
const rest = prefix ? pathname.slice(prefix.length + 1) : pathname;
if (rest === "" || rest === "/") {
  url.pathname = `/${prefix ?? routing.defaultLocale}/dashboard`;
  return NextResponse.rewrite(url);
}
```

> The proxy still emits its **own** `NextResponse.rewrite` (the Phase-1 bilingual-gap fix). That's
> why this change was low-risk: it names the locale explicitly, so the `[locale]` segment drives
> `getRequestConfig` and the right catalog loads for both locales with no next-intl pass for the root.

### `src/i18n/config.ts`, `src/lib/urls.ts` — comments only

- `config.ts`: fixed a now-false "Croatian (no URL prefix)" comment.
- `urls.ts`: **no behavior change.** Cross-host helpers (`signInUrl`, `voteUrl`, …) still emit
  unprefixed paths like `/login`; under `always` the **target host** 307-redirects them to
  `/hr/login`. Correct for the hr-only MVP. Locale-aware cross-host hand-off stays the tracked
  `TODO(i18n)`.

Navigation files (`navigation.ts` `Link`/`useRouter`, `usePathname` active-state, `request.ts`
catalog loading) needed **zero** edits — they consume `routing` dynamically.

---

## Routing behavior (both hosts × both locales)

| Host | Request | Result |
|------|---------|--------|
| dashboard | `/` · `/hr` · `/en` | 200 dashboard (proxy rewrite → `/{locale}/dashboard`, no redirect) |
| dashboard | `/hr/elections` | 200 direct |
| dashboard | `/elections` (unprefixed) | 307 → `/hr/elections` |
| apex | `/` | 307 → `/hr` (marketing) |
| apex | `/hr` | 200 marketing |
| apex | `/vote/tok` (unprefixed) | 307 → `/hr/vote/tok` |

**redirect vs rewrite:** the dashboard root *rewrites* (URL stays clean, no hop); unprefixed deep
links *redirect* (visible URL corrects itself). Same config, two behaviors, one per surface.

---

## Local development

`*.localhost` resolves to `127.0.0.1` — no hosts-file edit. Test host routing with curl (browser
DNS isn't involved) by setting the `Host` header:

```bash
curl -s http://localhost:3000/en -H "Host: dashboard.localhost:3000"   # → dashboard, en
curl -sI http://localhost:3000/ -H "Host: localhost:3000"              # → 307 /hr (marketing)
```

---

## Verified

- `npm run build` passes (TypeScript included, 25 pages, no route collisions).
- Production-server (`next start`) host-header matrix, both hosts × `hr`/`en` (8 cases): all correct.
- `/en` rewrite confirmed to carry English content (no Croatian labels) — Phase-1 bilingual gap not
  regressed.

## Related

- Production domain was renamed `electious.hr` → `electious.com` repo-wide in the same branch.
- `.env*` is gitignored: ensure `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_MARKETING_URL` use `electious.com`.
- Living specs (`domain-architecture-spec.md`, `project-overview.md`, `project-spec.md`) still describe
  `as-needed` in prose — stale, left for a deliberate spec pass.
