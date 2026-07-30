# Elections Archived Phase 1 — Archive Search Bar

**Branch:** `feature/elections-archived-phase-1` · **Version:** stays 0.9.8 (bump skipped at user request)
**Spec:** `context/features/Elections Archived Spec Files/elections-archived-phase-1-spec.md`
**Design:** `context/design/electius-app-design-prototype/project/Elections Archived.dc.html`

`/archive` gains a search input that filters the archived-elections list as you type. Case- and
diacritic-insensitive, client-side, no new query.

No new dependency. No schema change. No new DB query. No server action.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/elections-view.ts` | **+** `foldForSearch` · `matchesQuery` |
| `src/lib/elections-view.test.ts` | **+26 cases** |
| `src/components/elections/archive-list.tsx` | header + search + counter + empty-result card |
| `src/app/[locale]/(app)/archive/page.tsx` | down to 12 lines; stray `p-8` removed |
| `messages/{hr,en}.json` | **+7 keys** under `dashboard.election.lists.archive` |

**284 tests pass** (from 258). `npm run lint` and `npm run build` clean.

---

## Why the filter is allowed to be client-side

`getElectionsByStatus(organizationId, "ARCHIVED")` is **unpaginated** — it returns every archived
row for the org. The client therefore holds the complete set, so a client filter cannot hide a
match. Same reasoning as the `/elections` filter toolbar.

This is deliberately **unlike** the voter roster, where search lives in the WHERE clause. That list
is paginated (`ROSTER_PAGE_SIZE = 25`), so a client filter would only ever search the 25 rows
currently rendered and a match on page 7 would be invisible.

The rule to carry forward: **client filter is safe only when the client holds everything.** If
`/archive` ever grows pagination, this filter has to move server-side with it. Marked at the call
site:

```ts
// Lista je nepaginirana — filtriranje na klijentu ne može sakriti pogodak.
const rows = useMemo(() => elections.filter((e) => matchesQuery(e, query)), [elections, query]);
```

---

## The fold, and the `đ` trap

```ts
export const foldForSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")   // č ć š ž → c c s z
    .replace(/đ/g, "d")       // đ nije d + kombinirajući znak
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
```

NFD decomposes a *composed* character into base + combining mark, which is why stripping `\p{M}`
handles č/ć/š/ž. **`đ` was never a composition** — it is its own letter with a stroke baked into the
glyph, so NFD leaves it untouched and the mark-strip never sees it. Without the explicit pair, a
Croatian admin typing `durdevac` would not find *Đurđevac*.

The identical rule already exists in [`csv.ts`](../../src/lib/csv.ts) `slugify`, which needs ASCII
filenames. Both are pinned by tests; if you touch one, check the other.

`\p{M}` is used over the hand-written `[̀-ͯ]` range: it is ASCII-safe in source (no
invisible combining characters sitting in a `.ts` file) and matches combining marks outside that
one Unicode block.

`matchesQuery` returns `true` on an empty or whitespace-only query, so the list component needs no
`hasQuery ? filter : all` branch.

---

## Where the page header went

The header now lives inside `archive-list.tsx`, not the page. The search input sits on the right of
the title row and drives the list's state, so that row must be client-rendered.

The page stays a Server Component doing what only it can — `requireSession()` and the Prisma read:

```tsx
export default async function ArchivePage() {
  const { organizationId } = await requireSession();
  const elections = await getElectionsByStatus(organizationId, "ARCHIVED");
  return <ArchiveList elections={elections} />;
}
```

The alternative — lifting query state up to the page — would have forced the whole route client-side
and lost the server-side read. Only presentation crossed the boundary.

**Drive-by fix in the same edit:** the page was applying its own `p-8` on top of `DashboardShell`'s,
giving `/archive` 64px of padding. It was the only `(app)` page doing this; the same double-padding
was removed from `elections/[id]/layout.tsx` in v0.9.3.

---

## Three states, not two

| Condition | Renders |
| --- | --- |
| `elections.length === 0` | existing dashed "Još nema arhiviranih izbora." notice · **search bar hidden** |
| rows found | counter + list |
| query with no match | empty-result card (icon, echoed query, body line, Clear button) |

Keeping the first two apart matters: an org with an empty archive must not be told
`Ne mogu pronaći izbore ""`. The search bar is hidden in that state because there is nothing to
search.

---

## Counter copy

```
no query   →  4 arhivirana izbora        /  4 archived elections
query      →  Prikazano 1 od 4           /  Showing 1 of 4
```

`resultAll` is a real ICU plural with the Croatian paucal:

```
{count, plural, one {# arhivirani izbor} few {# arhivirana izbora} other {# arhiviranih izbora}}
```

The design prototype hardcodes the genitive plural and would print "1 arhiviranih izbora". Follow
the catalogs, not the prototype, for anything counted.

---

## Decisions taken at `start`

**Plan-cap chip — not rendered.** The prototype's top-bar chip reads `Besplatni plan · n / 10
arhivirano` / `PRO · Neograničeno`. That is a **retention** readout: no prune job exists, nothing
enforces a 10-archive cap, and `User.isPro` is off for the MVP. Shipping it would have asserted a
limit the product does not have. It belongs to a retention/billing spec together with the Free
1-year prune and the downgrade clawback.

**Empty-result copy — prototype wins.** The spec said `Nema izbora za "{query}"`; the prototype says
`Ne mogu pronaći izbore „{query}”` plus a body line. Only the prototype version fills the designed
card — the spec's leaves a hole under the title.

---

## i18n injection

Seven keys per locale, added under the existing `dashboard.election.lists.archive` namespace. The
catalogs are **CRLF**, so they were injected by a script that parsed, re-serialised, and **aborted
unless the round-trip reproduced the file byte-for-byte** before mutating anything. Reuse that guard
for any future catalog edit — a stray LF rewrite shows up as a 900-line diff.

New keys: `searchLabel` · `searchPlaceholder` · `resultAll` · `resultFiltered` · `emptyTitle` ·
`emptyBody` · `clearSearch`.

`searchLabel` exists separately from `searchPlaceholder` because the input needs a real accessible
name; a placeholder is a weak fallback that disappears the moment the field has content. `clearSearch`
serves double duty as the icon button's `aria-label` and the primary button's visible label.

---

## Verification

Playwright on the seeded dev DB, both locales, **0 console errors** (the 8 warnings are Firefox
`next/font` preload noise, pre-existing):

| Check | Result |
| --- | --- |
| unfiltered counter | `4 arhivirana izbora` — correct paucal |
| `REFERENDUM` | 1 of 4, counter switches to `Prikazano 1 od 4` |
| `ŠTUDENTSKOG DOMA` | matches *Referendum o obnovi **studentskog doma*** — fold + multi-word substring |
| no match | card with `Ne mogu pronaći izbore „nepostojeći izbor”` |
| clear (X and primary button) | list and counter restored |
| `/en/archive` | `Can't find elections "zzz"` · `Showing 0 of 4` |

**Not live-verified:** the zero-archives branch — no fixture org has an empty archive and producing
one needs a DB write. That path renders the pre-existing `empty` notice unchanged.

---

## Deliberately out of scope

- **Retention policy** — Free 1-year prune, PRO unlimited, downgrade clawback. No prune job exists
  anywhere in the codebase. Owns the plan-cap chip above.
- **The 2-column archive cards** — participation bar, winner, View/PDF/Audit actions. Those belong
  to `elections-archived-phase-2-spec`, and the audit modal's integrity claim is blocked on
  `election-archive-merkle-seal-spec` (nothing writes `Archive.merkleRoot` yet). Phase 1 filters
  the existing list.
- **Sorting** — filters only, same as the `/elections` toolbar.

---

## Gotchas for the next session

- **`npm run build` clobbers the `.next` a running dev server serves from.** Restart the dev server
  after a build before browser-verifying, or you get a `ChunkLoadError` on any route needing fresh
  compilation while warm routes keep working — it looks like a code bug and is not.
- The design prototype still says **"Electious"** throughout (pre-rebrand). Use **"Electius"**.
