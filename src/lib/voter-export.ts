import { csvDate, toCsv, type ExportLocale } from "@/lib/csv";
import { resolveLocale } from "@/i18n/config";
import hr from "../../messages/hr.json";
import en from "../../messages/en.json";

// Stupci CSV izvoza popisa birača; zapisivač je u lib/csv.ts.

// Namjerno usko: nema tokena ni hasha, pa je izvoz poveznice greška tipa,
// a ne propust u pregledu koda.
export interface VoterExportRow {
  firstName: string | null;
  lastName: string | null;
  email: string;
  status: "PENDING" | "INVITED" | "VOTED";
  createdAt: Date;
}

export interface VoterExportLabels {
  headers: string[];
  status: Record<VoterExportRow["status"], string>;
  fileSuffix: string;
}

// Čisto: retci unutra, datoteka van — sve ovisno o jeziku dolazi kao argument.
export function buildVoterCsv(
  voters: VoterExportRow[],
  labels: VoterExportLabels,
  delimiter: string,
): string {
  const rows = [
    labels.headers,
    ...voters.map((v) => [
      // Oba imena su nullable — prazna ćelija, nikad "null".
      v.firstName ?? "",
      v.lastName ?? "",
      v.email,
      labels.status[v.status] ?? v.status,
      csvDate(v.createdAt),
    ]),
  ];
  return toCsv(rows, delimiter);
}

const CATALOGS = { hr, en } as const;

// Route handleri su izvan next-intl konteksta, pa se katalozi čitaju izravno
// (isto kao email.service.ts).
export function voterExportLabels(locale: ExportLocale): VoterExportLabels {
  const c = CATALOGS[locale].dashboard.voters;
  return {
    headers: [
      c.export.firstName,
      c.export.lastName,
      c.export.email,
      c.export.status,
      c.export.added,
    ],
    status: c.status,
    fileSuffix: c.export.fileSuffix,
  };
}

// Jedno mjesto normalizacije — oznake i razdjelnik se ne mogu razići.
// Delegira na resolveLocale: isto pravilo sada čita i izvoz i pošta, pa se ne
// mogu razići (invarijanta #5). Ime ostaje jer opisuje ulaz (?locale iz URL-a).
export function resolveExportLocale(raw: string | null): ExportLocale {
  return resolveLocale(raw);
}
