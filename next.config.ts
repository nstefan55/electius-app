import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";


const nextConfig: NextConfig = {
  // Pin the workspace root — a stray package-lock.json in the home dir makes Next.js guess wrong
  turbopack: { root: __dirname },
  // Our root layout is src/app/[locale]/layout.tsx — a top-level dynamic segment, not
  // src/app/layout.tsx. Next can't compose a normal not-found.tsx cascade for genuinely
  // unmatched URLs in that topology (confirmed: it falls back to the built-in 404 instead
  // of any [locale]-nested not-found.tsx) — global-not-found.tsx is the documented fix.
  experimental: { globalNotFound: true },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
