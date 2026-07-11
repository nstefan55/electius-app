// Locale config — shared by routing, navigation, and the switcher.
// Every locale is URL-prefixed (localePrefix: "always"): /hr (default, MVP) and /en.
// English is ungated in the switcher until messages/en.json is reviewed.
export const LOCALES = ["hr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "hr";
