# Wizard CSV — Quoted Cells & Delimiter Detection

`v0.9.5` (unchanged, deliberate) · branch `fix/wizard-csv-quoted-cells` · spec `context/fixes/wizard-csv-quoted-cells-spec.md`

Sibling of the voter-list CSV **export** (same day, v0.9.5). That feature built a correct RFC 4180 *writer*; this fix builds the matching *reader*. Same bug class, opposite direction.

## What was broken

The wizard's CSV import split every row with `line.split(",")`. Three silent failures, all reproduced against the live parser before any code changed:

| Input | Before | Severity |
| --- | --- | --- |
| `"Kovačević, Ana",President` (step 2) | name `"Kovačević`, role `Ana"`, **`skipped: 0`** | **Silent corruption** — a mangled name reaches the ballot and nothing warns |
| `"Kovačević, Ana",ana@unizg.hr` (step 3) | `rows: []`, `skipped: 1` | Voter dropped, no reason surfaced |
| The app's own **hr** voter export, re-imported | `rows: []`, `skipped: 3` | Export → import round trip completely dead |

Row 1 is the worst of the three. A skipped row at least shows up in the count the wizard displays; a corrupted one is imported, looks fine, and ends up on a real ballot.

## What changed

Two source files. **No new dependency** — the tokenizer is ~25 lines.

| File | Change |
| --- | --- |
| `src/lib/csv.ts` | **+ the reader**: `parseCsv`, `detectDelimiter`, `stripBom`, `readCsv`. Writer untouched |
| `src/lib/wizard-csv.ts` | `splitLines` deleted; both parsers go through `readCsv`; voters gained header-driven column mapping |
| `src/lib/csv.test.ts` | tokenizer + delimiter + writer↔reader round trip |
| `src/lib/wizard-csv.test.ts` | domain cases + both export round trips |

Call sites (`step-candidates.tsx`, `step-voters.tsx`, `CsvDropZone`) needed **zero edits** — `CsvParseResult<T>` is unchanged.

## Why the reader lives next to the writer

`csvField()` escapes and `parseCsv()` unescapes. They are inverses of one spec, so they live in one file — a change to the escaping rules that breaks the inverse now fails a test immediately instead of surfacing in a user's import months later.

The test that enforces it is the most valuable one in the file:

```ts
for (const d of [";", ","]) expect(readCsv(toCsv(rows, d))).toEqual(rows);
```

The counter-argument (export is a server-side path, import is client-side, keep them apart) was considered and rejected. Cohesion of the format rules won.

## The tokenizer — three rules worth knowing before you touch it

**1. Escape check before close check.** Inside a quoted field, `"` is ambiguous. Reversed order reads `""` as "close, then reopen" and splits `Ana ""Anči"" Horvat` in half. This ordering is the whole reason the fix works:

```ts
if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; continue; } // escape
if (ch === '"') { quoted = false; continue; }                          // close
```

**2. A quote only opens a field when the field is still blank.** So `Ivo "Ivica,i@b.hr` treats the quote as a letter rather than swallowing the rest of the file. One rule, zero lookahead, and it covers the most common malformed input there is — a stray quote inside a name.

**3. `lastQuote` is computed once.** When an unterminated quote runs into a newline, the parser must decide whether that newline is data (RFC allows newlines inside quotes) or a broken row. `text.lastIndexOf('"')` is taken once, up front, so the check `i > lastQuote` is O(1). Doing it as a rescan per newline would go quadratic on a hostile 1 MB file.

**Deliberate divergence from RFC 4180:** an unterminated quote ends its row rather than running to EOF. Spec-pure behaviour would absorb every following voter into one cell and report `skipped: 1` while dozens vanished. Losing one row loudly beats losing fifty quietly.

## Header-driven column mapping (voters)

The round trip needed more than delimiter detection. The hr export is five columns:

```
sep=;
Ime;Prezime;E-mail;Status;Dodano
Ana;Kovačević;ana@unizg.hr;Glas predan;2026-07-01
```

The importer read positionally (`[0]=name, [1]=email`), so with `;` detection alone it would produce `email = "Kovačević"` and skip every row — fixed-looking, still broken. The rule now:

- **email** = the header cell matching `/mail|pošta/` that has no `@`
- **name** = every column before it, joined by a space (`Ime` + `Prezime` → `Ana Kovačević`)
- **no header** → positional fallback, exactly as before

`Status` and `Dodano` are ignored; the wizard sets those itself on a fresh election. Works for hr and en exports and for a hand-written two-column file.

## Bonus fix — gmail addresses were eaten as headers

Old header detection tested `/mail|pošta/i` against the second cell. That matches `ana@gmail.com`. A headerless file whose **first voter used gmail, hotmail or any `…mail…` domain lost that voter silently.** Pre-existing, unrelated to quotes, found while rewriting the detection, same silent-loss class — so it was fixed here rather than logged.

A header cell must now lack `@`. Pinned by `prvi birač s gmail adresom nije zaglavlje`.

## Other behaviour changes

- **Blank rows no longer count as skipped.** A trailing `;;;;` line from Excel is dropped instead of reported as an error. Previously it inflated the skipped tally.
- **BOM.** `stripBom` runs regardless of whether `FileReader.readAsText` already removed it — it is idempotent, so both answers are safe. A BOM left on the first cell would defeat header detection and demote the header to a data row.
- **`sep=` preamble is consumed and is authoritative** for the delimiter when present. Without it, the delimiter is whichever of `,` / `;` appears more often outside quotes on the first non-empty line, comma on a tie.

## Verification

- `npm run test` — **180/180** (59 in the two CSV files, 21 of them new)
- `npm run build` — clean
- All three original failures re-run through the real parser after the fix:

```
candidates:    {"rows":[{"name":"Kovačević, Ana","role":"President"}],"skipped":0}
voters:        {"rows":[{"name":"Kovačević, Ana","email":"ana@unizg.hr"}],"skipped":0}
hr round-trip: {"rows":[{"name":"Ana Kovačević","email":"ana@unizg.hr"}],"skipped":0}
```

**Not verified in the browser.** The change is pure `lib/` with unit coverage on every path, and the `FileReader` → `onText` plumbing above it was not touched. If you want belt-and-braces, drop a CSV containing `"Kovačević, Ana",ana@unizg.hr` on wizard step 3 and confirm the voter appears with the comma intact.

## Known ceilings

- A quoted field containing `\r\n` reads back with the `\r` retained; the writer only ever emits `\n` inside cells, so the round trip is unaffected. Irrelevant for names and emails.
- `detectDelimiter` reads the first non-empty line. A file whose very first cell is a quoted multi-line value could mis-count. Not reachable from any export this app produces.
- Tab-delimited files, `.xlsx`, and user-mapped columns remain out of scope. `.xlsx` is in `post-mvp-feature-list.md`.
