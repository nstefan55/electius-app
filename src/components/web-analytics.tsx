"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "@/lib/analytics";

// Klijentski omotač postoji samo zbog `beforeSend`: to je funkcija, a server
// komponenta ne može proslijediti funkciju klijentskoj. Pravilo živi u
// lib/analytics.ts da bude čisto i testabilno (invarijanta #8).
//
// Paket sam wrapa svoj useSearchParams() u <Suspense>, pa statički prerender
// /hr, /en, /privacy i /terms ostaje statičan — provjeriti u prerender-manifest.
export function WebAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = redactAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
