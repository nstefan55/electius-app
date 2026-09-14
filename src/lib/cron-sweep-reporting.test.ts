import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Ugovorni test bez vlastitog izvornog modula, isti obrazac kao
// static-route-boundaries.test.ts: čita rutu kao TEKST i brani svojstvo koje
// nijedan tip ne može izraziti.
//
// ŠTO BRANI. Metla hvata grešku svakog prolaza i svejedno vraća 200 — namjerno,
// jer 5xx po stavci izjednačuje "host je pao" s "jedan primatelj je pao" i
// ponavlja posao koji je uspio. Cijena te odluke je da djelomičan pad ne vidi
// NITKO: ni pinger (200), ni Sentry (nema captureConsoleIntegration). Jedini
// alarm je izričit poziv na svakom hvatanju.
//
// ZAŠTO TEST, a ne komentar. Regresija je nevidljiva svakom drugom vratu:
// sedmo hvatanje bez prijave je ispravan TypeScript, prolazi lint, prolazi
// build, a ruta i dalje vraća 200. Otkriva se tek kad netko pita zašto izbori
// nisu poslali pozivnice — a tada je prozor glasanja već otvoren.
//
// ⚠ Dva hvatanja u prolazu aktivacije bila su potpuno TIHA (bez log-retka) do
// 2026-09-14; razvojna bilješka za D9 govorila je o četiri, a ima ih šest.
// Zato test broji, a ne nabraja.

const ROUTE = join(
  process.cwd(),
  "src",
  "app",
  "api",
  "cron",
  "activate-elections",
  "route.ts",
);

const src = readFileSync(ROUTE, "utf8");

// `.catch(` (promise) + `} catch` (try/catch) — oba oblika koja ruta koristi.
const catchSites = src.match(/\.catch\(|\}\s*catch/g) ?? [];
// Pozivi, bez definicije funkcije.
const reportCalls =
  src.match(/(?<!function\s)reportSweepFailure\(/g) ?? [];

describe("cron sweep: svako hvatanje prijavljuje", () => {
  it("ruta uopće ima hvatanja (da slomljeni regex ne prođe prazno)", () => {
    expect(catchSites.length).toBeGreaterThanOrEqual(6);
  });

  it("broj prijava odgovara broju hvatanja", () => {
    expect(reportCalls.length).toBe(catchSites.length);
  });

  it("prijava ide u Sentry, ne samo u konzolu", () => {
    expect(src).toContain("Sentry.captureException");
    expect(src).toMatch(/import \* as Sentry from "@sentry\/nextjs"/);
  });

  it("nosi rutu i prolaz kao oznake (pravilo označavanja iz D9)", () => {
    expect(src).toMatch(/tags:\s*\{\s*route:\s*"cron\/activate-elections",\s*pass\s*\}/);
  });

  it("jedini console.error je onaj u zajedničkoj prijavi", () => {
    expect(src.match(/console\.error/g) ?? []).toHaveLength(1);
  });
});
