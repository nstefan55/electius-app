// Sanitizacija URL-a prije nego ode u Vercel Web Analytics.
//
// Analitika je bez kolačića i ne sprema ništa na uređaj (provjereno u dist/:
// nema document.cookie, localStorage, sessionStorage ni indexedDB), pa privola
// nije potrebna. Ono što JEST problem je URL: `beforeSend` dobiva `path` iz
// usePathname(), dakle RAZRIJEŠENU putanju, a tri naše rute nose živi kredencijal
// u URL-u:
//
//   /{locale}/vote/<sirovi token>         — glasački token (putanja)
//   /{locale}/reset-password?token=…      — token za reset lozinke
//   /{locale}/confirm-deletion?token=…    — token za brisanje računa
//
// Bez ovoga bi sirovi glasački token završio u analitičkoj nadzornoj ploči —
// invarijanta #2 ("sirovi token se nikad ne zapisuje ni ne logira") i obećanje
// iz /privacy da poveznica u čitljivom obliku postoji samo u e-pošti. Isti
// razlog zbog kojeg je praćenje klikova u Resendu zabranjeno.
//
// ⚠ Vercel kao hosting ionako vidi sav promet i access logove (tako i piše u
// /privacy). Razlika je u tome što je analitička ploča šira, trajnija i lakše
// čitljiva površina od server logova — ondje token ne smije doći.

// Segment IZA /vote/ je sirovi token ILI id izbora (QR ulaz). Klijent ih ne može
// razlikovati i ne smije pokušavati, pa cijeli događaj otpada.
// `/voters` (admin ruta) namjerno NE pada — `vote` mora završiti na / ili kraju.
const VOTE_PATH = /(^|\/)vote(\/|$)/;

// Allowlist, ne denylist. Svaki nepoznat parametar otpada, pa je sljedeći
// `?token=` na nekoj budućoj ruti siguran a da se toga nitko ne mora sjetiti.
// utm_* ostaje jer je atribucija ("odakle su današnje prijave") jedini razlog
// zbog kojeg je analitika uopće uvedena.
const ALLOWED_QUERY = /^utm_[a-z]+$/;

const FALLBACK_ORIGIN = "http://analytics.invalid";

/** Vrati siguran URL, ili null ako događaj treba potpuno odbaciti. */
export function redactAnalyticsUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw, FALLBACK_ORIGIN);
  } catch {
    return null; // ne šalji ono što ne razumiješ
  }

  if (VOTE_PATH.test(url.pathname)) return null;

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (ALLOWED_QUERY.test(key)) kept.append(key, value);
  }
  url.search = kept.toString();
  url.hash = ""; // fragment nikad ne mjerimo, a može nositi bilo što

  return url.origin === FALLBACK_ORIGIN
    ? `${url.pathname}${url.search}`
    : url.toString();
}
