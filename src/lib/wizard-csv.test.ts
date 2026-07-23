import { describe, expect, it } from "vitest";
import {
  CSV_MAX_BYTES,
  parseCandidatesCsv,
  parseVotersCsv,
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
