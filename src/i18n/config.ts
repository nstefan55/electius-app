// Locale config — shared by routing, navigation, and the switcher.
// Every locale is URL-prefixed (localePrefix: "always"): /hr (default, MVP) and /en.
// English is ungated in the switcher until messages/en.json is reviewed.
export const LOCALES = ["hr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "hr";

// Jedino mjesto na kojem se nepoznat jezik svodi na zadani.
//
// Stupac User.locale je TEXT, a piše ga i BetterAuthov /sign-up/email, koji se
// može gađati izravno — pa vrijednost koja stigne do pošiljatelja nije nužno
// jezik koji poznajemo. Bez ovoga bi templateId() složio alias
// `electius-otp-xx`, Resend ga ne bi poznavao i slanje bi puklo; ovako pada na
// hr. Zapis se čuva na strani pisanja (z.enum(LOCALES)), ovo je zaštita čitanja.
export function resolveLocale(raw: string | null | undefined): Locale {
  return LOCALES.find((l) => l === raw) ?? DEFAULT_LOCALE;
}
