# Voter List CSV Export

`v0.9.5` · branch `feature/voter-list-csv-export` · spec `context/features/Voter Spec Files/voter-list-csv-export-spec.md`

## What shipped

`GET /api/elections/[id]/voters/export?locale=hr|en` downloads an election's voter roster as CSV. The **Izvezi popis birača** button in the overview Actions card (`/elections/[id]`) now points at it — it was a `comingSoon` toast.

Columns: `Ime · Prezime · E-mail · Status · Dodano`. Header row and status labels are localised; dates are ISO.

| File | Role |
| --- | --- |
| `src/lib/csv.ts` | generic writer — **shared with the results export**, do not fork it |
| `src/lib/voter-export.ts` | this feature's column contract + catalog labels |
| `src/app/api/elections/[id]/voters/export/route.ts` | the handler |
| `src/lib/db/elections.ts` | `getVoterRosterForExport(id, organizationId)` |
| `messages/{hr,en}.json` | new `dashboard.voters` namespace |

## Why a route handler and not a server action

A download *is* its headers — `Content-Type` and `Content-Disposition: attachment`. Server actions return values to React and cannot set response headers, so this could never have been one (`coding-standards.md` → "Use API routes when you need … specific HTTP status codes or headers").

Consequence: `/api/*` sits outside the `[locale]` segment, so there is no next-intl request context. `useTranslations` needs a component and `getTranslations` needs that context, so **the locale arrives as a query param** and the catalogs are imported as plain JSON — the same approach `email.service.ts` already uses for emails.

`resolveExportLocale()` is the single normalisation point. Both the labels and the delimiter read its result; if they normalised separately an unknown locale could produce Croatian labels with an English delimiter.

## Excel encoding — read this before touching lib/csv.ts

Three things in the writer exist solely so the file opens correctly, and every one of them fails silently if removed.

**1. BOM.** UTF-8 has no mandatory signature, so Excel on Windows guesses the legacy codepage and renders `Štefančić` as `Å tefanÄiÄ‡`. `CSV_BOM` (`﻿`, serialises to `EF BB BF`) is what stops that. If you write a test for it, assert on **bytes**, not on `String.startsWith` — the latter only proves the JS string holds it.

**2. Delimiter.** `;` for `hr`, `,` for `en`. Croatian Excel treats `,` as the decimal mark and will not split on it.

**3. `sep=` preamble — the one that is easy to delete by mistake.** The delimiter alone is not sufficient, because **Excel splits on the reader's OS list separator, not on what the file contains**. Any server-side guess at the reader's locale fails on a mismatched machine, and the whole export lands in column A. A first line `sep=;` (after the BOM, matching the actual delimiter) overrides that. Excel and LibreOffice honour it.

It is emitted by `csvPreamble(delimiter)` inside `toCsv`, derived from the delimiter in use, so the two can never drift apart. A test pins that relationship.

**Known cost:** Google Sheets and pandas do not implement `sep=` and will show it as a data row. Accepted — the audience opens these in Excel. The escape hatch is a real `.xlsx`, logged in `post-mvp-feature-list.md`, **not** a different delimiter.

Quoting is RFC 4180: wrap when the value contains the delimiter, a quote, CR or LF; escape a quote by doubling it.

## Security

**Org scoping lives in the WHERE clause**, never in a read-then-check:

```ts
prisma.election.findFirst({ where: { id, organizationId } })
```

A cross-org row is never loaded, so it cannot leak through logs or an error path, and there is no `if` for a future refactor to drop. A missing id and another org's id both produce a bare **404 with an empty body** — deliberately indistinguishable, so the endpoint is not an existence oracle for election IDs.

`requireSession()` guards the route; no session redirects to `/{locale}/login`.

**`Cache-Control: no-store`** — the payload is names and email addresses; no proxy or browser copy.

## Anonymity — the boundary is the `select`, not a comment

Two structural guards, both worth preserving:

- `getVoterRosterForExport`'s Prisma `select` does not request the token or its hash. You cannot leak a value you never fetched.
- `VoterExportRow` (in `voter-export.ts`) declares exactly five fields and no token. Adding one to the export requires **widening the interface first**, which is a visible line in review rather than an autocompleted `select` slipping through.

Exporting *that* a voter voted is intended — the admin needs it to chase non-voters. Exporting *what* they voted is structurally impossible (`Vote` has no `voterId`) and must stay that way: no join through `VoterToken`, no ballot timestamps that could be lined up against `Vote.createdAt`.

## Croatian status labels are gender-neutral on purpose

| Enum | hr | en |
| --- | --- | --- |
| `PENDING` | Na čekanju | Pending |
| `INVITED` | Pozivnica poslana | Invited |
| `VOTED` | Glas predan | Voted |

These sit beside a real person's name in a spreadsheet, where `Ana Horvat … Glasao` misgenders the reader. The labels describe the **invitation** and the **ballot** instead of the person, which sidesteps it at zero cost.

They live in `dashboard.voters.status` — a namespace deliberately shared with the not-yet-built voter-management roster, so the table and the export can never disagree. **Reuse them there; do not add a second set.**

## Testing

32 Vitest cases across `csv.test.ts` and `voter-export.test.ts` — 154 in the suite. The builder is a pure `rows → string` function precisely so it tests without a server or a DB; the route stays thin enough to read.

Covered: BOM present · `sep=` matches the delimiter · quoting a field containing the delimiter, a quote, both at once, and a newline · null names as empty cells with no `"null"` · all three status labels · both locales · slugify against Croatian diacritics, `đ`, `/`, and a punctuation-only title · filename fallback.

Verified live against the seeded dev DB (Playwright, signed-in session): byte-level `ef bb bf 73 65 70 3d 3b`, 287 lines = preamble + header + 285 voters matching the DB, no token/hash substring, both locales, unknown id → 404, **cross-org id → 404 with an empty body** (proven by temporarily reassigning the election to a second org and restoring it), no session → 307, 0 console errors.

## Known gaps

- **The voters-facet button is not built.** The spec claims one on `/elections/[id]/voters` too, but that page is still `FacetScaffold` — it lands with `voter-management-spec`. The endpoint is ready for it.
- **`findMany` is unbounded.** Fine at MVP scale (Free caps 50 voters/election, the seed's largest is 285); paginate or stream if Pro rosters reach thousands. Marked `ponytail:` at the query.
- **No export audit trail.** Deferred to the archive/audit spec, which owns "who did what to this election".
- **`src/lib/wizard-csv.ts` still splits naively on commas** when *importing*. Same class of bug, opposite direction — a voter or candidate whose name contains a comma breaks on upload. Deliberately not bundled here (parser vs writer, no shared code); own branch `fix/wizard-csv-quoted-cells`.
- **`.xlsx` export** — see `post-mvp-feature-list.md`.
