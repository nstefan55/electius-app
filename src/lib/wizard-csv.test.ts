import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCsv } from "./csv";
import {
  CSV_MAX_BYTES,
  dedupeVoterRows,
  parseCandidatesCsv,
  parseVotersCsv,
  toVoterFields,
  validateCsvFile,
} from "./wizard-csv";

describe("validateCsvFile", () => {
  it("accepts a normal csv file", () => {
    expect(
      validateCsvFile({ name: "voters.csv", size: 1000, type: "text/csv" }),
    ).toBeNull();
  });

  it("accepts an empty browser-reported type", () => {
    expect(validateCsvFile({ name: "a.CSV", size: 10, type: "" })).toBeNull();
  });

  it("rejects wrong extension and wrong mime type", () => {
    expect(
      validateCsvFile({ name: "voters.xlsx", size: 10, type: "text/csv" }),
    ).toBe("notCsv");
    expect(
      validateCsvFile({ name: "voters.csv", size: 10, type: "image/png" }),
    ).toBe("notCsv");
  });

  it("rejects oversized files", () => {
    expect(
      validateCsvFile({
        name: "big.csv",
        size: CSV_MAX_BYTES + 1,
        type: "text/csv",
      }),
    ).toBe("tooLarge");
  });
});

describe("parseCandidatesCsv", () => {
  it("parses name + optional role and skips the header row", () => {
    const { rows, skipped } = parseCandidatesCsv(
      "name, role\nAna Kovačević, 3rd year Law\nMarko Horvat\n",
    );
    expect(rows).toEqual([
      { name: "Ana Kovačević", role: "3rd year Law" },
      { name: "Marko Horvat", role: undefined },
    ]);
    expect(skipped).toBe(0);
  });

  it("counts rows with no name as skipped", () => {
    const { rows, skipped } = parseCandidatesCsv("Ana,x\n , role-only\nMarko");
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Marko"]);
    expect(skipped).toBe(1);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCandidatesCsv("")).toEqual({ rows: [], skipped: 0 });
  });
});

describe("parseVotersCsv", () => {
  it("requires both a name and a valid email", () => {
    const { rows, skipped } = parseVotersCsv(
      "full_name, email\nPetra Novak, petra@unizg.hr\nNo Email,\n, orphan@x.hr\nLuka Marić, not-an-email",
    );
    expect(rows).toEqual([{ name: "Petra Novak", email: "petra@unizg.hr" }]);
    expect(skipped).toBe(3);
  });

  it("detects a header by the email column too", () => {
    const { rows } = parseVotersCsv(
      "voter, e-mail\nSara Jurić, sara@unizg.hr",
    );
    expect(rows).toEqual([{ name: "Sara Jurić", email: "sara@unizg.hr" }]);
  });

  it("handles CRLF line endings", () => {
    const { rows } = parseVotersCsv("Ana,a@b.hr\r\nIvo,i@b.hr\r\n");
    expect(rows).toHaveLength(2);
  });
});

// ─── fix/wizard-csv-quoted-cells ───────────────────────────────────────────

describe("navedene ćelije", () => {
  it("kandidat sa zarezom u imenu se ne kvari", () => {
    // Prije: ime '"Kovačević', uloga 'Ana"', skipped 0 — tiha korupcija.
    expect(parseCandidatesCsv('"Kovačević, Ana",Predsjednica')).toEqual({
      rows: [{ name: "Kovačević, Ana", role: "Predsjednica" }],
      skipped: 0,
    });
  });

  it("birač sa zarezom u imenu se ne gubi", () => {
    expect(parseVotersCsv('"Kovačević, Ana",ana@unizg.hr')).toEqual({
      rows: [{ name: "Kovačević, Ana", email: "ana@unizg.hr" }],
      skipped: 0,
    });
  });

  it("nadimak u navodnicima ostaje u imenu", () => {
    const { rows } = parseCandidatesCsv('"Ana ""Anči"" Horvat",Studentica');
    expect(rows[0].name).toBe('Ana "Anči" Horvat');
  });

  it("nezatvoren navodnik preskoči svoj red, ostali prolaze", () => {
    const { rows, skipped } = parseVotersCsv(
      'Ana,a@b.hr\n"Ivo,i@b.hr\nMara,m@b.hr',
    );
    expect(rows.map((r) => r.email)).toEqual(["a@b.hr", "m@b.hr"]);
    expect(skipped).toBe(1);
  });
});

describe("razdjelnik i zaglavlje", () => {
  it("čita datoteku s točkazarezom", () => {
    const { rows } = parseVotersCsv("Ime;E-mail\nAna Kovačević;ana@unizg.hr");
    expect(rows).toEqual([{ name: "Ana Kovačević", email: "ana@unizg.hr" }]);
  });

  it("prvi birač s gmail adresom nije zaglavlje", () => {
    // Prije: HEADER_EMAIL je pogodio "mail" u adresi i pojeo redak.
    const { rows } = parseVotersCsv("Ana,ana@gmail.com\nIvo,i@b.hr");
    expect(rows.map((r) => r.email)).toEqual(["ana@gmail.com", "i@b.hr"]);
  });

  it("BOM ne obori prepoznavanje zaglavlja", () => {
    const { rows, skipped } = parseVotersCsv(
      "﻿full_name,email\nAna,a@b.hr",
    );
    expect(rows).toEqual([{ name: "Ana", email: "a@b.hr" }]);
    expect(skipped).toBe(0);
  });
});

// Izvoz popisa birača (5 stupaca) mora se moći uvesti natrag.
describe("kružni tok s izvozom", () => {
  const hrExport =
    "﻿sep=;\r\nIme;Prezime;E-mail;Status;Dodano\r\n" +
    "Ana;Kovačević;ana@unizg.hr;Glas predan;2026-07-01\r\n" +
    "Ivo;;ivo@unizg.hr;Na čekanju;2026-07-02";

  const enExport =
    "﻿sep=,\r\nFirst name,Last name,Email,Status,Added\r\n" +
    "Ana,Kovačević,ana@unizg.hr,Voted,2026-07-01";

  it("hr izvoz: ime i prezime se spoje, e-mail se nađe po zaglavlju", () => {
    expect(parseVotersCsv(hrExport)).toEqual({
      rows: [
        { name: "Ana Kovačević", email: "ana@unizg.hr" },
        { name: "Ivo", email: "ivo@unizg.hr" },
      ],
      skipped: 0,
    });
  });

  it("en izvoz prolazi jednako", () => {
    expect(parseVotersCsv(enExport)).toEqual({
      rows: [{ name: "Ana Kovačević", email: "ana@unizg.hr" }],
      skipped: 0,
    });
  });
});

// Prave datoteke iz fixtures/voters — bajtovi idu kroz decodeCsv kao u
// CsvDropZone, ne kroz string koji je test već ispravno dekodirao.
describe("fixture datoteke", () => {
  const load = (name: string) =>
    parseVotersCsv(
      decodeCsv(readFileSync(join(process.cwd(), "fixtures", "voters", name))),
    );

  it("Excel TAB + windows-1252: svi birači prolaze", () => {
    // Prije: 0 redaka, 5 preskočeno — "Nema valjanih redaka".
    const { rows, skipped } = load("excel-tab-windows-1252.csv");
    expect(skipped).toBe(0);
    expect(rows.map((r) => r.email)).toEqual([
      "ana.kovacevic@example.com",
      "ana.horvat@example.com",
      "nikola.batinovic@example.com",
      "juraj.cinkovic@example.com",
      "test@electius.com",
    ]);
    // Š je preživio (0x8A); č i ć je Excel već spremio kao "?" — to se ne
    // može vratiti, ali ne smije postati ni �.
    expect(rows[4].name).toBe("Nikola Štefan?i?");
    expect(rows.every((r) => !r.name.includes("�"))).toBe(true);
  });

  it("voters-420: 419 na example.com i jedan test@electius.com", () => {
    const { rows, skipped } = load("voters-420.csv");
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(420);
    expect(dedupeVoterRows(rows)).toHaveLength(420);
    expect(rows.filter((r) => r.email.endsWith("@example.com"))).toHaveLength(
      419,
    );
    expect(rows.filter((r) => r.email === "test@electius.com")).toEqual([
      { name: "Nikola Štefančić", email: "test@electius.com" },
    ]);
  });
});

// Oba pravila dijele čarobnjak i naknadno dodavanje birača. Testovi stoje uz
// shemu jer bi ih inače nadzirala samo dva testa radnji, svaki sa svoje strane.
describe("dedupeVoterRows", () => {
  const row = (email: string, name = "Ana Kovačević") => ({ name, email });

  it("uklanja duplikat unutar samog unosa", () => {
    const rows = [row("a@x.hr"), row("a@x.hr"), row("b@x.hr")];
    expect(dedupeVoterRows(rows)).toEqual([row("a@x.hr"), row("b@x.hr")]);
  });

  it("usporedba ne razlikuje velika i mala slova", () => {
    expect(dedupeVoterRows([row("Ana@X.hr"), row("ana@x.HR")])).toHaveLength(1);
  });

  it("filtrira i prema adresama koje su već u bazi", () => {
    const kept = dedupeVoterRows([row("a@x.hr"), row("b@x.hr")], ["A@X.hr"]);
    expect(kept).toEqual([row("b@x.hr")]);
  });

  it("bez postojećih adresa zadržava sve jedinstvene retke", () => {
    expect(dedupeVoterRows([row("a@x.hr"), row("b@x.hr")])).toHaveLength(2);
  });
});

describe("toVoterFields", () => {
  it("prva riječ je ime, ostatak prezime", () => {
    const f = toVoterFields({ name: "Ana Marija Kovačević", email: "a@x.hr" });
    expect(f).toEqual({
      email: "a@x.hr",
      firstName: "Ana",
      lastName: "Marija Kovačević",
    });
  });

  it("jedna riječ ostavlja prezime praznim, ne praznim nizom", () => {
    expect(toVoterFields({ name: "Ana", email: "a@x.hr" })).toEqual({
      email: "a@x.hr",
      firstName: "Ana",
      lastName: null,
    });
  });

  it("ne nosi electionId — njega dopisuje pozivatelj", () => {
    const keys = Object.keys(toVoterFields({ name: "Ana", email: "a@x.hr" }));
    expect(keys.sort()).toEqual(["email", "firstName", "lastName"]);
  });
});
