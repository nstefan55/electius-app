# Fix: security response headers (v0.9.44)

**Branch:** `fix/security-headers` · **Decision:** production-readiness Layer 8

## The gap

`next.config.ts` set **no** response headers — no HSTS, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no CSP.

## What shipped

An `async headers()` in `next.config.ts` applying six headers to every route (`/:path*`):

| Header | Value | Buys |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | forces HTTPS for 2 years across subdomains. No `preload` — the preload list is a hard-to-undo commitment. Inert over http (dev). |
| `X-Frame-Options` | `DENY` | clickjacking (old browsers) |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=()` | disables features the app never uses |
| `Content-Security-Policy` | `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'` | clickjacking (modern), `<base>` injection, plugin embedding, cross-origin form posts |

Headers are **identical on every route**, so they add no oracle to the ISR `/results/[id]` route (Gate 13 §11 — an existing vs. a missing election get the same headers).

## Why the CSP is partial (deliberate scope)

The CSP covers **only the directives that cannot break scripts, styles, or images**. Those four axes were verified safe first: no `<iframe>`, no `<object>`/`<embed>`, and every form posts same-origin (the one `action=` in the codebase is a React render-slot prop on an `Empty` component, not an HTML form action).

A full resource-restricting CSP (`default-src`/`script-src`/`style-src`/`img-src`/`connect-src`) is a **separate, larger job**, deferred for concrete reasons:

- **recharts** injects inline styles and **Next's bootstrap** uses inline scripts → a real `script-src`/`style-src` needs either a **per-request nonce** (a `proxy.ts` change emitting a nonce + `'strict-dynamic'`) or `'unsafe-inline'` (which defeats most of the value).
- **dev ≠ prod**: `next dev` (turbopack) uses `eval` and an HMR websocket that production does not, so a prod-correct CSP throws violations under `next dev` and a dev-tolerant one is too loose for prod. It can only be validated with a **production** browser pass.
- `img-src`/`connect-src` need a per-origin allowlist (R2 public bucket, Google avatars) that silently breaks images/requests when wrong.

Recorded as the follow-up: `fix/security-headers-csp` — add a nonce middleware, a full policy, and verify against a **deployed** build on all four chromes.

## Verification

- `npx tsc --noEmit` clean · `npm run build` clean · `npm run test` **735 passing** (config-only change).
- Dev server: **all six headers served** and **identical** on the marketing page, the dashboard host (`/hr/login`), and the voter route (`/hr/vote/[id]`) — confirmed by `curl -I`.
- Browser pass: marketing, voter, and login pages render with **0 console errors** (no CSP violations) — expected, since the partial CSP restricts none of the resource axes.

## Files

- `next.config.ts` — `securityHeaders` + `async headers()`.
