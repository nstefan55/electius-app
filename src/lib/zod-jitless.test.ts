import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Ugovorni test bez vlastitog izvornog modula, isti obrazac kao
// static-route-boundaries.test.ts i locale-cookie.test.ts: čita datoteke kao
// TEKST i brani svojstvo koje nijedan tip ne može izraziti.
//
// ŠTO BRANI. src/lib/zod.ts gasi zodovu JIT-provjeru (`new Function("")`) koju
// naš CSP blokira. Da bi to vrijedilo, sve što dođe do preglednika mora `z`
// uvesti ODATLE — jedan `import { z } from "zod"` u klijentskoj komponenti vraća
// provjeru natrag.
//
// ZAŠTO TEST, a ne komentar. Povratak je NIJEM: tip je isti, build prolazi, lint
// šuti, nijedan drugi test ne pukne, a u dev-u se ni ne vidi jer razvojni CSP
// namjerno dopušta 'unsafe-eval'. Vidi se tek u produkciji, kao greška u
// konzoli — i kao šum u praćenju grešaka.
//
// Popis se IZVODI iz datotečnog sustava (obrazac iz dashboard-paths.test.ts), pa
// nova klijentska komponenta upada pod pravilo sama od sebe.

const SRC = join(process.cwd(), "src");

// Smiju uvoziti sirovi "zod": sam dijeljeni modul, te poslužiteljske grane koje
// preglednik nikad ne izvršava i kojima JIT treba ostati.
const SERVER_ONLY = [join("src", "actions"), join("src", "app", "api")];
const SHARED = join("src", "lib", "zod.ts");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const RAW_ZOD = /from\s+["']zod["']/;

const files = walk(SRC)
  .map((f) => relative(process.cwd(), f))
  .filter((f) => RAW_ZOD.test(readFileSync(f, "utf8")));

describe("zod jitless", () => {
  it("uopće pronalazi uvoze zoda (inače test ne dokazuje ništa)", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("sirovi uvoz zoda postoji samo u dijeljenom modulu i na poslužitelju", () => {
    const stray = files.filter(
      (f) =>
        f !== SHARED &&
        !SERVER_ONLY.some((d) => f.startsWith(d + sep)),
    );
    expect(stray).toEqual([]);
  });

  it("dijeljeni modul gasi JIT u pregledniku i ponovno izvozi z", () => {
    const src = readFileSync(SHARED, "utf8");
    expect(src).toMatch(/typeof window !== "undefined"/);
    expect(src).toMatch(/z\.config\(\{\s*jitless:\s*true\s*\}\)/);
    expect(src).toMatch(/export \{ z \}/);
  });

  // Krivi popravak za isti simptom je proširiti CSP. 'unsafe-eval' smije
  // postojati samo unutar dev-grane te jedne direktive.
  it("'unsafe-eval' u script-src ostaje iza isDev", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    // Jedna direktiva iz template literala, bez dijeljenja po retcima.
    const directive = cfg.match(/`script-src 'self'[^`]*`/)?.[0];
    expect(directive).toBeDefined();
    if (directive!.includes("unsafe-eval")) {
      expect(directive).toMatch(/isDev \? "[^"]*'unsafe-eval'/);
    }
  });
});

// Tekstualni test iznad dokazuje OBLIK. Ovaj dokazuje PONAŠANJE: da ime opcije
// koje zovemo zod još uvijek čita. Da je preimenuje, gornji bi i dalje prolazio.
describe("zod jitless — izvođenje", () => {
  beforeEach(() => {
    // globalConfig živi na globalThis, pa bi prethodni test curio u sljedeći.
    delete (globalThis as Record<string, unknown>).__zod_globalConfig;
    delete (globalThis as Record<string, unknown>).window;
    vi.resetModules();
  });

  it("na poslužitelju ne dira konfiguraciju (JIT ostaje)", async () => {
    const { z } = await import("@/lib/zod");
    expect(z.config().jitless).toBeUndefined();
  });

  it("u pregledniku gasi JIT-probu", async () => {
    (globalThis as Record<string, unknown>).window = {};
    const { z } = await import("@/lib/zod");
    expect(z.config().jitless).toBe(true);
    // Shema se i dalje gradi i validira — samo interpretiranim putem.
    const s = z.object({ a: z.string() });
    expect(s.safeParse({ a: "x" }).success).toBe(true);
    expect(s.safeParse({ a: 1 }).success).toBe(false);
  });
});
