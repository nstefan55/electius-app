import { describe, expect, it } from "vitest";
import {
  buildArchiveTombstone,
  readProofMeta,
  shouldPrune,
} from "@/lib/archive-prune";

const NOW = new Date("2027-03-01T12:00:00.000Z");

describe("shouldPrune", () => {
  it("Pro nikad ne obrezuje — null rok znači bez roka", () => {
    // archiveExpiresAt za pro/purchased vraća null. Ovo je jedina brava koja
    // stoji između nadograđene organizacije i jednosmjernog pečata retencije.
    expect(shouldPrune(null, NOW)).toBe(false);
  });

  it("rok u budućnosti ne obrezuje", () => {
    expect(shouldPrune(new Date("2027-03-02T00:00:00.000Z"), NOW)).toBe(false);
  });

  it("rok koji je upravo istekao obrezuje", () => {
    expect(shouldPrune(NOW, NOW)).toBe(true);
  });

  it("rok u prošlosti obrezuje", () => {
    expect(shouldPrune(new Date("2026-03-01T00:00:00.000Z"), NOW)).toBe(true);
  });
});

describe("readProofMeta", () => {
  const fallback = { algorithm: "fallback-alg", leafOrdering: "fallback-ord" };

  it("čita algoritam sa samog retka, ne iz današnjih konstanti", () => {
    // Niz koji opisuje algoritam JEST ugovor. Upisati današnji na zapis
    // zapečaćen po drugom pravilu znači potpisati tvrdnju koja nije istinita.
    expect(
      readProofMeta(
        { algorithm: "sha256-hex-concat/dup-last/lex-asc", leafOrdering: "lex-asc" },
        fallback,
      ),
    ).toEqual({
      algorithm: "sha256-hex-concat/dup-last/lex-asc",
      leafOrdering: "lex-asc",
    });
  });

  it("pada na konstante kad polja nema", () => {
    expect(readProofMeta({ leaves: [], tree: [] }, fallback)).toEqual(fallback);
  });

  it("preživi null i ne-objekt", () => {
    expect(readProofMeta(null, fallback)).toEqual(fallback);
    expect(readProofMeta("nije objekt", fallback)).toEqual(fallback);
  });
});

describe("buildArchiveTombstone", () => {
  const tombstone = buildArchiveTombstone({
    root: "a".repeat(64),
    algorithm: "sha256-hex-concat/dup-last/lex-asc",
    leafOrdering: "lex-asc",
    prunedAt: NOW,
  });

  it("zadržava korijen i algoritam čitljivima", () => {
    // Bez njih se obrezani redak ne razlikuje od izbora arhiviranih prije nego
    // što je pečat uopće postojao, a revizor ne vidi na što se zapis obvezao.
    expect(tombstone.root).toBe("a".repeat(64));
    expect(tombstone.algorithm).toBe("sha256-hex-concat/dup-last/lex-asc");
    expect(tombstone.leafOrdering).toBe("lex-asc");
    expect(tombstone.prunedAt).toBe(NOW.toISOString());
    expect(tombstone.pruned).toBe(true);
  });

  it("ne nosi ni jedan list ni čvor stabla", () => {
    // Cijela svrha obrezivanja je teški teret dokaza. Nadgrobni zapis koji ga
    // ponovno unese ne bi oslobodio ništa.
    const keys = Object.keys(tombstone).sort();
    expect(keys).toEqual([
      "algorithm",
      "leafOrdering",
      "pruned",
      "prunedAt",
      "root",
    ]);
  });
});
