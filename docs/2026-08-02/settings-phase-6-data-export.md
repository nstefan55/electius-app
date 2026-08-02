# Profile & Settings Phase 6 — Data Export (GDPR portability)

**Branch:** `feature/settings-data-export` · **Version:** stays 0.9.8 (bump skipped at the owner's request)
**Spec:** `context/features/profile-settings-phase-6-spec.md` (index: `profile-settings-spec.md`)
**Design:** `Settings.dc.html` → "Data export"

A full, machine-readable copy of the organization's data — **GDPR Art. 20 (portability)**, the
sibling of the Art. 17 erasure that phase 4 implements. One button on `/settings` downloads one
JSON document.

No new dependency, no schema change, no server action, no migration.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/organization-export.ts` | **New.** Pure payload builder + the exported types. |
| `src/lib/organization-export.test.ts` | **New.** 17 cases. |
| `src/lib/db/organization.ts` | **New.** `getOrganizationExport` — one org-scoped read. |
| `src/app/api/organization/export/route.ts` | **New.** Streams the JSON with its headers. |
| `src/components/settings/data-export-card.tsx` | **New.** The card. Server component. |
| `src/lib/rate-limit.ts` | `export` limiter — 3/h, keyed on the account. |
| `src/app/[locale]/(app)/settings/page.tsx` | Renders the card between Customizations and Account management. |
| `src/components/settings/account-management-card.tsx` | Restores the delete modal's "consider a data export first" clause. |
| `messages/{hr,en}.json` | `dashboard.settings.export` + `account.modalExport` — 8 lines per locale. |

---

## How it works

```
GET /api/organization/export?locale=hr
  requireSession()          → organizationId + email   (never read from the request)
  checkRateLimit("export")  → keyed on the account
  getOrganizationExport()   → one org-scoped read; the `select` is the boundary
  buildOrganizationExport() → pure; imports every derived number
  Response                  → Content-Disposition: attachment + Cache-Control: no-store
```

The button is a plain `<a href>`. `Content-Disposition` downloads natively, so there is no
fetch → blob → synthetic click, no client component and no loading state.

### Payload shape

```jsonc
{
  "exportedAt": "2026-08-02T15:22:00.189Z",
  "exportVersion": 1,                       // schema version, so a future change is detectable
  "organization": { "name", "type", "contactEmail", "logoUrl", "createdAt" },
  "admin":        { "name", "email", "emailVerified", "isPro", "createdAt" },
  "elections": [{
    "id", "title", "description", "electionType", "votingType", "status",
    "startsAt", "endsAt", "createdAt", "updatedAt",
    "settings": { /* the eight wizard toggles */ },
    "options":  [{ "id", "text", "description", "orderIndex", "votes" }],
    "voters":   [{ "firstName", "lastName", "email", "status", "createdAt" }],
    "votes":    [{ "voteHash", "day", "optionIds" }],
    "results":  { "voters", "votesCast", "turnoutPct", "winner", "quorum", "shares" },
    "archive":  { "merkleRoot", "proofData", "electionData", "expiresAt", "createdAt" } // or null
  }]
}
```

Keys are **stable English in both locales**. The locale query param affects only the filename
suffix (`podaci` / `data`) — a machine-readable document whose schema changes with the UI
language is not portable. `/api/*` sits outside `[locale]`, so there is no next-intl context and
the catalog is imported directly, the precedent every export endpoint already follows.

---

## The four rules that make this safe

**1. The `select` is the boundary, not a filter.** Tokens, `Account.password`, `Session` rows and
Stripe ids are not named in `getOrganizationExport`, so they cannot fall out. Internal pointers
(`reportKey`, `organizationId`, `createdById`, `Vote.batchOrder`, `Vote.id`) are omitted too —
they are infrastructure, meaningless to the recipient, and `batchOrder` describes write order,
which deliberately does not match voting order.

**2. Voters reuse `VoterExportRow`.** The same type the CSV export uses: five safe fields and no
token field, so exporting a magic link is a **compile error**, not a review catch.

**3. Ballots are anonymous because the schema cannot link them.** `Vote` has no `voterId` and no
relation to `Voter` (invariant #1). Nothing in this feature enforces anonymity — the database
already does. That is why the fine print's last sentence is safe to print.

**4. Nothing is recomputed.** `turnoutPct`, `rankCandidates`, `winnerOutcome`, `sharePct` and
`quorumOutcome` are imported from `results-view.ts` / `elections-view.ts` — invariant #5. An
export that disagrees with the results page is worse than no export. Proven live: the file and
the screen read 235 · 200 · 85% · quorum 85%(200)/70%(165) · Ana Kovačević 84 · shares
42-28-19-11 on the same election.

---

## Decisions

### Ballots export a **day**, not a timestamp

The spec asked for each vote's `createdAt`. Shipped as `day` (`YYYY-MM-DD`, UTC) instead.

A per-ballot `(option, millisecond)` pair is exactly the correlation that random `batchOrder` and
the lexicographic Merkle leaf order exist to destroy, and **no screen in the app has ever shown
it** — `getElectionResults` runs `bucketVotesByDay` inside the DB layer specifically so a raw
timestamp never reaches the render tree. Exporting the exact moment would hand back what two
earlier decisions took away.

`optionIds` are sorted for the same reason: the array order out of the junction table must not
say anything about the ballot.

### The ZIP button is **not rendered**

Not disabled, not a toast. A GDPR control that says "coming soon" reads as portability refused.

The spec listed two blockers. One has since lifted — `pdf.service.ts` shipped 2026-08-02 with a
real headless renderer. The other stands: nothing in the stack writes archives (`zlib` compresses
streams, it does not build ZIPs), so a ZIP needs a new dependency. Two caveats survive for
whoever builds it: that renderer only produces a report for `CLOSED` / `ARCHIVED` elections, so a
ZIP can never carry one per election, and a Chromium launch per election needs the background-job
path before a whole-org export is realistic.

The design's fine print claims the ZIP "adds the PDF reports and CSV voter lists". That sentence
was **rewritten, not deferred** — it is a claim about the file's contents, and shipping it as
drawn would have been false on delivery.

### Delivery streams; no signed URL

The prototype toasts "we'll email you a download link". The original reason to reject it was that
no object storage existed. That premise changed (R2 shipped 2026-08-01) and the conclusion did
not: `election-report-storage-spec.md` §8 streams even its private PDFs through the authenticated
route, because a signed URL is a bearer token that outlives the session and survives in browser
history, proxy logs and chat messages. An export carrying every voter name and email in an
organization is the last payload that should get one.

### Rate limit keys the account, not the IP

`ratelimit:export:<email>:<window>` — 3/h. One export is a full table scan of an org, so it needs
a cap; but IP keying punishes the wrong person, and a shared campus IP must not let one admin
lock out another. Email is unique per account, so it is the same identity as the user id.

---

## A trap worth knowing

The builder originally copied `organization` and `admin` with a spread:

```ts
organization: { ...source.organization, createdAt: … }   // ✗
```

**TypeScript does not strip extra runtime properties.** The day someone widens the Prisma
`select` — adding `stripeCustomerId` to the user query, say — the spread exports it, the types
stay green, and no test notices. This is the same lesson the 2026-07-11 audit recorded for the
session PII projection in `(app)/layout.tsx`.

Replaced with field-by-field projection. The test plants sentinel values the types cannot see and
asserts on the **serialized string**; it was mutation-checked, and it does fail when the spread
comes back:

```
× drops fields the payload type does not declare      (with spread)
✓ drops fields the payload type does not declare      (with projection)
```

If you add a field to the payload, add it to the projection — not to a spread.

---

## Closes a phase-4 gap

The delete-account modal deliberately omitted the design's *"consider a data export first"*
sentence, because there was no export to link to. It is back, pointing at the live endpoint —
deletion is the last moment an admin can take their data.

---

## Verification

`npm run test` **407 passing (+17)** · `npm run lint` clean · `npm run build` clean
(`/api/organization/export` resolves ƒ) · **0 console errors**.

Live on the seeded dev DB, signed in, hr + en:

| Check | Result |
| --- | --- |
| Counts vs SQL (development branch) | 22 elections · 3244 voters · 1660 votes · 1 archive — **exact** |
| File ⇄ results page | Reconciles on the quorum-met election, every figure |
| Multi-choice shares | Sum to **130%** — correct; the denominator is ballots cast |
| Ballot keys | Exactly `voteHash · day · optionIds`; **zero** clock time anywhere |
| Voter keys | Exactly the five safe fields |
| Live `voter_tokens.hash` | **Absent** from the downloaded file |
| Sealed election | 64-hex `merkleRoot` + all five `proofData` keys |
| Unsealed election | `archive: null` |
| Cross-org | Sentinel org + election + voter + candidate created live → **invisible** in the export; fixture destroyed, DB SQL-confirmed clean |
| 4th request in an hour | **429** + `Retry-After`, key `ratelimit:export:demo@electius.com:…` |
| No session | 307 → `/hr/login` |
| Apex host | `/hr/settings` → 307 to the dashboard host |
| `/en` | Filename suffix `data`; JSON keys identical English |

**Not verified live, recorded rather than implied:** the tie and zero-candidate winner forms are
unit-tested only (no seeded election has either, and the builder is pure, so a fixture would prove
the same string through a slower path); and a null return from `getOrganizationExport`, which
needs a session whose organization row is missing.

---

## Known ceilings

- **Unbounded read.** `ponytail:` at the query — the whole org in one round trip. Fine at MVP
  scale (Free: 50 voters/election; the seed's 3244 voters produce a 1.1 MB file in well under a
  second). The 300 s function ceiling is the trigger for the emailed-link + background-job path,
  and **the payload shape does not change** when that lands.
- **No ZIP** (above). Voter and results CSVs remain per-election downloads.
- **Requesting admin only.** A colleague's personal data is theirs to export, not yours.

---

## If you touch this next

- Adding a payload field → add it to the projection in `buildElection` / `buildOrganizationExport`
  **and** to the `select`. Never reintroduce a spread.
- Adding a derived number → import it from `results-view.ts` / `elections-view.ts`. If it does not
  exist there yet, put it there, not here.
- Building the ZIP → confirm the dependency first (project package rule), and re-read the two
  caveats above before promising PDFs.
