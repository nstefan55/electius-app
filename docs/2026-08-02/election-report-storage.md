# Election Report — Server Rendering & R2 Storage

**Branch:** `feature/election-report-storage` · **Version:** stays **0.9.8** (bump skipped at user request)
**Spec:** `context/features/election-report-storage-spec.md` (designed 2026-07-31)
**Supersedes:** `archive-seal-follow-ups-spec.md` thread 3

The PDF report at `/elections/[id]/results/report` was **print-first**: the browser's print engine made
the PDF, so no server-side file ever existed. This adds a real server render and stores the result in
Cloudflare R2 — but **only once an election is over**, so a stored report can never be a snapshot of a
race still being run.

**New dependencies:** `puppeteer-core` (~350 KB) + `@sparticuz/chromium` (~50 MB, Vercel-only binary).
`@aws-sdk/client-s3` was **not** needed — `aws4fetch` already ships and already signs SigV4.

---

## What shipped

| File | Change |
| --- | --- |
| `prisma/schema.prisma` + migration `20260802100644_add_election_report_storage` | `Election` **+3** (`reportKey`, `reportGeneratedAt`, `reportLocale`); `Archive` **−4** (`fileUrl`, `fileName`, `fileSize`, `url`) |
| `src/lib/services/pdf.service.ts` | **new**, `server-only` — the only file that knows Puppeteer exists |
| `src/lib/services/storage.service.ts` | **parameterised by bucket** (not new — it shipped with the logo feature) + `getObject` |
| `src/lib/report-export.ts` + `.test.ts` | **new**, pure — `isStorable` · `reportObjectKey` · `reportFilename` · `canServeStored` · `shouldStore` · `REPORT_SUFFIX` |
| `src/app/api/elections/[id]/report/pdf/route.ts` | **new** — the download route |
| `src/lib/db/elections.ts` | **+`getStoredReport`** — separate read, `ELECTION_SELECT` untouched |
| `src/lib/elections-view.ts` + `.test.ts` | `durationParts(ms)` extracted; `timeLeftParts` + new `elapsedParts` both call it |
| `src/lib/services/archive.service.ts` + `.test.ts` | seal nulls the three columns **inside** the transaction, deletes the object after commit |
| `src/actions/elections.ts` | `deleteElection` reads `reportKey` before the row goes, deletes the object after commit |
| `src/components/elections/election-report.tsx` | `preliminary` prop, warning band, four figures, UTC stamp, winner + quorum verdict suppressed |
| `src/components/elections/election-topbar.tsx` | report variant gains a real **Download**; the old button becomes **Print** |
| `.../results/report/page.tsx` | passes `preliminary`, `opens`, `notInvited`; shares `REPORT_SUFFIX` |
| `src/lib/rate-limit.ts` | new `reportRender` limiter — 10 / 15 min, IP + user |
| `src/lib/services/image-upload.service.ts` | call sites updated for the bucket argument |
| `messages/{hr,en}.json` | `dashboard.election.report.*` — 13 new keys, 1 orphan removed |

**367 tests pass** (+36). `npm run lint` and `npm run build` clean. 0 console errors.

---

## The one rule to remember

```ts
resultsDetailAccess(election) === "closed"   // IS the storage condition
```

One existing derivation decides **both** who may see a report and whether it is stored. There is no
second list of statuses to keep in sync, and `preliminary === (access === "live")` falls out of the
same call.

| Election state | Preview | Download | Stored |
| --- | --- | --- | --- |
| `ACTIVE` + `LIVE` | yes | rendered fresh **every time** | **never** |
| `CLOSED` / `ARCHIVED` | yes | yes | first click stores, later clicks stream it |
| `ACTIVE` + `AFTER_CLOSE` (sealed) | — | — | 404 |
| `DRAFT` / `SCHEDULED` | — | — | 404 |

Data is frozen from close onward — no vote can be cast (`castVote` requires ACTIVE), no option edit
path exists, and nothing returns an election to ACTIVE. That is why CLOSED is safe to store and
ACTIVE is not.

---

## ⚠ The trap: a valid PDF with no text

**Read this before touching `pdf.service.ts`.** The first working render produced a **2.9 kB PDF with
zero text** — backgrounds and borders drawn, zero text operators, zero embedded fonts. It looked
successful at every layer: HTTP 200, `%PDF-` magic, a real file.

**Cause.** A browser requests a webfont only once text using it is laid out. So immediately after
`load`, `document.fonts.status` reports `"loaded"` — nothing has been *requested* yet — and
`page.pdf()` does not wait for the woff2 requests its own layout pass triggers.

Bisected on the real page, 3–4 runs each:

| After `goto`, before `pdf()` | Result |
| --- | --- |
| `await document.fonts.ready` (the obvious fix) | **3.4 kB — broken** |
| double `requestAnimationFrame` | **3.3 kB — broken** |
| `emulateMediaType("print")` | **3.4 kB — broken** |
| `+250 ms` | 147 kB — correct |
| **`waitForNetworkIdle({ idleTime: 200 })`** | **147 kB — correct, 4/4** |

**Two defences, both load-bearing:**

1. **`page.waitForNetworkIdle({ idleTime: 200 })`** — adapts to a slow container instead of guessing a
   constant. Note `waitUntil: "networkidle0"` is *not* equivalent: it never fires in dev, because HMR
   holds a socket open.
2. **The capture is verified, not assumed.** Skia embeds a font subset the moment it draws a glyph, so
   a PDF containing no `FontFile` has no text. `renderReportPdf` re-captures up to 4× and **throws**
   rather than return one. The route turns that into a 500 and a localized toast.

The guard earned its keep during verification: after a dev-server restart it caught a cold-cache
render, and the retry produced the correct document. **A textless report is a silent failure that
would otherwise be stored and kept forever** — never weaken this check.

---

## Rendering

`puppeteer-core` drives the **existing preview route** through the **existing `@media print` CSS**.
There is no second template: editing the report page changes both the print output and the stored PDF.

**Session forwarding.** The admin's raw `Cookie` header is parsed and applied with `browser.setCookie`,
scoped to our host — deliberately **not** `setExtraHTTPHeaders`, which would attach the session cookie
to *every* request the page makes, including the organization logo fetched from R2.

After navigation the service asserts the final URL still contains `/results/report`; a session that
fails to apply lands on `/login`, and a screenshot of the login page is worse than an error.

**Dev vs prod.** Branch on **`process.env.VERCEL`**, never `NODE_ENV` — a local `next start` also
reports `production` and would reach for a Linux binary that is not there.

```bash
# .env.development (dev only — do NOT set on Vercel)
CHROME_EXECUTABLE_PATH=…\.cache\puppeteer\chrome\win64-…\chrome.exe
```

Any Chromium works (Chrome, Chrome for Testing, Edge, Helium). `@sparticuz/chromium` ships no Windows
binary, which is the whole reason for the split.

---

## The route

`GET /api/elections/[id]/report/pdf?locale=hr|en`

```
requireSession()                          → org
rate limit (reportRender, ip + user)      → 429 + Retry-After
getElectionDetail(id, org)      → null    → 404
resultsDetailAccess(election)   → null    → 404
                                → sealed  → 404
                                → closed  → storable
                                → live    → not storable
storable && key && locale matches         → stream from R2, no render
render → (store if storable && !key) → stream
```

A **route handler, not a server action** — a download *is* its headers, and actions cannot set them.
Locale arrives as a query param because `/api/*` sits outside `[locale]`, so there is no next-intl
request context (same precedent as both CSV exports).

**Everything unauthorised returns a bare 404 with an empty body** — missing id, cross-org id and wrong
status collapse together. No existence oracle. **This route, not the hidden button, is the boundary.**

`maxDuration = 300` (Vercel's ceiling on all plans — the old "10 s" objection no longer applies).

### Storage is best-effort; delivery is not

A failed `PutObject` still streams the bytes and writes **no** columns, so the next click retries.
Order is always **object first, then column** — never record a key for an object that is not there.
The reverse (object exists, no column) is merely wasted space.

Stored objects are streamed via `response.body`, so a multi-MB PDF never enters server memory.

---

## Buckets

R2 public access is a **per-bucket** setting, so one bucket cannot be public for logos and private for
reports:

```
electius-public    PUBLIC     logos/{orgId}/{uuid}.{ext}        file-image-spec.md
electius-files     PRIVATE    reports/{electionId}/{uuid}.pdf   this spec
```

`storage.service.ts` now takes the bucket as a **required first argument with no default**:

```ts
await putObject("private", key, pdf, "application/pdf");
await deleteObject("public", key);
```

That parameter decides whether an object is world-readable. A default would let a report land in the
public bucket by omission — reports contain tallies for elections where `resultsVisible` is `false`.

Each bucket has its own credential pair (`R2_ACCESS_KEY_ID` vs `R2_LOGO_ACCESS_KEY_ID`); identical
names for both would mean one silently wins depending on read order.

**`reportObjectKey(electionId)` takes no filename** — path traversal, collisions and PII in the key
cannot occur by construction, not by validation.

> **Production:** `R2_*` values must be set in Vercel. The app cannot verify they exist — the same
> silent no-op that caught Upstash during rate limiting.

---

## Invalidation

R2 cannot join a Postgres transaction, so the order is fixed: **DB first, R2 second, failures logged
loudly — never a swallowed `catch`.**

| Trigger | Behaviour |
| --- | --- |
| `sealElection` | nulls the three columns **inside** the existing transaction; deletes the object after commit |
| `deleteElection` | reads `reportKey` **before** the row is deleted; deletes the object after commit |
| retention prune | **not built** — see Open items |

Both wrap the R2 call in its own `try/catch`: a failed delete must not report failure for work the
database already committed.

**Why sealing invalidates.** A report generated while CLOSED has no Merkle root, because the `Archive`
row does not exist yet. Without invalidation the fast path would serve that pre-seal document forever.
Consequence, and it is correct: CLOSED → generate → ARCHIVED renders twice. **Those are two different
documents.**

**First generation wins.** A request in the other locale renders fresh and is **not** stored — a
proof-of-work artifact that silently changes is not one.

---

## The preliminary report (`ACTIVE + LIVE`)

`ElectionReport` takes `preliminary: boolean`, derived by the caller from `access === "live"`. The
component never reasons about access semantics.

- A `warning-50` / `warning-700` band above the results: title, turnout, **elapsed** time, generation
  stamp, and a sentence stating the winner and quorum verdict are withheld until voting closes.
- Four figures — **Total voters · Invited · Voted · Didn't vote** — from the shared
  `voterCounts({ total, notInvited, voted })`, the same function the election overview stat cards and
  the voter roster summary use. The report cannot disagree with either screen.
- **Suppressed:** the winner/trophy card, and the quorum **verdict**. The quorum *threshold* still
  prints — "not met" mid-vote reads as a judgement when it means *not yet*.
- **Kept:** the per-candidate distribution. Raw counts are a true statement about a moment.

### Two subtleties worth knowing

**The leader must not vanish with the winner card.** The distribution normally renders
`ranked.filter(c => !c.isWinner)` because the leader is in the trophy card above. Drop that card and
the top scorer disappears from the page entirely — so when `preliminary`, the distribution renders the
**full** `ranked` array.

**`notInvited` does not come from `getElectionResults`.** The spec asked for a filtered `_count` there,
but Prisma keys `_count.select` by relation name, so a filtered and an unfiltered count of the *same*
relation cannot coexist. `getElectionOverview` is already `cache()`d and already returns `notInvited`,
so the page calls it **only on the preliminary path** — no new query, and closed elections pay nothing.

---

## Two UI corrections

**The old button lied.** It was labelled `Preuzmi PDF` / `Download PDF` and called `window.print()`.
It is now **`Ispis` / `Print`**, beside a real **`Preuzmi PDF` / `Download PDF`** that hits the route.

**Download is `fetch` + blob, not a plain `<a href>`.** A navigation cannot produce a localized toast,
and a render failure is a plausible outcome. The filename is read back from `Content-Disposition`, so
client and server never disagree. Verified: one click = exactly one request.

The generation stamp moved from `formatVotingDate` (day + month only — two reports from the same day
were indistinguishable) to `formatVotingDateTime`, labelled **UTC** explicitly, and promoted off
`neutral-400` (2.9:1, fails AA; the design system marks it placeholder-only).

---

## Verified live

hr + en, seeded dev DB, 0 console errors:

- CLOSED → render **9.4 s**, stored; second request **0.56 s** with **no second render** (report-page
  request count unchanged in the server log — asserted, not eyeballed)
- seal via the real Archive action → columns null, object **deleted**, Merkle root written; regenerate
  → the new report **carries that root** (`d3e1042a…`, matching the archive row)
- with `en` stored, an `hr` request rendered fresh and did **not** overwrite; `en` still served in 0.48 s
- `ACTIVE + LIVE` → band, elapsed "50 dana 12 sati" (hr paucal), figures reconciling 265 / 265 / 231 / 34,
  leader present, quorum threshold without verdict — and **stored nothing**, re-rendering every request
- `deleteElection` → row gone **and** object gone (verified by listing the bucket, not from logs)
- sealed / DRAFT / unknown id → bare 404, empty body
- limiter: 10 through, **11th → 429** with `Retry-After` and `{code:"RATE_LIMITED"}`

**Not verified live:** cross-org 404 (needs a second org owning an election; rests on the shared
`findFirst({ where: { id, organizationId } })` and the unknown-id path) · a real `PutObject` failure ·
`@sparticuz/chromium` on Vercel — **the production render path has never executed.** Check the first
deploy.

---

## Gotchas for the next developer

- **`prisma migrate dev` does not regenerate the client here** — `generate` is wired into `build` and
  `postinstall` only. Run `npx prisma generate` after a migration or TypeScript will insist your new
  columns do not exist.
- **`npm run build` clobbers the `.next` a running dev server serves from** → `ChunkLoadError` or a
  reload loop that looks like an application bug. Kill the server, `rm -rf .next`, restart. Killing it
  can leave the port held: `Get-NetTCPConnection -LocalPort 3000` then `Stop-Process`.
- **Node does not resolve `*.localhost`** (browsers do). A Node script cannot `fetch`
  `http://dashboard.localhost:3000`. Does not affect the service — only Chromium navigates there.
- **`@upstash/ratelimit` keeps in-process state**, so deleting the Redis keys does not immediately
  clear a limit. Restart the dev server too when testing.
- Catalog edits must round-trip **byte-identically first** — the files are CRLF and a stray LF shows as
  a ~900-line diff.

---

## Open items

- **Retention prune must delete report objects** — `archive-seal-follow-ups-spec.md` thread 1, now
  carrying a concrete gap: a report stored for a **CLOSED-but-never-archived** election has *no*
  retention date at all, because `expiresAt` lives on `Archive` and no row exists. Retained forever
  with nothing scheduled to remove it.
- **`Election.autoCloseOnDeadline`** stays for a separate migration (thread 4). It is *not* as dead as
  that thread claims — `duplicateElection` still copies it and the seal snapshot records it.
- **Sealed export controls** are `disabled` on `/results` rows but **hidden** on the election results
  page. Same election, two treatments. Pre-existing; pick one.
- **Merkle disclosure** — the report prints only the root, which is safe. The **leaf set** is not: see
  the new warning in `archive-seal-follow-ups-spec.md` thread 2 before building the public verify page.
