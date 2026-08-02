import "server-only";

import puppeteer, { type Browser } from "puppeteer-core";

// Jedina datoteka koja zna da Puppeteer postoji (election-report-storage-spec §11).
//
// Ne postoji drugi predložak: bezglavi Chromium otvara POSTOJEĆU stranicu pregleda
// i ispisuje je kroz POSTOJEĆI @media print CSS. Knjižnica za PDF značila bi drugi
// put iscrtavanja i drugi izvor istine — greška koju results-view.ts sprječava.
// page.pdf() ionako iscrtava u print mediju, pa su spremljeni PDF i ono što
// administrator sam ispiše isti dokument.

// @sparticuz/chromium nema binarnu datoteku za Windows, pa lokalni razvoj gađa
// instalirani Chrome. Grana ide po VERCEL, NE po NODE_ENV: lokalni `next start`
// također prijavljuje "production" i posegnuo bi za binarnom koje nema.
const onVercel = Boolean(process.env.VERCEL);

// Koliko puta pokušati snimiti list prije odustajanja, i pauza između pokušaja.
const PDF_ATTEMPTS = 4;
const PDF_RETRY_MS = 400;

async function launch(): Promise<Browser> {
  if (onVercel) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = process.env.CHROME_EXECUTABLE_PATH;
  if (!executablePath) {
    // Bez tihog pada: poruka kaže točno što nedostaje.
    throw new Error(
      "Missing CHROME_EXECUTABLE_PATH (dev-only: put an installed Chrome/Chromium binary path in .env.development)",
    );
  }
  return puppeteer.launch({ executablePath, headless: true });
}

/** Ime kolačića → vrijednost, iz sirovog Cookie zaglavlja zahtjeva. */
function parseCookies(header: string): { name: string; value: string }[] {
  return header
    .split(";")
    .flatMap((part) => {
      const eq = part.indexOf("=");
      if (eq < 1) return [];
      return [{ name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() }];
    })
    .filter((c) => c.name.length > 0);
}

/**
 * Iscrtava stranicu pregleda izvještaja u PDF.
 *
 * `cookieHeader` je sirovo Cookie zaglavlje administratorova zahtjeva — bezglavi
 * preglednik bez njega dobije preusmjeravanje na prijavu i snimio bi zaslon
 * prijave. Kolačići se postavljaju po URL-u (dakle vezani za naš host), ne kroz
 * setExtraHTTPHeaders: to zaglavlje ide na SVAKI zahtjev stranice, pa bi našu
 * sesiju poslalo i R2-u s kojeg dolazi logotip organizacije.
 */
export async function renderReportPdf({
  path,
  cookieHeader,
}: {
  /** Putanja s prefiksom lokala, npr. /hr/elections/abc/results/report */
  path: string;
  cookieHeader: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_APP_URL");
  const url = `${base.replace(/\/+$/, "")}${path}`;

  let browser: Browser | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage();

    const { hostname } = new URL(base);
    const cookies = parseCookies(cookieHeader).map((c) => ({
      ...c,
      domain: hostname,
      path: "/",
    }));
    if (cookies.length > 0) await browser.setCookie(...cookies);

    await page.goto(url, { waitUntil: "load", timeout: 30_000 });

    // Sesija koja ne prođe završi na prijavi, a PDF bi bio snimka zaslona
    // prijave — tiho kriv dokument je gori od pada.
    if (!page.url().includes("/results/report")) {
      throw new Error(`Report render was redirected to ${page.url()}`);
    }

    // OVO je nosivi korak, ne kozmetika. Nakon `load` još teku zahtjevi za
    // woff2 podskupovima: preglednik font zatraži tek kad raspoređuje tekst
    // koji ga koristi. page.pdf() ih ne čeka, pa list izađe s podlogama i
    // okvirima, ali BEZ IJEDNOG ZNAKA — izmjereno: 3,4 kB umjesto 147 kB.
    //
    // document.fonts.status u tom trenutku laže "loaded", jer nezatraženi rez
    // nije "u učitavanju". Ni dvostruki requestAnimationFrame ne pomaže —
    // okvir se složi prije nego fontovi stignu. Čeka se mirovanje mreže, koje
    // se prilagođava sporom okruženju umjesto da pogađa konstantu.
    //
    // waitUntil: "networkidle0" bi bio isto, ali on u razvoju nikad ne nastupi
    // (HMR drži websocket otvoren); waitForNetworkIdle broji HTTP zahtjeve.
    await page.waitForNetworkIdle({ idleTime: 200, timeout: 15_000 }).catch(() => {
      // Mirovanje nije nužan uvjet za ispravan list — provjera niže je ta koja
      // odlučuje. Istek ovdje ne smije srušiti render.
    });
    await page.evaluate(() => document.fonts.ready);

    // Snimanje se provjerava, ne pretpostavlja.
    //
    // Skia ugradi podskup fonta čim nacrta ijedan znak, pa je izostanak
    // "FontFile" točan pokazatelj lista bez teksta. Umjesto nagađanja koliko
    // čekati, snimka se ponovi dok ne bude ispravna: page.pdf() je jeftin
    // prema pokretanju preglednika, a tiho prazan dokument je neprihvatljiv.
    for (let attempt = 1; attempt <= PDF_ATTEMPTS; attempt++) {
      const pdf = await page.pdf({
        format: "a4",
        // Bez toga nestanu podloge kartica (uspjeh/upozorenje) — list bi bio bijel.
        printBackground: true,
        // Iste margine kao @page pravilo u globals.css.
        margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
        timeout: 60_000,
      });

      if (Buffer.from(pdf).includes("FontFile")) {
        return pdf as Uint8Array<ArrayBuffer>;
      }
      console.warn(`[pdf] textless capture, retrying (${attempt}/${PDF_ATTEMPTS})`);
      await new Promise((resolve) => setTimeout(resolve, PDF_RETRY_MS));
    }

    // Radije pad, koji ruta pretvori u 500 i poruku, nego dokument bez teksta
    // koji organizacija trajno čuva — i nikad spremljen ključ za takav objekt.
    throw new Error("Report render produced no text (no embedded font subset)");
  } finally {
    // Procesi preglednika prežive zahtjev ako ih se ne zatvori.
    await browser?.close();
  }
}
