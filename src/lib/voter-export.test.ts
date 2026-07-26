import { describe, expect, it } from "vitest";
import { csvPreamble } from "./csv";
import {
  buildVoterCsv,
  resolveExportLocale,
  voterExportLabels,
  type VoterExportRow,
} from "./voter-export";

const LABELS = voterExportLabels("hr");

// Preskoči BOM + sep= redak — testovi ispod gledaju zaglavlje i podatke.
const lines = (csv: string, delimiter = ";") =>
  csv.slice(csvPreamble(delimiter).length).split("\r\n");

const voter = (over: Partial<VoterExportRow> = {}): VoterExportRow => ({
  firstName: "Ana",
  lastName: "Horvat",
  email: "ana@unizg.hr",
  status: "VOTED",
  createdAt: new Date("2026-07-01T09:30:00.000Z"),
  ...over,
});

describe("buildVoterCsv", () => {
  it("datoteka počinje sep= retkom pa lokaliziranim zaglavljima", () => {
    const csv = buildVoterCsv([], LABELS, ";");
    expect(csv.split("\r\n")[0].endsWith("sep=;")).toBe(true);
    expect(lines(csv)[0]).toBe("Ime;Prezime;E-mail;Status;Dodano");
  });

  it("prazan popis daje samo zaglavlja", () => {
    expect(lines(buildVoterCsv([], LABELS, ";"))).toEqual([
      "Ime;Prezime;E-mail;Status;Dodano",
    ]);
  });

  it("piše birača u zadanom redoslijedu stupaca", () => {
    expect(lines(buildVoterCsv([voter()], LABELS, ";"))[1]).toBe(
      "Ana;Horvat;ana@unizg.hr;Glas predan;2026-07-01",
    );
  });

  it("nullable imena daju prazne ćelije, ne 'null'", () => {
    const row = lines(
      buildVoterCsv([voter({ firstName: null, lastName: null })], LABELS, ";"),
    )[1];
    expect(row).toBe(";;ana@unizg.hr;Glas predan;2026-07-01");
    expect(row).not.toContain("null");
  });

  it("prevodi sva tri statusa", () => {
    const rows = lines(
      buildVoterCsv(
        [
          voter({ status: "PENDING" }),
          voter({ status: "INVITED" }),
          voter({ status: "VOTED" }),
        ],
        LABELS,
        ";",
      ),
    );
    expect(rows.slice(1).map((r) => r.split(";")[3])).toEqual([
      "Na čekanju",
      "Pozivnica poslana",
      "Glas predan",
    ]);
  });

  it("engleski katalog daje engleska zaglavlja i statuse", () => {
    const rows = lines(
      buildVoterCsv([voter()], voterExportLabels("en"), ","),
      ",",
    );
    expect(rows[0]).toBe("First name,Last name,Email,Status,Added");
    expect(rows[1]).toBe("Ana,Horvat,ana@unizg.hr,Voted,2026-07-01");
  });

  it("navodi ime koje sadrži razdjelnik", () => {
    const row = lines(
      buildVoterCsv([voter({ lastName: "Horvat; Anić" })], LABELS, ";"),
    )[1];
    expect(row).toBe('Ana;"Horvat; Anić";ana@unizg.hr;Glas predan;2026-07-01');
  });

  it("datum je ISO, ne lokalizirani oblik", () => {
    const row = lines(
      buildVoterCsv(
        [voter({ createdAt: new Date("2026-12-31T23:00:00.000Z") })],
        LABELS,
        ";",
      ),
    )[1];
    expect(row.endsWith(";2026-12-31")).toBe(true);
  });
});

describe("voterExportLabels", () => {
  it("hr i en imaju različit sufiks imena datoteke", () => {
    expect(voterExportLabels("hr").fileSuffix).toBe("biraci");
    expect(voterExportLabels("en").fileSuffix).toBe("voters");
  });
});

describe("resolveExportLocale", () => {
  it("'en' prolazi", () => {
    expect(resolveExportLocale("en")).toBe("en");
  });

  it("nepoznato i prazno padaju na hr", () => {
    expect(resolveExportLocale("hr")).toBe("hr");
    expect(resolveExportLocale(null)).toBe("hr");
    expect(resolveExportLocale("de")).toBe("hr");
  });
});
