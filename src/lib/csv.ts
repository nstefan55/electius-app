// Zajednički CSV zapisivač — isti za sve izvoze (popis birača, rezultati).
// Namjerno bez `server-only`: čist rad sa stringovima, pa je testabilan.

// Bez BOM-a Excel na Windowsu razbija hrvatske dijakritike.
export const CSV_BOM = "\uFEFF";

export type ExportLocale = "hr" | "en";

// Hrvatski Excel dijeli po `;` — zarez mu je decimalni znak.
export function delimiterFor(locale: ExportLocale): string {
  return locale === "hr" ? ";" : ",";
}

// RFC 4180: navodnici oko polja s razdjelnikom, navodnikom ili novim redom;
// ugrađeni navodnik se udvostručuje.
function csvField(value: string, delimiter: string): string {
  return /["\r\n]/.test(value) || value.includes(delimiter)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

// `sep=` u prvom retku govori Excelu i LibreOfficeu koji je razdjelnik, bez
// obzira na postavke sustava — inače datoteka završi u jednom stupcu kad se
// razdjelnik i lokalni popisni znak raziđu.
// ponytail: Google Sheets i pandas ovaj redak prikažu kao podatak; ako zasmeta,
// rješenje je pravi .xlsx, ne drugi razdjelnik.
export function csvPreamble(delimiter: string): string {
  return `${CSV_BOM}sep=${delimiter}\r\n`;
}

export function toCsv(rows: string[][], delimiter: string): string {
  const body = rows
    .map((row) => row.map((cell) => csvField(cell, delimiter)).join(delimiter))
    .join("\r\n");
  return csvPreamble(delimiter) + body;
}

// ISO datum — jednoznačan i ispravno se sortira kao tekst.
export function csvDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Naslov izbora može imati `/`, navodnike i dijakritike — ništa od toga ne ide
// u ime datoteke. Rezultat je uvijek [a-z0-9-].
export function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // makni dijakritike
      // đ nije d + dijakritik, NFD ga ne rastavlja.
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
  );
}

export function csvFilename(title: string, suffix: string, date: Date): string {
  // Naslov od same interpunkcije daje prazan slug.
  return `${slugify(title) || "export"}-${suffix}-${csvDate(date)}.csv`;
}

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // slugify jamči ASCII ime, pa filename* nije potreban.
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Sadržaj je osobni podatak — bez keširanja.
      "Cache-Control": "no-store",
    },
  });
}
