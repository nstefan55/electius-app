import { defineRouting } from "next-intl/routing";
import { LOCALES, DEFAULT_LOCALE } from "./config";

// "always": every locale is prefixed, including the default (hr). URLs are /hr/… and
// /en/… (prod: electius.com/hr, electius.com/en). Bare/unprefixed paths 307-redirect
// to the default locale. See context/features/next-intl-locale-config-spec.md.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always", // Prefix ALL locales, including the default hr
  localeDetection: false, //Browser Lang Detection Preference
  // Bez ovoga next-intl PIŠE kolačić NEXT_LOCALE. `localeDetection: false`
  // gasi samo ČITANJE (resolveLocale), ne i pisanje (syncCookie), pa je
  // zadana vrijednost `localeCookie` uključena i kolačić se postavlja na
  // svakoj navigaciji gdje se jezik preglednika razlikuje od jezika u URL-u
  // — uključujući listić: engleski preglednik na /hr/vote/… ga dobije.
  // Nitko ga ne čita (nula referenci na NEXT_LOCALE u src/; jezik se izvodi
  // iz URL-a), a Pravila privatnosti §F obećavaju da postupak glasovanja ne
  // postavlja nijedan kolačić. Izmjereno na produkciji 2026-09-12.
  localeCookie: false,
});