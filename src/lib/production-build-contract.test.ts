import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Ugovorni test bez vlastitog izvornog modula — isti obrazac kao
// static-route-boundaries.test.ts i better-auth-schema.test.ts: čita datoteke
// kao TEKST i brani svojstva koja nijedan tip ne može izraziti.
//
// ŠTO BRANI, i zašto baš test. Dvije regresije iz launch-gate revizije
// (2026-09-11) dijele isti način propadanja: NIJEDAN postojeći alat ih ne vidi.
// tsc ih ne vidi, lint ih ne vidi, a ci.yml namjerno NE pokreće build — pa bi
// obje otišle u produkciju sa zelenim gatesima i bez ijedne crvene crte.
//
//   1. IZVORNE MAPE U PREGLEDNIKU. Izmjereno na ovom buildu: .next/static ima
//      0 .map datoteka i 0 sourceMappingURL komentara kroz 57 JS datoteka, jer
//      je productionBrowserSourceMaps zadano false (next/dist/server/
//      config-shared.js:128). Stvarni okidač regresije nije netko tko upiše tu
//      zastavicu, nego INSTALACIJA Sentryja (stavka D9): njegov Next dodatak
//      pali klijentske izvorne mape kao nuspojavu, a to se u konfiguraciji vidi
//      SAMO po withSentryConfig omotaču — zastavica ostaje nenapisana. Zato se
//      provjeravaju oba, inače bi test propustio jedini vjerojatan put.
//
//   2. (app) NA CDN-u. Cijela je grupa dinamična iz jednog razloga:
//      requireSession() čita headers() (require-session.ts:38), a
//      (app)/layout.tsx ga awaita u korijenu grupe. Jedan `export const
//      revalidate` ili `dynamic` na bilo kojoj (app) stranici tu presudu
//      poništava i stranica prijavljenog administratora postaje predmemorirana
//      na rubu — tuđi podaci tuđem administratoru. Build i dalje prolazi.
//      Potvrda da je danas čisto: prerender-manifest.json ne sadrži nijednu
//      (app) rutu.
//
// Popis (app) datoteka se IZVODI iz datotečnog sustava, pa nova ruta upada pod
// pravilo sama od sebe — isti razlog kao u dashboard-paths.test.ts.

const ROOT = process.cwd();
const CONFIG = join(ROOT, "next.config.ts");
const APP_GROUP = join(ROOT, "src", "app", "[locale]", "(app)");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe("produkcijski paket ne nosi izvorne mape u preglednik", () => {
  const config = readFileSync(CONFIG, "utf8");

  // Spomenuta, a ne izrijekom false = pad. Time prolazi i izostanak (zadano
  // false) i eksplicitni false, a pada svaka vrijednost i svaki izraz —
  // `: process.env.X === "1"` se ne može provući kroz provjeru na `: true`.
  it.each(["productionBrowserSourceMaps", "turbopackSourceMaps"])(
    "%s nije uključen u next.config.ts",
    (flag) => {
      const mentioned = new RegExp(flag).test(config);
      const explicitlyOff = new RegExp(`${flag}\\s*:\\s*false`).test(config);
      expect(mentioned && !explicitlyOff).toBe(false);
    },
  );

  it("next.config.ts nije omotan Sentryjem", () => {
    expect(config).not.toMatch(/withSentryConfig/);
  });
});

describe("(app) rute ostaju dinamične — nikad CDN-predmemorirane", () => {
  const files = walk(APP_GROUP).map((f) => relative(ROOT, f));

  // Bez ovoga bi pokvaren walk() (preimenovana grupa, promijenjen segment)
  // dao prazan popis i zeleni test koji ne dokazuje ništa.
  it("uopće pronalazi (app) datoteke", () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });

  // `dynamic` se zabranjuje U CIJELOSTI, i "force-dynamic" uključivo: grupa je
  // dinamična preko layouta, pa je svaki takav izvoz suvišan, a njegova
  // pojava znači da je netko pogrešno shvatio mehanizam. Bolje da stane ovdje
  // nego da sljedeći uredi "force-static" i nitko ne primijeti.
  it.each(files)("%s ne izvozi revalidate/dynamic/generateStaticParams", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    expect(src).not.toMatch(/export\s+const\s+revalidate\s*=/);
    expect(src).not.toMatch(/export\s+const\s+dynamic\s*=/);
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+generateStaticParams/);
    expect(src).not.toMatch(/export\s+const\s+generateStaticParams\s*=/);
  });
});
