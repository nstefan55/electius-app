import { describe, expect, it } from "vitest";
import { exportFilename } from "./csv";
import {
  resultsDetailAccess,
  type ElectionStatus,
  type ResultsMode,
} from "./elections-view";
import {
  canServeStored,
  isStorable,
  REPORT_SUFFIX,
  reportFilename,
  reportObjectKey,
  shouldStore,
} from "./report-export";

const STATUSES: ElectionStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
];
const MODES: ResultsMode[] = ["AFTER_CLOSE", "LIVE"];

describe("isStorable", () => {
  // Pohrana i vidljivost dijele JEDNU derivaciju. Test to pribija za svih deset
  // kombinacija: ako netko doda drugi popis statusa, ovdje pukne.
  it.each(
    STATUSES.flatMap((status) => MODES.map((resultsMode) => ({ status, resultsMode }))),
  )("$status + $resultsMode prati resultsDetailAccess", ({ status, resultsMode }) => {
    const access = resultsDetailAccess({ status, resultsMode });
    expect(isStorable(access)).toBe(access === "closed");
  });

  it("sprema samo zatvorene i arhivirane izbore", () => {
    const storable = STATUSES.flatMap((status) =>
      MODES.map((resultsMode) => ({
        status,
        resultsMode,
        storable: isStorable(resultsDetailAccess({ status, resultsMode })),
      })),
    )
      .filter((r) => r.storable)
      .map((r) => `${r.status}+${r.resultsMode}`);

    expect(storable.sort()).toEqual([
      "ARCHIVED+AFTER_CLOSE",
      "ARCHIVED+LIVE",
      "CLOSED+AFTER_CLOSE",
      "CLOSED+LIVE",
    ]);
  });

  it("izbori u tijeku se nikad ne spremaju", () => {
    expect(isStorable(resultsDetailAccess({ status: "ACTIVE", resultsMode: "LIVE" }))).toBe(
      false,
    );
  });
});

describe("reportObjectKey", () => {
  // Ključ ne prima ime datoteke, pa prelazak putanjom i osobni podaci u ključu
  // ne mogu ni nastati. Test pribija oblik, ne samo odsutnost.
  it("gradi se samo od id-a izbora i nasumičnog uuid-a", () => {
    expect(reportObjectKey("elct123")).toMatch(
      /^reports\/elct123\/[0-9a-f-]{36}\.pdf$/,
    );
  });

  it("dva poziva daju različit ključ — nema sudara", () => {
    expect(reportObjectKey("e1")).not.toBe(reportObjectKey("e1"));
  });

  it("ne prenosi ništa iz naslova ni imena datoteke", () => {
    const key = reportObjectKey("e1");
    expect(key).not.toContain("..");
    expect(key.split("/")).toHaveLength(3);
  });
});

describe("reportFilename", () => {
  const at = new Date("2026-08-02T10:00:00.000Z");

  it("korijen je isti kao kod CSV izvoza i naslova stranice", () => {
    expect(reportFilename("Studentski izbori", "hr", at)).toBe(
      `${exportFilename("Studentski izbori", REPORT_SUFFIX.hr, at)}.pdf`,
    );
  });

  it("nastavak prati jezik", () => {
    expect(reportFilename("Izbori", "hr", at)).toContain("-izvjestaj-");
    expect(reportFilename("Izbori", "en", at)).toContain("-report-");
  });

  it("dijakritika i interpunkcija ostaju ASCII", () => {
    const name = reportFilename("Đurđevac / Šišmiš.", "hr", at);
    expect(name).toMatch(/^[\x20-\x7e]+$/);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("canServeStored", () => {
  const base = { storable: true, reportKey: "reports/e1/x.pdf", reportLocale: "hr" };

  it("poslužuje spremljeni objekt na istom jeziku", () => {
    expect(canServeStored({ ...base, locale: "hr" })).toBe(true);
  });

  // D7: prvi render pobjeđuje. Drugi jezik se iscrtava svježe i NE sprema —
  // dokaz o obavljenom poslu koji se tiho mijenja nije dokaz.
  it("drugi jezik iscrtava svježe", () => {
    expect(canServeStored({ ...base, locale: "en" })).toBe(false);
  });

  it("bez spremljenog ključa nema brzog puta", () => {
    expect(canServeStored({ ...base, reportKey: null, locale: "hr" })).toBe(false);
  });

  it("izbori koji se ne smiju spremati nikad ne čitaju spremljeno", () => {
    expect(canServeStored({ ...base, storable: false, locale: "hr" })).toBe(false);
  });
});

describe("shouldStore", () => {
  it("sprema samo prvi put", () => {
    expect(shouldStore({ storable: true, reportKey: null })).toBe(true);
    expect(shouldStore({ storable: true, reportKey: "reports/e1/x.pdf" })).toBe(false);
  });

  it("izbori u tijeku se ne spremaju ni prvi put", () => {
    expect(shouldStore({ storable: false, reportKey: null })).toBe(false);
  });
});
