// Pristupačnost — jedan izvor istine za četiri preferencije.
// Čisto i bez server-only: iz istog popisa nastaju zod unija u akciji,
// data-atributi na ljusci i CSS pravila u globals.css.

export const ACCESSIBILITY_KEYS = [
  "reduceMotion",
  "highContrast",
  "largerText",
  "focusOutlines",
] as const;

export type AccessibilityKey = (typeof ACCESSIBILITY_KEYS)[number];

export type AccessibilityPrefs = Record<AccessibilityKey, boolean>;

// Zadane vrijednosti prate schema.prisma — fokusni obrub je uključen.
export const ACCESSIBILITY_DEFAULTS: AccessibilityPrefs = {
  reduceMotion: false,
  highContrast: false,
  largerText: false,
  focusOutlines: true,
};

// Ključ → data-atribut na ljusci. CSS bira preko `html:has([data-…])`,
// pa atribut postoji samo kad je preferencija uključena.
const ATTRIBUTE: Record<AccessibilityKey, string> = {
  reduceMotion: "data-reduce-motion",
  highContrast: "data-high-contrast",
  largerText: "data-larger-text",
  focusOutlines: "data-focus-outlines",
};

// Isključena preferencija ne smije ostaviti `data-x="false"` — `[data-x]`
// hvata i to, pa se atribut izostavlja (React briše undefined).
export function accessibilityAttributes(
  prefs: AccessibilityPrefs,
): Record<string, "" | undefined> {
  const attrs: Record<string, "" | undefined> = {};
  for (const key of ACCESSIBILITY_KEYS) {
    attrs[ATTRIBUTE[key]] = prefs[key] ? "" : undefined;
  }
  return attrs;
}
