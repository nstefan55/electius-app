# Excel CSV Import: Tab Delimiter and Legacy Encodings

**Version:** 0.9.85 · **Branch:** `claude/test-fixture-email-addresses-pu2onm` · **Date:** 2026-09-30

A voter file saved from Excel was rejected with "No valid rows found. Each row needs a full name and a
valid email." even though every row had both. Two things were wrong, both in reading the file, not in
validating it.

No migration, no new dependency, no message change.

---

## Why every row was rejected

The file was Excel's **Text (Tab delimited)** saved with a `.csv` name, in the Windows code page:

| Byte-level fact | What the importer did |
| --- | --- |
| Columns separated by TAB | `detectDelimiter` only counted `,` and `;`, fell back to `,`, so each line became one cell `full_name\temail` |
| Header cell `full_name\temail` contains "mail" | `HEADER_EMAIL` put the email column at index 0, leaving the name empty, so `voterRowSchema` rejected every row |
| `Š` stored as `0x8A` (windows-1252/1250) | `FileReader.readAsText` decodes as UTF-8, so `Š` became `�` |

Result before the fix: `{ rows: [], skipped: 5 }`.

---

## The fix

`src/lib/csv.ts`

- **`detectDelimiter`** also counts TAB outside quotes. TAB wins ties, because a spreadsheet cell
  almost never contains a tab while a name often contains a comma (`Horvat, Ana`). With no TAB the old
  rule is unchanged (`;` only if it outnumbers `,`).
- **`decodeCsv(bytes)`** (new) turns raw bytes into text: a UTF-16 LE/BE BOM decodes as UTF-16
  (Excel's **Unicode Text**); otherwise it tries strict UTF-8; anything that is not valid UTF-8 is
  read as **windows-1250**. That is the Central European code page Croatian Excel writes, and it agrees
  with western windows-1252 on `Š Ž š ž`.

`src/components/elections/wizard/wizard-shared.tsx`: `CsvDropZone` reads `file.arrayBuffer()` and
passes it through `decodeCsv` instead of `readAsText`. The drop zone is shared, so the fix covers the
wizard's candidate and voter steps and the "add voters" dialog.

**Not recoverable:** Excel's western "Text (Tab delimited)" has no `č ć đ`, so it writes them as a
literal `?` when saving. The import now keeps those rows (the name is non-empty) but cannot restore the
letters. For a clean file, save as **CSV UTF-8** in Excel.

---

## Fixtures

`fixtures/voters/` holds real files that tests read as bytes, the same way the drop zone does. Both can
be uploaded by hand through the wizard or the "add voters" dialog.

| File | Contents |
| --- | --- |
| `excel-tab-windows-1252.csv` | The original failing file, byte for byte: TAB, CRLF, windows-1252, 5 voters |
| `voters-420.csv` | UTF-8 with BOM, comma, CRLF, header `full_name,email`. 420 voters: 419 on `@example.com` (Croatian names with diacritics, unique addresses) and one `test@electius.com` (last row) |

`voters-420.csv` is above the Free cap (50) and within Pro (500), so it also exercises the `voterCap`
rejection on a Free organization.

**Do not start an election that uses `voters-420.csv`.** Starting sends a real invitation through
Resend to every voter, and there is no dry-run path. `example.com` accepts no mail (reserved, null MX),
so 419 sends would bounce and count against the sending domain's reputation. Use this file for import,
roster and cap testing. For an end-to-end send, use a small list of addresses you control, or Resend's
`delivered@resend.dev`.

---

## Tests

- `csv.test.ts`: TAB detection (plain, quoted, tie with a comma or semicolon in the name, stray TAB
  in a comma file), `readCsv` on TAB, `decodeCsv` for UTF-8 with and without BOM, the windows-1250
  fallback, UTF-16 LE and BE, and empty input.
- `wizard-csv.test.ts`: both fixture files go through `decodeCsv` and then `parseVotersCsv`. Zero
  skipped, the expected addresses, no `�`, and for the 420 file: 419 plus 1 with no duplicates.

Mutation-checked: removing TAB detection fails 4 tests, and decoding as plain UTF-8 fails 2.
