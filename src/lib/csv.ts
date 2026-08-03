// Zajednički CSV zapisivač — isti za sve izvoze (popis birača, rezultati).
// Namjerno bez `server-only`: čist rad sa stringovima, pa je testabilan.

// Bez BOM-a Excel na Windowsu razbija hrvatske dijakritike.
export const CSV_BOM = "\uFEFF";

export type ExportLocale = "hr" | "en";

// Hrvatski Excel dijeli po `;` — zarez mu je decimalni znak.
export function delimiterFor(locale: ExportLocale): string {
  return locale === "hr" ? ";" : ",";
}

// Excel, LibreOffice i Sheets izvrše ćeliju koja počinje ovim znakovima. Ime
// kandidata i birača piše administrator, a izvoz otvara revizor.
// Navodnici NE pomažu — `"=1+1"` se svejedno izvrši.
const FORMULA_START = /^[=+\-@\t\r]/;

// RFC 4180: navodnici oko polja s razdjelnikom, navodnikom ili novim redom;
// ugrađeni navodnik se udvostručuje.
function csvField(value: string, delimiter: string): string {
  // Apostrof je oznaka teksta: formula se prikaže, ne izvrši.
  const v = FORMULA_START.test(value) ? `'${value}` : value;
  return /["\r\n]/.test(v) || v.includes(delimiter)
    ? `"${v.replace(/"/g, '""')}"`
    : v;
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

// Ime datoteke BEZ nastavka. Dijele ga CSV izvoz i PDF izvještaj: kod ispisa u
// PDF preglednik predlaže ime iz document.title, pa je naslov stranice jedina
// poluga koju imamo nad imenom spremljene datoteke.
export function exportFilename(
  title: string,
  suffix: string,
  date: Date,
): string {
  // Naslov od same interpunkcije daje prazan slug.
  return `${slugify(title) || "export"}-${suffix}-${csvDate(date)}`;
}

export function csvFilename(title: string, suffix: string, date: Date): string {
  return `${exportFilename(title, suffix, date)}.csv`;
}

// ───────────────────────────────────────────────────────────────────────────
// Čitanje — obrnuto od csvField(). Ista pravila u istoj datoteci, pa se zapis
// i čitanje ne mogu raziću.

// Excel piše BOM; FileReader ga obično makne, ali ne uvijek.
export function stripBom(text: string): string {
  return text.startsWith(CSV_BOM) ? text.slice(1) : text;
}

// Bez `sep=` retka: broji razdjelnike izvan navodnika u prvom retku sa sadržajem.
export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  let quoted = false;
  let comma = 0;
  let semi = 0;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (ch === ",") comma++;
    else if (ch === ";") semi++;
  }
  return semi > comma ? ";" : ",";
}

// Inverz oznake teksta iz csvField(). Apostrof se miče samo ispred okidača
// formule, pa apostrof u pravom podatku ostaje netaknut.
function unescapeFormula(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1))
    ? value.slice(1)
    : value;
}

// RFC 4180 tokenizer. Vraća neobrezane ćelije; prazni retci otpadaju.
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Iza zadnjeg navodnika nema zatvaranja — tu se neispravan red prekida.
  const lastQuote = text.lastIndexOf('"');

  const endField = () => {
    row.push(unescapeFormula(field));
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      // Provjera para ide PRIJE zatvaranja: inače `""` znači kraj pa novo
      // otvaranje, i ime se raspolovi.
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        continue;
      }
      // Iza ove pozicije nema više navodnika, dakle nema ni zatvaranja: red je
      // neispravan. Prekini njega, ne cijelu datoteku.
      if (ch === "\n" && i > lastQuote) {
        quoted = false;
        endRow();
        continue;
      }
      field += ch; // razdjelnik i \n su ovdje obični znakovi
      continue;
    }

    // Navodnik otvara polje samo na njegovom početku; usred teksta je slovo.
    if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
      continue;
    }
    if (ch === delimiter) {
      endField();
      continue;
    }
    if (ch === "\n") {
      endRow();
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

// Jedini ulaz za uvoz: makne BOM, pojede `sep=` redak, odredi razdjelnik.
export function readCsv(text: string): string[][] {
  const t = stripBom(text);
  const sep = t.match(/^sep=(.)\r?\n/);
  if (sep) return parseCsv(t.slice(sep[0].length), sep[1]);
  return parseCsv(t, detectDelimiter(t));
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
