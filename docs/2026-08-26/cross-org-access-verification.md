# Cross-Organization Access Verification

**Branch:** `chore/cross-org-access-verification` · **Spec:** `context/features/cross-org-access-verification-spec.md`
**Date:** 2026-08-26 · **Behaviour change:** none — two test files, two doc updates.

> The requirement, in the user's terms: *a union organization must never see elections from a private
> equity company.* The codebase has claimed this structurally since the 2026-07-11 audit (invariant
> #3 — every admin query is org-scoped, guards in the WHERE clause), but several cross-org paths had
> **never been proven with a real second organization**, because the dev DB had only one org with
> elections. Past sessions kept recording "cross-org 404 rests on the shared `findFirst`, not
> live-verified" and moving on. This branch collects that debt.

**Result: no leaks. Nothing was fixed, because nothing was found broken.** Every failure in this
document is a failure of the *instrument*, and each is written down because each one first looked
exactly like a finding.

---

## 1. What shipped

Two test files. That is the entire diff besides documentation.

| File | Why it exists |
| --- | --- |
| `src/lib/db/elections.test.ts` **(new — the module's first)** | Twelve org-scoped queries had **no test file at all**. Table-driven: the eight id-scoped reads must send **both** `id` and `organizationId` in `where`; the four org lists must send `organizationId`; `getPublicResultsElection` is pinned as the **deliberate exception** that sends `where: { id }` alone. |
| `src/actions/dashboard.test.ts` **(new)** | `fetchTurnout` was the one action with no colocated test. Pins that the org comes from the **session**, never the argument, and that the query is unreachable without a session. |

`getElectionsPage` gets its own case because it issues **two** queries and only one is obvious: an
unscoped `count` would report the whole platform's election total as this organization's — a leak
made of a number rather than a row.

The public-query exception is pinned in **both directions**: the day someone "fixes" the unscoped
query (breaking the public page) *or* copies its shape into an admin query, a named test speaks.

### Mutation check — six mutations, six named failures

House standard, and the script asserts the search string was **found** before writing (a mutation
that fails to apply is indistinguishable from one no test catches — the CRLF trap this repo has hit
twice). A green **control run on unmutated source** ran first, for the same reason.

| Mutation | Test that failed |
| --- | --- |
| `getElectionDetail` drops `organizationId` | `getElectionDetail traži i id i organizationId` |
| `getDashboardData` drops `organizationId` | `getDashboardData filtrira po organizaciji` |
| `getElectionsPage` drops `organizationId` | `getElectionsPage scopa i brojanje i dohvat` |
| `getPublicResultsElection` **gains** `organizationId` | `traži samo id, bez organizationId` |
| public `select` gains `contactEmail` | `select ne nosi retke birača, vrijeme listića ni kontakt organizacije` |
| `fetchTurnout` sends a hardcoded org | `uz id šalje organizaciju iz sesije` |

Each mutation failed **exactly one** named test, never the whole file.

**Totals:** 696 tests / 39 files (from 678 / 37). `npm run lint`, `npx tsc --noEmit`,
`npm run build` all clean.

---

## 2. The live pass

**Fixture (D3):** a throwaway Org B — *Alfa Capital Partneri d.o.o.*, i.e. the "private equity
company" from the requirement — with its own pre-verified admin (scrypt credential via BetterAuth's
exported `hashPassword`; the seeded `demo@electius.com` password in `.env.development` has drifted
from the DB and 401s, recorded 2026-08-08 and reconfirmed twice since), one CLOSED election with
options, voters and votes, and one DRAFT election.

Org A is the seeded *Sveučilište u Zagrebu* (18 elections). A third organization exists in the dev
DB (the maintainer's own account) and was **not touched**.

Baseline row counts were captured **before** creating anything and re-asserted after teardown, never
hardcoded from a previous session's notes.

### 2.1 Admin pages and API routes — cross-org id is indistinguishable from a garbage id

Every row driven from Org B's real session against Org A's ids, with a well-formed but non-existent
cuid as the control.

| Surface | A's DRAFT/ACTIVE/CLOSED/published/ARCHIVED | garbage id | verdict |
| --- | --- | --- | --- |
| `/elections/[id]` (all five statuses) | 200, 404 card | 200, 404 card | identical |
| `/elections/[id]/results` | 200, 404 card | same | identical |
| `/elections/[id]/results/report` | 200, 404 card | same | identical |
| `/elections/[id]/voters` | 200, 404 card | same | identical |
| `GET /api/elections/[id]/voters/export` | **404, 0-byte body** | same | identical |
| `GET /api/elections/[id]/results/export` | **404, 0-byte body** | same | identical |
| `GET /api/elections/[id]/report/pdf` | **404, 0-byte body** | same | identical |

The `[id]` layout's `notFound()` is what the three facets inherit; the API routes guard themselves,
which is why they are listed separately — a route does not inherit the layout's fetch.

**Leak test, done properly.** Presence of an election title in the body is **not** a valid test:
next-intl serialises the whole catalog into every RSC payload, and the catalog contains
`"role": "Predsjednik, Studentski zbor"` (a marketing testimonial placeholder), so a naive
`body.includes("Studentski zbor")` reports a leak on every page in the app. The discriminator is
**occurrence count against the missing-id page** — equal count means catalog copy, higher count
means leaked data. All five titles: equal (`0 vs 0`, and `1 vs 1` for the colliding one).

**Positive control (D3), the part that makes the negatives mean anything:** B reaches its **own**
election on all four page surfaces (200, real content, its own title rendered) and exports its own
voters and results at 200. Without this, a broken session that 404s everything would read as
perfect isolation.

### 2.2 Server actions — all 14, not the 2 the spec asked for

The spec (D4) settled for two live representatives because driving all thirteen through the browser
means hand-crafting server-action POSTs. In the event, Next's dev **server-reference manifest**
(`.next/dev/server/server-reference-manifest.json`) maps action id → `exportedName`, so once B's own
routes are warmed (actions register at compile time) every action can be invoked exactly as the UI
invokes it: a real `Next-Action` POST, from B's real session, with **Org A's id as the argument** —
precisely attacker A1's shape.

| Action | Argument | Result from B's session |
| --- | --- | --- |
| `renameElection` | A's CLOSED id | `forbidden` |
| `deleteElection` | A's CLOSED id | `forbidden` |
| `duplicateElection` | A's CLOSED id | `notfound` |
| `archiveElection` | A's CLOSED id | `invalidStatus` |
| `closeElection` | A's ACTIVE id | `invalidStatus` |
| `startElection` | A's DRAFT id | `invalidStatus` |
| `reminderPreview` | A's ACTIVE id | `invalidStatus` |
| `sendElectionReminders` | A's ACTIVE id | `invalidStatus` |
| `resendInvitations` | A's ACTIVE id | `invalidStatus` |
| `addVoters` | A's ACTIVE id | `invalidStatus` |
| `fetchTurnout` | A's ACTIVE id | `null` — **no counts** |
| `updateVoterName` | A's **voter** id | `forbidden` |
| `removeVoter` | A's **voter** id | `invalidStatus` |
| `resendVoterInvite` | A's **voter** id | `invalidStatus` |

The last three carry a **voter** id and are scoped through the `election: { organizationId }`
relation filter — a different guard idiom, so they earn their own rows.

`addVoters` initially returned `invalid`, which proved nothing: zod rejected the payload shape
(`voterRowSchema` requires `{ name, email }`) **before** the org guard ran. Corrected to a valid
row, it reaches the guard and returns `invalidStatus`. Worth remembering — a refusal is only
evidence if it comes from the check you meant to test.

**Zero-write proof (SQL, development branch):** A's title byte-identical
(`Izbori za članove Senata`), all three statuses unchanged, the ACTIVE election still at 320 voters,
voter `Ana` not renamed, **0** rows named `pwned@example.com`, **0** elections titled `PWNED`, A
still at 18 elections, archives still 3.

**Positive control:** B renames its **own DRAFT** → `success: true`, and updates its own voter's
name → `success: true`. The first attempt used B's CLOSED election and returned `electionEnded`
(`mutationsFrozen`), which proved the action *ran* but not that B may write — hence the DRAFT.

### 2.3 The public page (`/results/[id]`) — §6

- **Four rejections identical to a garbage id:** DRAFT · ACTIVE-unpublished · CLOSED-unpublished ·
  B's own CLOSED-unpublished — all HTTP **200**, all the same hidden screen. Confirmed in the
  browser at the DOM level: `main.innerHTML` = **801 B, hash `3bfa63f8`** for both an existing-hidden
  election and a non-existent id. 200-for-everything is deliberate: a 404 for "no such election"
  beside a 200 for "exists but unpublished" *is* the existence oracle.
- **Published + closed renders the tally** (the feature still works).
- **A session grants nothing (§6.2, new):** the dashboard host still serves `/results/[id]` (a
  recorded domain-architecture ceiling). Requesting A's unpublished election there **with B's session
  cookie** returns the same hidden screen as the anonymous apex request. This is structural —
  `getPublicResultsElection` reads no session — and is now asserted so it stays that way.
- **Payload boundary:** zero voter addresses, zero per-ballot timestamps, no organization
  `contactEmail`, `robots noindex, nofollow`, and the election name never in `<title>`.

---

## 3. Three traps, all of which first looked like findings

Recorded because each cost real time and each will recur.

**1. `fetch` silently drops the `Host` header.** `Host` is a *forbidden header name*, so undici
strips it — every "dashboard host" request actually hit the apex and received a perfectly correct
apex→dashboard **307**. For a while the matrix showed every admin page redirecting, including B's
own. Use `node:http`, which honours `Host`. (Node also cannot resolve `*.localhost` at all, so the
address must be `127.0.0.1` with `Host` set — the recorded workaround.)

**2. Suspense streaming makes raw HTML incomparable on `/results/[id]`.** The existing-election
response contains a fallback plus the streamed patch; the missing-id response renders inline. Raw
bodies therefore differ (95 577 B vs 94 286 B) with **no content difference whatsoever**. Two things
settle it: the browser shows byte-identical `main.innerHTML`, and the streaming is *timing*, not
existence — across runs the missing id streamed 1/6, then 4/6, then 2/6 as load varied. A first
attempt to strip the scaffolding textually was worse than useless: it deleted the streamed
**content** and left the fallback, which is what produced the alarming diff.

**3. The catalog false positive**, described in §2.1. The spec warned about it; I walked into it
anyway by choosing a title substring that collides with catalog copy.

Two smaller ones: the mutation harness must not be handed a lowercase-drive-letter `cwd` (vitest's
alias resolution breaks and every file loads with **"no tests"**, which reads exactly like "mutation
caught"), and Node refuses to spawn `.cmd` files without a shell since CVE-2024-27980, so
`npx.cmd` returns empty output — again indistinguishable from "no failures". **Both were caught only
because the control ran first.** That is the whole argument for controls: an instrument that reports
nothing and an instrument that is broken look the same.

---

## 4. Not verified — stated, not implied

- **Production.** Everything here is the dev branch and a dev server. The isolation logic is
  environment-independent, but the assertion is about this build.
- **A real browser session for the admin surfaces.** The session cookie came from the real
  `/api/auth/sign-in/email` endpoint and was replayed over HTTP, which exercises the same
  `requireSession()` path and gives exact bytes; only `/results/[id]` was additionally driven
  through Firefox.
- **`purchased` entitlement.** No code path produces it, so nothing exercised it.
- **The cron sweep** — secret-gated, sessionless and org-blind by design; out of scope per §9.

---

## 5. Housekeeping

- Fixture destroyed in FK order; dev DB **SQL-proven identical to the captured baseline**: 2 orgs ·
  2 users · 19 elections · 3994 voters · 2087 votes · 73 options · 2309 junction rows · 503 tokens ·
  3 archives · 0 subscriptions · 1 published election. Zero leftovers.
- **No temporary `resultsVisible` flip was needed** — one CLOSED election was already published, so
  that mutation-and-restore was avoided entirely.
- Six throwaway scripts and the cached session cookie deleted; Upstash keys created by this run
  removed by exact match on the test address (`ratelimit:login:…:crossorg-b@example.com:…`), never a
  blind `ratelimit:*` flush.
- ⚠ **The standing dev-DB trap was armed throughout:** one SCHEDULED election has a `startsAt` in the
  past, so any ping of the cron sweep would open it and send **real invitation mail**. Nothing in
  this pass pinged the sweep. Check for such rows before any future dev-DB work.
- The dev server hit its memory ceiling and auto-restarted mid-run, which surfaced as a Firefox
  error page. Not application code.

## 6. Follow-ups

- `future-updates-spec.md` § Integrity & Archive gained **§4 Share-token results URL** — the recorded
  upgrade path for the one honest weakness: the public results URL shares the cuid printed on
  voting-QR posters, so it is unrevocable without killing the voting QR. Declined under D1
  (publishing is opt-in, default-off, closed-only, and means public).
- Nothing spun off under D5, because nothing was found.
