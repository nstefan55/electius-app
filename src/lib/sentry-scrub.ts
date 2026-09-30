
const VOTE_SEGMENT = /(^|\/)vote\/[^/]+/;


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
