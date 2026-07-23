import { z } from "zod";

// CSV import for the election creation wizard (steps 2 + 3). Pure text-in /
// rows-out so it unit-tests without a browser; the client components own the
// FileReader plumbing. ponytail: naive comma split, no quoted-cell support —
// swap in a real CSV parser if users hit quoted commas.

export const CSV_MAX_BYTES = 1024 * 1024; // 1 MB — a voter list is text, not a video

export type CsvFileError = "notCsv" | "tooLarge";

// File-level gate (spec: strict format + size validation) — extension AND
// browser-reported type, before any content is read.
export function validateCsvFile(file: {
  name: string;
  size: number;
  type: string;
}): CsvFileError | null {
  const extOk = /\.csv$/i.test(file.name);
  // Browsers report csv as text/csv, application/vnd.ms-excel, or "" — allow
  // those, reject anything claiming to be something else entirely.
  const typeOk =
    file.type === "" ||
    /^(text\/csv|text\/plain|application\/csv|application\/vnd\.ms-excel)$/.test(
      file.type,
    );
  if (!extOk || !typeOk) return "notCsv";
  if (file.size > CSV_MAX_BYTES) return "tooLarge";
  return null;
}

export const candidateRowSchema = z.object({
  name: z.string().trim().min(1).max(255),
  role: z.string().trim().max(255).optional(),
});
export type CandidateRow = z.infer<typeof candidateRowSchema>;

export const voterRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(255),
});
export type VoterRow = z.infer<typeof voterRowSchema>;

export type CsvParseResult<T> = { rows: T[]; skipped: number };

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

const HEADER_NAME = /^(full[\s_-]?)?name$|^ime/i; // "name", "full name", "ime i prezime"
const HEADER_EMAIL = /mail|pošta/i;

// Step 2 — one candidate per row: `name, role` (role optional).
export function parseCandidatesCsv(text: string): CsvParseResult<CandidateRow> {
  const rows: CandidateRow[] = [];
  let skipped = 0;
  splitLines(text).forEach((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    if (i === 0 && HEADER_NAME.test(cols[0])) return; // header row
    const parsed = candidateRowSchema.safeParse({
      name: cols[0],
      role: cols[1] || undefined,
    });
    if (parsed.success) rows.push(parsed.data);
    else skipped++;
  });
  return { rows, skipped };
}

// Step 3 — one voter per row: `full_name, email` (both required).
export function parseVotersCsv(text: string): CsvParseResult<VoterRow> {
  const rows: VoterRow[] = [];
  let skipped = 0;
  splitLines(text).forEach((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    if (i === 0 && (HEADER_NAME.test(cols[0]) || HEADER_EMAIL.test(cols[1] ?? ""))) {
      return; // header row
    }
    const parsed = voterRowSchema.safeParse({ name: cols[0], email: cols[1] });
    if (parsed.success) rows.push(parsed.data);
    else skipped++;
  });
  return { rows, skipped };
}
