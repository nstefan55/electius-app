import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";


// Security response headers (production-readiness Layer 8). Applied uniformly to
// every route, so they are identical for an existing vs. a missing/hidden
// election — they add no oracle to /results/[id] (Gate 13 §11).
//
// The CSP here deliberately covers ONLY the directives that cannot break
// scripts/styles/images: it hardens clickjacking (frame-ancestors, doubled by
// X-Frame-Options for old browsers), <base> injection, plugin embedding and
// cross-origin form posts — all verified safe (no iframes, no <object>, every
// form posts same-origin). A full resource-restricting CSP (script-src/style-src/
// img-src/connect-src) is a SEPARATE, larger job: recharts and Next's inline
// bootstrap need either a per-request nonce (a proxy.ts change + strict-dynamic)
// or 'unsafe-inline', and dev/turbopack (eval + HMR websockets) differs from
// prod, so it can only be validated with a PRODUCTION browser pass — deferred,
// see docs/2026-09-01/security-headers.md.
//
// HSTS carries no `preload` on purpose — the preload list is a hard-to-undo
// commitment; 2 years + includeSubDomains is the safe default. HSTS over http
// (dev) is ignored by browsers, so it is inert locally.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray package-lock.json in the home dir makes Next.js guess wrong
  turbopack: { root: __dirname },
  // Our root layout is src/app/[locale]/layout.tsx — a top-level dynamic segment, not
  // src/app/layout.tsx. Next can't compose a normal not-found.tsx cascade for genuinely
  // unmatched URLs in that topology (confirmed: it falls back to the built-in 404 instead
  // of any [locale]-nested not-found.tsx) — global-not-found.tsx is the documented fix.
  experimental: { globalNotFound: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
