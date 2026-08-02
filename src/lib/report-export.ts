import type { ResultsAccess } from "./elections-view";
import { exportFilename, type ExportLocale } from "./csv";

// Čiste odluke oko spremljenog PDF izvještaja (election-report-storage-spec).
// Bez Prisme, bez R2, bez Puppeteera — da se mogu testirati bez poslužitelja,
// isto kao voter-export.ts i results-export.ts.

/** Nastavak imena datoteke po jeziku; dijele ga naslov stranice i preuzimanje. */
export const REPORT_SUFFIX: Record<ExportLocale, string> = {
  hr: "izvjestaj",
  en: "report",
};

/**
 * Smije li se izvještaj spremiti.
 *
 * `access === "closed"` JEST uvjet pohrane (D2/D4): od zatvaranja nadalje podaci
 * su zamrznuti — glas se više ne može predati, opcije se ne mijenjaju i nijedan
 * put ne vraća izbore u ACTIVE. Nema drugog popisa statusa koji bi se razišao s
 * onim koji odlučuje smije li se zbroj uopće vidjeti.
 */
export const isStorable = (access: ResultsAccess | null): boolean =>
  access === "closed";

/**
 * Ključ objekta u privatnoj kanti.
 *
 * Ne prima ime datoteke: prelazak putanjom, sudari imena i osobni podaci u
 * ključu tako ne mogu ni nastati — nije provjera, nego konstrukcija.
 */
export const reportObjectKey = (electionId: string): string =>
  `reports/${electionId}/${crypto.randomUUID()}.pdf`;

/** Ime preuzete datoteke — isti korijen kao naslov stranice i CSV izvozi. */
export const reportFilename = (
  title: string,
  locale: ExportLocale,
  at: Date,
): string => `${exportFilename(title, REPORT_SUFFIX[locale], at)}.pdf`;

/**
 * Smije li se poslužiti spremljeni objekt umjesto novog iscrtavanja.
 *
 * Prvo iscrtavanje pobjeđuje (D7): zahtjev na drugom jeziku iscrtava svježe i NE
 * sprema se. Dokument koji bi se tiho promijenio nije dokaz o obavljenom poslu.
 */
export const canServeStored = ({
  storable,
  reportKey,
  reportLocale,
  locale,
}: {
  storable: boolean;
  reportKey: string | null;
  reportLocale: string | null;
  locale: ExportLocale;
}): boolean => storable && reportKey !== null && reportLocale === locale;

/** Sprema li se ovaj render. Samo prvi put — postojeći ključ se ne prepisuje. */
export const shouldStore = ({
  storable,
  reportKey,
}: {
  storable: boolean;
  reportKey: string | null;
}): boolean => storable && reportKey === null;
