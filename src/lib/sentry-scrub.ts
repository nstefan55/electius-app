// Čišćenje događaja prije nego ode u Sentry. Ista obveza kao u analytics.ts,
// samo dublja: ondje smo kontrolirali jedan URL, ovdje Sentry po zadanome šalje
// tijela zahtjeva, kolačiće, zaglavlja, query parametre i korisnika.
//
// Tri naše rute nose ŽIVI kredencijal u samom URL-u:
//
//   /{locale}/vote/<sirovi token>         — glasački token (u PUTANJI)
//   /{locale}/reset-password?token=…      — token za reset lozinke
//   /{locale}/confirm-deletion?token=…    — token za brisanje računa
//
// A POST /api/vote nosi sirovi token u TIJELU. Bez ovoga bi glasački token
// završio na nadzornoj ploči trećeg pružatelja — invarijanta #2 ("sirovi token
// se nikad ne zapisuje ni ne logira") i objavljeno obećanje iz /privacy da
// poveznica u čitljivom obliku postoji samo u e-pošti koju je birač primio.
// Isti razlog zbog kojeg je praćenje klikova u Resendu zabranjeno.
//
// RAZLIKA OD analytics.ts: ondje se sporni događaj ODBACUJE, jer je mjerenje
// posjeta bez jednog URL-a i dalje korisno. Ovdje se REDIGIRA — greška na
// glasačkom listiću je upravo ono što želimo vidjeti, samo bez tokena.
//
// Modul je namjerno bez ovisnosti (tip je strukturni, ne iz @sentry/nextjs), pa
// se testira bez pokretanja SDK-a — isti razlog kao u delivery-feedback.ts.

// Segment IZA /vote/ je sirovi token ILI id izbora (QR ulaz). Kod ih ne može
// razlikovati i ne smije pokušavati, pa pada svaki.
// ⚠ `/voters` (admin ruta) namjerno NE pada — `vote` mora završiti na / ili kraju.
const VOTE_SEGMENT = /(^|\/)vote\/[^/]+/;

// Allowlist, ne denylist — i danas je prazna. Nijedan query parametar nije
// vrijedan rizika da se sljedeći `?token=` na nekoj budućoj ruti pošalje zato
// što ga se nitko nije sjetio dodati na popis. Ako zatreba, dodaj IME ovdje.
const ALLOWED_QUERY: readonly string[] = [];

const FALLBACK_ORIGIN = "http://sentry.invalid";

/** URL bez kredencijala: token u putanji redigiran, query odbačen. */
export function redactSentryUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw, FALLBACK_ORIGIN);
  } catch {
    return "[redacted]"; // ne prosljeđuj ono što ne razumiješ
  }

  url.pathname = url.pathname.replace(VOTE_SEGMENT, "$1vote/[redacted]");

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (ALLOWED_QUERY.includes(key)) kept.append(key, value);
  }
  url.search = kept.toString();
  url.hash = ""; // fragment nikad ne treba, a može nositi bilo što

  return url.origin === FALLBACK_ORIGIN
    ? `${url.pathname}${url.search}`
    : url.toString();
}

// Strukturni tip: samo ono čega se doista dotičemo. Uži od Sentryjevog Eventa
// namjerno — širi bi tip značio da modul mora pratiti njihove promjene.
type ScrubbableEvent = {
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
  };
  breadcrumbs?: { data?: { url?: string; to?: string; from?: string } }[];
};

/** Pojas i tregeri uz dataCollection opt-out u sve tri Sentry konfiguracije. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const req = event.request;
  if (req) {
    if (typeof req.url === "string") req.url = redactSentryUrl(req.url);
    // Tijelo POST /api/vote je sirovi token; kolačić je živa sesija.
    delete req.data;
    delete req.cookies;
    delete req.query_string;
    if (req.headers) {
      for (const name of Object.keys(req.headers)) {
        if (/^(cookie|authorization|x-forwarded-for)$/i.test(name)) {
          delete req.headers[name];
        }
      }
    }
  }

  // Navigacijske mrvice nose istu putanju drugim putem.
  for (const crumb of event.breadcrumbs ?? []) {
    const d = crumb.data;
    if (!d) continue;
    for (const key of ["url", "to", "from"] as const) {
      if (typeof d[key] === "string") d[key] = redactSentryUrl(d[key]);
    }
  }

  return event;
}
