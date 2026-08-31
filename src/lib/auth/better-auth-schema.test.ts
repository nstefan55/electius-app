import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  accountSchema,
  sessionSchema,
  userSchema,
  verificationSchema,
} from "@better-auth/core/db";
import { describe, expect, it } from "vitest";

// Čuvar protiv tihog razilaženja sheme s BetterAuthom.
//
// Podizanje 1.6.26 -> 1.7.2 (fb43c1a) dodalo je obavezno polje `issuer` na
// account. Naša Prisma shema ga nije imala, pa je:
//   - prijava vraćala 401 "User not found" — usporedba je JS-side filtar
//     (sign-in.mjs:320), dakle NIJE bilo ni Prismine greške ni 500,
//   - registracija pucala na "Unknown argument `issuer`".
// Ništa u lintu, tipovima, testovima ni buildu to nije primijetilo. Ovaj test
// je jedino mjesto koje sljedeće takvo dodavanje polja obara glasno.
//
// Čita schema.prisma kao TEKST namjerno: to je datoteka koja se commita i iz
// koje nastaje migracija. Prisma 7 generira TS izvor bez DMMF-a, pa
// introspekcija klijenta ovdje ionako nije dostupna.

const SCHEMA = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

/** Imena polja jednog Prisma modela. */
function prismaFields(model: string): string[] {
  const block = SCHEMA.match(new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`model ${model} nije pronađen u schema.prisma`);
  return block[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/)[0]!)
    .filter(Boolean);
}

/** Polja koja BetterAuth deklarira za svoj temeljni model. */
function coreFields(schema: { def: { shape: Record<string, unknown> } }): string[] {
  return Object.keys(schema.def.shape);
}

// BetterAuthovo ime modela -> naše. Jedino preslikavanje koje imamo je
// verification -> VerificationToken (auth/index.ts, modelName).
const MODELS: { core: string; prisma: string; schema: Parameters<typeof coreFields>[0] }[] = [
  { core: "account", prisma: "Account", schema: accountSchema as never },
  { core: "user", prisma: "User", schema: userSchema as never },
  { core: "session", prisma: "Session", schema: sessionSchema as never },
  { core: "verification", prisma: "VerificationToken", schema: verificationSchema as never },
];

describe("Prisma schema covers better-auth's core models", () => {
  it.each(MODELS)(
    "$prisma carries every field better-auth declares for $core",
    ({ prisma, schema }) => {
      const ours = new Set(prismaFields(prisma));
      const missing = coreFields(schema).filter((f) => !ours.has(f));

      // Ako ovo padne: knjižnica je dobila novo polje. Dodaj stupac i migraciju,
      // NE briši očekivanje — bez stupca prijava tiho prestaje raditi.
      expect(missing).toEqual([]);
    },
  );

  it("Account carries issuer — the field whose absence broke sign-in on 1.7.2", () => {
    // Imenovana tvrdnja uz tablicu gore: ovaj je stupac razlog postojanja testa,
    // pa mora pasti pod vlastitim imenom ako ga netko ukloni.
    expect(prismaFields("Account")).toContain("issuer");
  });
});
