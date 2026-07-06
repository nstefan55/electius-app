import { defineRouting } from "next-intl/routing";
import { LOCALES, DEFAULT_LOCALE } from "./config";

// "as-needed": the default locale (hr) has no prefix; others are prefixed (/en).
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed", //Removes the default locale prefix from the URL
  localeDetection: false, //Browser Lang Detection Preference 
});