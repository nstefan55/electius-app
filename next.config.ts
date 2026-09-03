import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";


// Vanjski izvori koje preglednik mora doseći. Oba se renderiraju kao obični
// <img> (namjerno izvan next/image remotePatterns), pa ih img-src mora imenovati
// ili pucaju svi logotipi i avatari.
//
// Doslovan literal, ne process.env: headers() se izračunava u BUILDU, pa bi
// nedostajuća varijabla tiho ispustila izvor i slomila produkciju bez ijedne
// greške. URL kante je javan — već stoji u HTML-u svake stranice s logotipom.
const R2_PUBLIC_BUCKET = "https://pub-03d01bf5243c451ab194708fef1d518b.r2.dev";
const GOOGLE_AVATARS = "https://lh3.googleusercontent.com";

// Turbopack traži eval i HMR websocket; produkcija ne smije ni jedno.
const isDev = process.env.NODE_ENV !== "production";

// Puni CSP koji ograničava resurse.
//
// NEMA noncea, namjerno. Nonce je po zahtjevu, ISR kešira HTML — Next zato uz
// nonce gasi statičku optimizaciju i ISR za CIJELU aplikaciju. To bi srušilo
// ISR na /results/[id] (jedina keširana ruta, pinana u
// static-route-boundaries.test.ts) i statični prerender /hr + /en. Ne dodavati
// nonce ni 'strict-dynamic' bez te dvije žrtve na stolu.
//
// Cijena: 'unsafe-inline' na script-src, pa se ubrizgana inline skripta izvrši.
// Drže je connect-src 'self' (nema kuda poslati plijen) i popis u img-src (nema
// beacona). Ostatak rizika je uzak jer nijedan React sirovi-HTML slot ne prima
// korisničke podatke — jedini je tvrdo kodirani <style> u ui/chart.tsx.
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next ubacuje inline bootstrap (self.__next_f.push).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // ui/chart.tsx ubacuje <style> element, recharts piše inline stilove.
  "style-src 'self' 'unsafe-inline'",
  // Bez data: i blob: — provjereno da ih ništa ne emitira: QR je inline <svg>,
  // nema placeholder="blur" ni toDataURL, a preuzimanja preko createObjectURL
  // vise na <a download>, što CSP ne pokriva. Vratiti data: ako se uvede blur
  // ili pregled odabrane slike prije uploada.
  `img-src 'self' ${R2_PUBLIC_BUCKET} ${GOOGLE_AVATARS}`,
  // next/font/google se u buildu poslužuje s našeg origina, bez CDN-a.
  "font-src 'self'",
  // Nijedan klijentski SDK ne zove van: nema Stripe.js ni analitike, a odlazak
  // na Checkout je navigacija, koju connect-src ne pokriva.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Samo produkcija: nad http://localhost nadogradnja slomi svaki zahtjev.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// Security response headers (production-readiness Layer 8). Applied uniformly to
// every route, so they are identical for an existing vs. a missing/hidden
// election — they add no oracle to /results/[id] (Gate 13 §11).
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
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
