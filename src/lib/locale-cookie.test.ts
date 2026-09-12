import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

/**
 * Ugovorni test nad `src/i18n/routing.ts` — nema vlastiti modul, isti oblik kao
 * `static-route-boundaries.test.ts`.
 *
 * Postoji jer je ovo tiha regresija: `localeCookie` je u next-intl-u zadano
 * UKLJUČEN, pa ga brisanje jednog retka vraća — bez greške u tipovima, bez pada
 * builda, bez ijednog testa koji bi to primijetio. Posljedica nije kozmetička:
 * Pravila privatnosti §F objavljuju da postupak glasovanja ne postavlja nijedan
 * kolačić, a s uključenim kolačićem to prestaje biti istina za svakog birača
 * čiji se jezik preglednika razlikuje od jezika u URL-u (izmjereno na
 * produkciji 2026-09-12: engleski preglednik na /hr/vote/… dobije NEXT_LOCALE).
 */
describe("locale cookie", () => {
  it("is disabled, so no public surface writes NEXT_LOCALE", () => {
    expect(routing.localeCookie).toBe(false);
  });

  it("stays disabled together with locale detection", () => {
    // Njih dvoje su spregnuti: kolačić postoji da bi ga detekcija čitala. Ako
    // netko uključi detekciju, kolačić mu treba — a time se vraća i tvrdnja iz
    // §F koju treba iznova napisati. Pad ovog testa je taj razgovor, ne smetnja.
    expect(routing.localeDetection).toBe(false);
  });

  it("derives the locale from the URL on every locale", () => {
    // Ono što kolačić čini nepotrebnim: svaki jezik je u putanji, pa nema
    // zahtjeva bez jezika iz kojeg bi se jezik morao pogađati.
    expect(routing.localePrefix).toBe("always");
    expect(routing.locales).toContain(routing.defaultLocale);
  });
});
