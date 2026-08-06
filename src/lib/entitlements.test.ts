import { describe, expect, it } from "vitest";

import {
  archiveExpiresAt,
  canBrandReports,
  FREE_VOTER_CAP,
  PRO_VOTER_CAP,
  voterCap,
  type Entitlement,
} from "@/lib/entitlements";

const free: Entitlement = { kind: "free" };
const pro: Entitlement = { kind: "pro" };
const purchased: Entitlement = { kind: "purchased", voterCap: 2000 };

describe("voterCap", () => {
  it("returns the tier caps", () => {
    expect(voterCap(free)).toBe(FREE_VOTER_CAP);
    expect(voterCap(free)).toBe(50);
    expect(voterCap(pro)).toBe(PRO_VOTER_CAP);
    expect(voterCap(pro)).toBe(500);
  });

  it("returns the purchased ceiling, not a tier label", () => {
    // Kupljeni izbori nose vlastitu granicu; mapiranje na PRO_VOTER_CAP bi
    // tiho srezalo izbor s 2000 birača na 500.
    expect(voterCap(purchased)).toBe(2000);
    expect(voterCap({ kind: "purchased", voterCap: 100 })).toBe(100);
  });
});

describe("canBrandReports", () => {
  it("gates branding on Free only", () => {
    expect(canBrandReports(free)).toBe(false);
    expect(canBrandReports(pro)).toBe(true);
    expect(canBrandReports(purchased)).toBe(true);
  });
});

describe("archiveExpiresAt", () => {
  it("never expires for Pro or purchased, at any seal date", () => {
    expect(archiveExpiresAt(pro, new Date(2026, 7, 6))).toBeNull();
    expect(archiveExpiresAt(pro, new Date(1999, 0, 1))).toBeNull();
    expect(archiveExpiresAt(purchased, new Date(2026, 7, 6))).toBeNull();
  });

  it("adds exactly one calendar year for Free", () => {
    expect(archiveExpiresAt(free, new Date(2026, 7, 6))).toEqual(
      new Date(2027, 7, 6),
    );
  });

  it("keeps the time of day", () => {
    expect(archiveExpiresAt(free, new Date(2026, 7, 6, 13, 45, 30, 250))).toEqual(
      new Date(2027, 7, 6, 13, 45, 30, 250),
    );
  });

  it("lands on 2028-02-28 when sealed 2027-02-28", () => {
    // Iz specifikacije. Mutacijska provjera: ovaj slučaj NE hvata 365-dnevnu
    // aritmetiku — 29.2.2028. dolazi nakon 28.2.2028., pa je razmak točno 365
    // dana i obje implementacije daju isti datum. Zadržan jer i dalje pinira
    // pomak za godinu; slučaj koji stvarno grize je onaj ispod.
    expect(archiveExpiresAt(free, new Date(2027, 1, 28))).toEqual(
      new Date(2028, 1, 28),
    );
  });

  it("lands on 2028-03-01 when the year crossed actually contains 29 February", () => {
    // Ovo je regresija: 365 * 24 * 60 * 60 * 1000 ovdje daje 2028-02-29, dan
    // ranije, i nitko to ne bi primijetio jer expiresAt još nijedan posao ne čita.
    expect(archiveExpiresAt(free, new Date(2027, 2, 1))).toEqual(
      new Date(2028, 2, 1),
    );
  });

  it("rolls 29 February forward to 1 March", () => {
    // U 2029. nema 29. veljače; JS se prelijeva na 1. ožujka. Pinirano jer je
    // stvarna vrijednost, a ne zato što je poželjna — dan viška ide organizaciji.
    expect(archiveExpiresAt(free, new Date(2028, 1, 29))).toEqual(
      new Date(2029, 2, 1),
    );
  });

  it("does not mutate the seal date", () => {
    const sealedAt = new Date(2026, 7, 6);
    archiveExpiresAt(free, sealedAt);
    expect(sealedAt).toEqual(new Date(2026, 7, 6));
  });
});

describe("exhaustiveness", () => {
  it("handles a purchased entitlement in every exported function", () => {
    // Ne uklanjati: `purchased` je jedina varijanta koju ništa još ne proizvodi,
    // pa bi ispala iz nekog switcha neprimijećeno.
    expect(voterCap(purchased)).toBe(2000);
    expect(canBrandReports(purchased)).toBe(true);
    expect(archiveExpiresAt(purchased, new Date(2026, 7, 6))).toBeNull();
  });
});
