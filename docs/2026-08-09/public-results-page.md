# Public Results Page — `/results/[id]`

The last unbuilt voter surface. `/vote/[token]`'s closed screen has linked here since v0.9.0
(`state-screens.tsx:145`) behind `election.resultsVisible`; the destination was a two-line
scaffold. This replaces it, and — more importantly — ships the **writer** without which the page
could never be reached.

Spec: `context/features/public-results-page-spec.md` (authored 2026-08-07, reviewed 2026-08-08).
Design: `Voter Flow.dc.html` §07, frames `7.1 Results` / `7.2 Results not published`.

---

## Findings index

1. [The page had no writer, and nothing was queued to supply one](#1-the-writer-gap)
2. [D4 — no public live tally, decided rather than inherited](#2-d4--no-public-live-tally)
3. [`resultsVisible` is ANDed with the access rule](#3-resultsvisible-is-anded-with-the-access-rule)
4. [The select is the anonymity boundary](#4-the-select-is-the-anonymity-boundary)
5. [Ballot order vs rank order — proven by a case where they differ](#5-ballot-order-vs-rank-order)
6. [The results QR — `publicResultsUrl` had no caller](#6-the-results-qr)
7. [The winner badge: `Prvo mjesto`](#7-the-winner-badge)
8. [Two verification traps that produced convincing false results](#8-two-verification-traps)

---

## 1. The writer gap

`Election.resultsVisible` defaults to `false`, and before this branch **no user-facing path wrote
it**. The only writer was `duplicateElection`, which copies whatever the source had — and every
source had the default. So `/results/[id]` 404'd for every election that existed.

Two specs had deadlocked each other:

- `pro-features-implementation-spec.md` §1.3 (shipped v0.9.20) wired `resultsMode` and
  **deliberately left `resultsVisible` alone**, its recorded reason being that a control must not
  "switch on a page saying *template, coming in a separate spec*".
- This spec declined the writer because that one would supply it.

Neither did. The decision taken at `start` was **D1(c)**: fold the toggle into wizard step 4 here.

```ts
// step-settings.tsx — OPTIONS
{ key: "liveResults",  pro: true,  soon: false },
{ key: "publicResults", pro: false, soon: false },   // ← new, Free on every tier
{ key: "quorum",       pro: false, soon: false },
```

```ts
// create-election.ts — the only writer of this column in the codebase
resultsVisible: w.publicResults,
```

**Consequence to know:** the writer is creation-time only, so **elections that already exist stay
dark permanently**, including every seeded one. There is no edit route for elections (`Edit` has
been a placeholder toast since v0.9.3), so this matches how every other election setting behaves —
but a post-close "publish results" toggle is the obvious follow-up, and it is the only thing that
would make historical elections publishable.

`publicResults` is **not** Pro. The public results page is listed under Free in
`project-overview.md`, so it carries no `ProBadge` and no entitlement check.

---

## 2. D4 — no public live tally

The spec explicitly refused to recommend on this one, and it was the only genuine product call in
the set. Decided **(b): publish only at close.**

Rendering live would mean a Pro admin who ticks *live results* **and** publishes gets a
world-readable moving tally mid-election — a strictly larger promise than the Pro copy makes
(*"pratite rast izlaznosti u stvarnom vremenu"* is addressed to the admin), and the one
configuration where this page could change the outcome of the election it reports on.

The decision collapsed the gate to a single equality:

```ts
const published =
  election?.resultsVisible && resultsDetailAccess(election) === "closed";
```

and made the spec's `liveBadge` key unnecessary — a live election never reaches 7.1, so the badge
can only ever say "Izbori zatvoreni". **The key was not added.** If D4 is ever reversed, it comes
back with it.

`resultsDetailAccess` (not `resultsAccess`) is D3: it differs on exactly one status, returning
`"closed"` for `ARCHIVED`, so **archiving does not retract a published result**. Archiving is a
seal, not a withdrawal.

---

## 3. `resultsVisible` is ANDed with the access rule

This is the part that surprises the next reader, so it is stated in the code as well:

> A **published but still-running** `AFTER_CLOSE` election renders the *hidden* screen, not the
> tally.

That is correct — there is no tally to publish yet — but it means ticking "publish results" appears
to do nothing until the election closes. The wizard toggle's description says so out loud rather
than letting an admin discover it:

> *"Objavi zbroj glasova na javnoj poveznici. Vidljiva je tek nakon zatvaranja glasovanja — birači
> do nje dolaze sa završnog zaslona."*

The seeded dev DB already contains this case: exactly one election has `resultsVisible: true`, and
it is `ACTIVE` + `AFTER_CLOSE`, so it renders 7.2. After `npm run db:seed`, **zero elections render
the tally** — flipping a **CLOSED** election is what makes 7.1 reachable.

---

## 4. The select is the anonymity boundary

One public, **unscoped** read — the only election query in the app with no `organizationId` in its
WHERE, because the visitor has no organization.

```ts
// db/elections.ts
organization: { select: { name: true } },        // name only — never contactEmail / logoUrl
options: { orderBy: { orderIndex: "asc" },
           select: { id, text, _count: { votes } } },
_count: { select: { voters: true, votes: true } },
```

**Never selected:** any voter field, any `votes` row, `createdById`, `quorumThreshold`,
`reportKey`, `archive`. The first two are anonymity scope; the rest are product scope.

`getElectionResults` selects `votes: { createdAt }` for its votes-per-day chart. The public page
draws no chart, so **a per-ballot timestamp must never reach this route** — which is why the
absence of a chart here is structural rather than a styling choice.

`quorumThreshold` is deliberately absent: quorum is a validity judgement for the organiser, and
this page reports what happened, not whether it counted.

---

## 5. Ballot order vs rank order

Rows render in **ballot order** (`orderIndex`). `rankCandidates` finds the leader; it does not
reorder the ballot.

```ts
const ranked = rankCandidates(/* … */);
const rank = new Map(ranked.map((r) => [r.id, r]));
const byBallotOrder = election.options.flatMap((o) => {
  const r = rank.get(o.id);
  return r ? [r] : [];
});
```

This was verified on an election where the two orders genuinely differ — *Izbori za članove
Senata*, where the winner **Petra Radić (80 votes) is `orderIndex` 4 and renders last**. Rank order
would have put her first. Verifying on an election whose winner happens to be first proves nothing.

All three winner forms render, and `tie` needs no branch — `isWinner` is set on **every** top
scorer, so the badge falls out:

| Form | Renders |
| --- | --- |
| `single` | one badge, `brand-700` bar |
| `tie` | badge on **every** tied leader, all their bars `brand-700` |
| `none` (zero ballots) | no badge anywhere, all bars `neutral-400` at 0% — `rankCandidates` guards `top > 0` |

**Multi-choice shares exceed 100%, correctly** — `sharePct`'s denominator is ballots cast, so each
percentage answers *"share of ballots that chose this option"*. Verified live at **132%**. An
individual bar can still never overflow: one ballot selects an option at most once (the junction PK
is `(voteId, optionId)`), so `votes <= votesCast` and no clamp is needed.

---

## 6. The results QR

Two QR codes already existed (`wizard-success.tsx`, `election-overview.tsx`) and **both encode
`electionVoteUrl(id)` → the voting route**. Meanwhile `publicResultsUrl(id)` had existed in
`urls.ts` since routing phase 4 and was called **nowhere in `src/`** — a built, tested helper with
no caller, exactly the shape `resultsVisible` was in.

New `components/elections/results-share.tsx` — a "Share results" block on
`/elections/[id]/results` with the QR, the URL and a copy button.

**Its gate is the same expression the public route uses:**

```ts
const shareable = results.resultsVisible && access === "closed";
```

A QR that leads to "Rezultati nisu objavljeni" is a promise broken at the moment of scanning, so
the block is hidden entirely rather than shown-and-disabled.

`resultsVisible` was added to **`getElectionResults`**, not to `ELECTION_SELECT` — `/elections`,
`/results` and the dashboard never render that column and should not pay for it.

---

## 7. The winner badge

`voter.results.winner` = **`Prvo mjesto` / `First place`**.

The design drew `Izabrana` (feminine, drawn against a female candidate). It sits beside a real
person's name, so it misgenders — the problem the voter roster already solved by replacing
*Glasao/Glasala* with the state noun **`Glas predan`**.

`Izabranik` is not the fix: it is the masculine counterpart of `izabranica`, i.e. the same
generic-masculine in the other direction, and it breaks on two further constraints.

**Why `Prvo mjesto` works:**

- `mjesto` is **neuter** and `prvo` agrees with `mjesto`, not with the person. A Croatian personal
  name is never neuter, so the badge is structurally incapable of agreeing with the name beside it.
- **Ties read better, not worse** — *"dijele prvo mjesto"* is ordinary Croatian, so two badges on
  one page state a fact instead of contradicting each other.
- **Works for non-people** — `electionType` is `STANDARD | POLL | SURVEY`; on a poll the winner is a
  thing (`Ne — Prvo mjesto`).
- **Asserts only a position in a count** — no office, no mandate — so it stays true on an advisory
  survey and when quorum fails.
- 11 characters vs 15. The badge is `shrink-0` and the name is `truncate`, so every character saved
  goes straight back into the visible name at 390px.

Rejected, with the reason each fails:

| Term | Fails on |
| --- | --- |
| `Izabranik` | masculine; also wrong for ties and polls |
| `Izabrano` | asserts an *election* occurred — false for an advisory survey |
| `Pobjeda` | a tie is `neriješeno`, explicitly **not** a `pobjeda` |
| `Prvi izbor` | collides with ranked-ballot first-preference terminology |
| `Vrh liste` | collides with `izborna lista`, a real term in Croatian elections |
| `Odabir birača` | `birača` is generic masculine |
| `1. mjesto` | Croatian TTS expands `1.` inconsistently ("jedan točka mjesto") |

### The admin `Pobjednik` is deliberately NOT changed

`dashboard.election.results.winner` stays **`Pobjednik`**. This is a decision, not an oversight.

The two surfaces have different truth conditions. The admin card is organiser-only and sits beside
`winnerTie` ("Izjednačeno") and `winnerNone` ("Nema pobjednika"), which cover the edge cases in
adjacent text. The public badge is a bare chip with nothing around it, seen by everyone, on a page
that also serves polls — where `Pobjednik` is simply false.

**Do not "align" them by pushing `Pobjednik` onto the public page.** That would reintroduce exactly
what this change removed.

---

## 8. Two verification traps

Both produced convincing but wrong results before being caught. Reuse the corrected method.

### The no-oracle check needs a control

The requirement is that **missing id**, `resultsVisible === false`, `DRAFT`/`SCHEDULED` and
`sealed` all return byte-identical responses — anything that distinguishes them turns the URL into
an existence oracle.

A first comparison over the streamed `<main>` shell reported "identical". It was comparing 314
bytes of shell; the content arrives in a later RSC chunk. Redone over full bodies, they were **not**
identical — which looked like a real leak.

The actual difference was `self.__next_r`, a **per-request render nonce**. The control settles it:

```js
// The SAME url fetched twice:
rawIdentical: false            // ← so raw comparison proves nothing
normalisedIdentical: true
```

With the nonce normalised, all six cases (two different bogus ids, `DRAFT`, a real `SCHEDULED`,
`ACTIVE`+published, `CLOSED`-unpublished) are identical at **101855 bytes**, and the id appears only
twice in each — both times as the route param the visitor supplied.

> **Method:** when asserting two responses are identical, first prove that the same URL twice is
> identical under your comparison. Otherwise you cannot tell a leak from a nonce.

### next-intl serialises the whole catalog

`grep`ping the served document for a string proves nothing about whether it **rendered** —
next-intl puts every catalog key into the RSC payload as script content.

This fired twice here: `contactEmail` appeared to leak from the query (it was the label
`"contactEmail":"Kontakt e-pošta"`), and the share block appeared to render on an unpublished
election (catalog only). Every email address in the document is a catalog form-placeholder
(`ime.prezime@organizacija.hr`).

> **Method:** discriminate on something only the renderer emits — here the QR's
> `shape-rendering="crispEdges"` paths and the public URL — or use the a11y snapshot.

---

## Files changed

| File | Change |
| --- | --- |
| `src/app/[locale]/(voter)/results/[id]/page.tsx` | replaces the scaffold — gate, 7.2 screen, `generateMetadata` |
| `src/components/voter/public-results.tsx` | **new** — 7.1 body, server component |
| `src/components/elections/results-share.tsx` | **new** — QR + copy block (client: QR and clipboard need the browser) |
| `src/app/[locale]/(app)/elections/[id]/results/page.tsx` | mounts the share block behind `shareable` |
| `src/lib/db/elections.ts` | widened `getPublicResultsElection` + `PublicResultsElection`; `resultsVisible` on `getElectionResults` |
| `src/actions/create-election.ts` | `publicResults` in the zod payload → `resultsVisible` |
| `src/actions/create-election.test.ts` | fixture field + 3 new tests |
| `wizard-shared · step-settings · step-review · election-wizard` | the toggle through the payload |
| `messages/{hr,en}.json` | `voter.results` rebuilt (placeholder `subtitle` removed) · `step4.toggles.publicResults` · `results.share` |

`generateMetadata` returns `robots: { index: false, follow: false }` and **no title**, as a constant
with no fetch — a `<title>` carrying the election name on a page that refuses to confirm the
election exists would undo §4 of the spec. Making it a constant means the title cannot leak by
construction; the page inherits the root layout's "Electius".

**Accepted cost of the one-response rule:** a genuinely bad URL returns **200**, not 404. A 404 for
"no such election" and a 200 for "exists but unpublished" *is* the oracle. `noindex` keeps crawlers
out and nothing in the app depends on this route's status code.

---

## Verification

`npm run lint` · `npx tsc --noEmit` · **557 tests (+3)** · `npm run build` clean (46 pages).

Browser pass, hr + en, **0 console errors**:

- **Reconciliation** — page figures match SQL exactly (84/42, 56/28, 38/19, 22/11; turnout 85%)
- **Ballot order** — winner renders last (§5)
- **Multi-choice** — shares sum to 132%
- **Tie** — both leaders badged; **zero-vote** — no badge on any row
- **ARCHIVED** renders its tally (D3)
- **Four rejections** — identical after nonce normalisation (§8)
- **No PII** — zero voter emails, zero `createdAt`/`batchOrder`/`voteHash`, **zero millisecond
  timestamps** in the payload including script content
- **`robots`** = `noindex, nofollow`; title = `Electius`, never the election name
- **390px** — no horizontal overflow (390 = 390)
- **Share block** — QR + copy present on published `CLOSED` and published `ARCHIVED`, **absent** on
  unpublished and on sealed

The 3 new tests pin the writer and were **mutation-checked**: hardcoding `resultsVisible: false`
fails exactly the two asserting `true`. This is the only writer of the column, and a silent
regression would return the page to permanently-dark with no error anywhere.

Fixtures (published flags on 3 real elections + a tie and a zero-vote election) were created and
destroyed; the dev DB was SQL-confirmed back to baseline — 19 elections · 2087 votes · 3993 voters ·
72 options · 2309 junction · 3 archives · 1 published · 0 fixtures.

### Not verified

- **The Free-cap path for `publicResults`** — there is none by design; the toggle is not Pro.
- **A `purchased` entitlement** — the branch exists in every switch with no producer.
- The share block was verified server-side (gate, copy, URL, both locales); its **visual** rendering
  was not screenshotted, to avoid putting a session credential in the transcript. It reuses the QR
  and copy-button markup already shipped in the overview dialog.

---

## Open items

- **Existing elections cannot be published.** A post-close publish control is the natural follow-up
  and the only way to reach historical and seeded elections (§1).
- **`/results/[id]` is unrated** — `src/lib/rate-limit.ts` covers auth, export and vote paths only.
  This is one primary-key `findUnique` plus counts, and a `closed` election's tally is frozen
  forever, making it the best cache candidate in the app.
- Sharing affordances beyond the QR (OG image) stay out — the page is `noindex`, and an OG card
  naming an election winner is a product decision.
- Public verification of a receipt code against the Merkle tree is a separate surface. **Read the
  disclosure warning first** — `future-updates-spec.md` § *Integrity & Archive* → *2. Public voter
  "verify your code" page*: the verify route must return a **sibling path**, never
  `proofData.leaves`.
