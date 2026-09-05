import type { Session } from "@/lib/auth/require-session";

// Jedna sesija za svih pet testova radnji — prije je svaki nosio vlastitu
// kopiju, i to se već obilo o glavu: kad je Session dobio obavezno polje
// `accessibility`, tri kopije nisu ažurirane. Vitest je ostao zelen (odbacuje
// tipove, ne provjerava ih), `tsc` je pao sa 57 grešaka, i to tek u zasebnom
// prolazu. Tip je ovdje eksplicitan, pa novo polje puca na jednom mjestu.
//
// `import type` je namjeran: require-session.ts nosi `server-only`, a tip se
// briše pri prevođenju, pa ovdje ne nastaje uvoz u vrijeme izvođenja.
export const session: Session = {
  user: {
    email: "admin@example.com",
    name: "A",
    organization: "Org",
    image: null,
    organizationLogo: null,
    isPro: false,
  },
  organizationId: "org_1",
  accessibility: {
    reduceMotion: false,
    highContrast: false,
    largerText: false,
    focusOutlines: true,
  },
};
