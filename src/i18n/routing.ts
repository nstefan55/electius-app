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
});