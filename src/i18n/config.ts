// Locale config — shared by routing, navigation, and the switcher.
// MVP ships Croatian (no URL prefix); English is prefixed (/en) and ungated
// in the switcher until messages/en.json is reviewed.
export const LOCALES = ["hr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "hr";
