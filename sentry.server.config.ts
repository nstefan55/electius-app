// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: "https://a1a0dfd8d84e511f46b8076ef157f39a@o4512023489347584.ingest.de.sentry.io/4512023494721616",

  // ⚠ Sentryjeve zadane vrijednosti su OVDJE opasne: userInfo, cookies,
  // httpHeaders, httpBodies i urlQueryParams su svi uključeni. Tijelo
  // POST /api/vote je SIROVI GLASAČKI TOKEN, a kolačić je živa sesija.
  // Ovo je Sentryjev vlastiti recept za "kao da je sendDefaultPii false".
  dataCollection: {
    userInfo: false,
    httpBodies: [],
    cookies: false,
    httpHeaders: { request: false, response: false },
    urlQueryParams: false,
  },

  // Token je i u PUTANJI (/vote/<token>), što nijedna opcija gore ne pokriva.
  beforeSend: scrubEvent,

  // D9 je praćenje grešaka. Tracing na 1 znaci 100% transakcija, svaka nosi
  // URL, i pojede besplatnu kvotu prvi dan. Podigni kad zatreba (D11).
  tracesSampleRate: 0,
});
