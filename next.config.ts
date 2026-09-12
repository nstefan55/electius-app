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
  // Analitika je u produkciji PRVOSTRANA (/_vercel/insights/script.js i
  // /_vercel/insights/event), pa je 'self' pokriva i produkcijski CSP se ne
  // mijenja. U razvoju paket povlači vanjsku debug skriptu — samo zbog toga je
  // origin ovdje, i samo u dev grani.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  // ui/chart.tsx ubacuje <style> element, recharts piše inline stilove.
  "style-src 'self' 'unsafe-inline'",
  // Bez data: i blob: — provjereno da ih ništa ne emitira: QR je inline <svg>,
  // nema placeholder="blur" ni toDataURL, a preuzimanja preko createObjectURL
  // vise na <a download>, što CSP ne pokriva. Vratiti data: ako se uvede blur
  // ili pregled odabrane slike prije uploada.
  `img-src 'self' ${R2_PUBLIC_BUCKET} ${GOOGLE_AVATARS}`,
  // next/font/google se u buildu poslužuje s našeg origina, bez CDN-a.
  "font-src 'self'",
  // Nijedan klijentski SDK ne zove van: nema Stripe.js, a odlazak na Checkout je
  // navigacija, koju connect-src ne pokriva. Analitika šalje na /_vercel/insights/
  // event — isti origin, pa 'self' i nju pokriva.
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
  // Optimizator slika. Next 16 već po zadanom daje WebP i 4-satni TTL, pa se
  // ovdje mijenja samo ono što stvarno nosi dobitak:
  //   formats  — AVIF ispred WebP-a (~20-30 % manje na plosnatom UI sadržaju);
  //              preglednik bira preko Accept zaglavlja, stari padaju na WebP.
  //   minimumCacheTTL — 30 dana umjesto 4 sata. Marketinške slike se ne mijenjaju
  //              između deployeva. ⚠ /_next/image URL NE sadrži hash datoteke, pa
  //              se predmemorija probija PREIMENOVANJEM datoteke, ne novim sadržajem
  //              na istom imenu.
  //   qualities — uvjet iz prethodne verzije ovog komentara je NASTUPIO: maketa
  //              proizvoda je snimka sučelja sa 7-8px tekstom, a AVIF q75 ju je
  //              stiskao na 10,5 KB pri 750px (izvorni webp je 92 KB pri 2357px)
  //              — mjereno, i toliko je mekoća bila vidljiva. Next 16 odbija svaku
  //              vrijednost koja nije na ovom popisu (vrati 44-bajtnu grešku, ne
  //              sliku), pa `quality={90}` bez ovog retka tiho razbije <Image>.
  //              75 ostaje prva jer je i dalje zadana za sve ostale slike.
  // Bez `remotePatterns`: R2 i Google avatari se renderiraju kao obični <img>
  // (vidi CSP komentar gore), pa ne prolaze kroz ovaj optimizator.
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90, 100],
    minimumCacheTTL: 2592000,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // BetterAuth sam postavlja no-store SAMO na /get-session
      // (better-auth/dist/api/routes/session.mjs:33 — jedini `no-store` u
      // cijelom routes/ stablu). /list-sessions, /list-accounts i
      // /account-info ne postavljaju ništa, a vraćaju tokene sesija, IP-ove,
      // user-agente i identifikatore povezanih računa.
      //
      // Next NE stavlja no-store na route handlere automatski (izmjereno na
      // /api/cron/*), pa bi kolačićem autentificiran GET ostao bez ijedne
      // direktive. RFC 9111 §3.5 zabranjuje dijeljeno keširanje samo za
      // zahtjeve s Authorization zaglavljem — kolačići NISU pokriveni, pa ih
      // posrednički proxy smije keširati heuristički.
      //
      // Vercel danas ne kešira odgovore funkcija bez eksplicitne direktive, a
      // ispred njega nema CDN-a (apex i dashboard razrješavaju se na Vercelove
      // anycast IP-ove, ne Cloudflareove — dakle grey cloud). Ovo je zato
      // dubinska obrana, a vrijednost je ista koju BetterAuth već koristi za
      // get-session, pa se ništa ne sukobljava.
      {
        source: "/api/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
