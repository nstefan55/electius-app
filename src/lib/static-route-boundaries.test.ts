import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Ugovorni test bez vlastitog izvornog modula, isti obrazac kao
// better-auth-schema.test.ts: čita datoteke kao TEKST i brani svojstvo koje
// nijedan tip ne može izraziti.
//
// ŠTO BRANI. /results/[id] je jedina ISR-keširana ruta u aplikaciji. Granice
// rute (loading/not-found/error) renderiraju se u stablu SVAKE stranice ispod
// sebe, a NE primaju params — pa u njima nema odakle pozvati setRequestLocale i
// getTranslations()/getLocale() padaju na čitanje zaglavlja. Isto vrijedi za
// izravni next/headers.
//
// ZAŠTO TEST, a ne komentar. Bez ISR-a takvo čitanje je samo sporo. S ISR-om je
// FATALNO: izmjereno, uz generateStaticParams cijela stranica vraća HTTP 500
// (DYNAMIC_SERVER_USAGE) na SVAKI zahtjev — i objavljeni zbroj i skriveni
// zaslon. Build to ne hvata (prazan generateStaticParams znači da se ništa ne
// prerenderira, pa se ruta i dalje označava ●), CI ne pokreće build, a ruta je
// javna. Dakle: jedini jeftini alarm je ovdje.
//
// Popis granica se IZVODI iz datotečnog sustava, pa novi (voter)/error.tsx
// upada pod pravilo sam od sebe — isti razlog kao u dashboard-paths.test.ts.

const APP = join(process.cwd(), "src", "app", "[locale]");
const BOUNDARY = ["loading.tsx", "not-found.tsx", "error.tsx", "template.tsx"];

// Granice u stablu /[locale]/(voter)/results/[id]: korijen segmenta + grupa.
const DIRS = [APP, join(APP, "(voter)")];

function boundariesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => BOUNDARY.includes(f))
    .map((f) => join(dir, f));
}

describe("granice ISR rute /results/[id]", () => {
  const files = DIRS.flatMap(boundariesIn);

  it("uopće pronalazi granice (inače test ne dokazuje ništa)", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files)("%s ne uvozi next/headers ni next-intl/server", (file) => {
    const imports = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");

    expect(imports).not.toMatch(/from\s+["']next\/headers["']/);
    expect(imports).not.toMatch(/from\s+["']next-intl\/server["']/);
  });
});

describe("/results/[id] zadržava oba izvoza koja pale ISR", () => {
  const page = readFileSync(
    join(APP, "(voter)", "results", "[id]", "page.tsx"),
    "utf8",
  );

  it("izvozi revalidate", () => {
    expect(page).toMatch(/export\s+const\s+revalidate\s*=/);
  });

  // Prazan popis izgleda kao mrtvi kod i prva je stvar koju netko obriše.
  // Bez njega Next 16 rutu s dinamičkim segmentom uopće ne uvodi u ISR i
  // revalidate ostaje mrtvo slovo — mjereno, ne pretpostavljeno.
  it("izvozi generateStaticParams, makar i prazan", () => {
    expect(page).toMatch(/export\s+function\s+generateStaticParams/);
  });
});
