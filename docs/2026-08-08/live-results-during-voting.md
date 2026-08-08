# Live Results During Voting

**Branch:** `feature/live-results` · **Version:** 0.9.20 (patch) · **Date:** 2026-08-08
**Spec:** `context/features/pro-features-implementation-spec.md` §1 — slice 3 of 4, own branch.
One migration (a column **drop**), ~8 files, no new service, no new dependency.

`resultsMode: LIVE` was read correctly in five places — `resultsAccess()`, the `LiveHero` 15s poll,
the overview's pulsing badge, `/results` sorting, and the results facet rendering a tally instead of
the sealed notice. **No user-facing path had ever written it.** The LIVE branch was dead code from
the day it was written. This slice supplies the write path.

---

## Findings index

Read these before touching the files; two of them reversed decisions taken earlier.

1. **The specced 5-value enum was rejected, with evidence.** `AFTER_CLOSE` already means "sealed",
   so two of the five values would have been behaviourally identical — §1.
2. **`resultsVisible` and the public page are untouched, on purpose.** That page is still a
   scaffold; an enum value switching it on would ship a control for an empty page — §2.
3. **`sealedResults` was dropped, not wired.** Its promise *is* the default — §1.
4. **The Pro guard sits outside `if (!draft)`**, or a draft is a bypass — §3.
5. **The GDPR export shape changed** → `EXPORT_VERSION` 2 → 3 — §4.

---

## 1. Why not the enum the spec recommended

The spec proposed one `ResultsVisibility` enum replacing all three columns:

```
SEALED · AFTER_CLOSE · PUBLIC · LIVE · LIVE_PUBLIC
```

Checking it against the code first turned up the problem. `resultsAccess()`:

```ts
if (e.status !== "ACTIVE") return null;
return e.resultsMode === "LIVE" ? "live" : "sealed";
```

An ACTIVE election that is not LIVE already resolves to `"sealed"`, and the comment directly above
that function states this hides the tally **from the admin too**. So `AFTER_CLOSE` *is* SEALED.
The enum would have shipped with two values meaning the same thing, one of them dead on arrival.

Strip the redundant column away and what is left is already a clean model — two orthogonal axes,
four combinations, **no nonsense state to design out**:

| | `resultsVisible: false` | `resultsVisible: true` |
| --- | --- | --- |
| **`AFTER_CLOSE`** | admin at close, no public page *(default)* | admin at close, public page at close |
| **`LIVE`** | admin during voting *(Pro)* | admin + public during voting *(Pro)* |

The "three columns disagree" problem was caused entirely by the third column. So: **drop
`sealedResults`, keep the other two, wire the wizard to `resultsMode`.** No enum, no new type, and
the five read sites keep working untouched.

`sealedResults` was written by the wizard (step 4, *"Zapečaćeni rezultati"*) and read by no
behaviour — only the GDPR export emitted it. A column a user-facing toggle writes and nothing acts
on is worse than no column: the UI claims a change that never happens. An admin who ticked
*"Sakrij sve rezultate — čak i administratorima"* got exactly what they would have got by leaving it
alone.

Migration `20260808151527_drop_sealed_results` — hand-authored SQL + `migrate deploy`, because
`migrate dev` refuses a data-loss prompt in a non-interactive shell. Same route the
`autoCloseOnDeadline` drop took.

---

## 2. What this slice deliberately does not touch

`resultsVisible` stays unwritten and the public page `/results/[id]` stays behind its 404.

That page is still the routing-phase-4 scaffold: an `<h1>` and a subtitle reading *"Predložak
(/results/[id]). Prikaz rezultata dolazi u zasebnoj specifikaciji."* No tally, no charts, no winner.
Shipping a `PUBLIC` or `LIVE_PUBLIC` control would give admins a switch that turns on a page saying
"template, coming in a separate spec" — precisely the class of failure this parent spec exists to
eliminate.

Nothing advertised requires it. The Pro claim is admin-facing: *"Rezultati uživo tijekom glasovanja
— pratite rast izlaznosti u stvarnom vremenu."* The public results page still owes its own spec, and
`resultsVisible` is waiting for it, unchanged.

---

## 3. The write path and its guard

`create-election.ts`:

```ts
resultsMode: w.liveResults ? "LIVE" : "AFTER_CLOSE",
```

The wizard carries a boolean (`liveResults`), not the enum value — the UI control is a two-state
toggle, and letting the client post an enum member would widen the payload for nothing.

The guard:

```ts
if (w.liveResults && !canUseLiveResults(entitlement)) {
  return { success: false, error: "liveResultsLocked" };
}
```

Three properties, each load-bearing:

- **Server-side**, because the payload comes from the client. The wizard hides the control for a
  Free org, but the action is the trust boundary — the same reasoning that already re-enforces the
  election-type/voting-method coupling.
- **Outside `if (!draft)`**, sitting beside the voter cap. A draft is not a bypass: a LIVE draft
  merely defers the same state to the moment the election is started.
- **Before any write**, so a refusal never leaves a half-created election behind.

`canUseLiveResults` is a new exhaustive `switch` in `entitlements.ts`, so adding an `Entitlement`
variant is a compile error rather than a silently-permissive default. It is inert today —
`BILLING_ENABLED=false` means `resolveEntitlement` returns `pro` for everyone and touches no DB.

---

## 4. Knock-on: the GDPR export

`sealedResults` was in the export payload, so removing the column changes the exported **shape** →
`EXPORT_VERSION` **2 → 3**. That constant versions the schema, not the app, which is exactly why a
removed field moves it. The archive snapshot (`ElectionSnapshot`) never carried the field and is
untouched.

The wizard toggle was replaced rather than deleted: same position in the step-4 list, now
`{ key: "liveResults", pro: true }` with a `ProBadge`. Its description states the default explicitly
— *"Isključeno, rezultate vidite tek nakon zatvaranja — i vi i birači"* — because "off" is the old
"sealed results" promise, and an admin should not think they lost a feature they never had.

---

## 5. Tests

**518 passing** (+5). All three guard mutations were checked; each turns a *named* test red:

| Mutation | Tests that went red |
| --- | --- |
| guard removed entirely | *Free ne može odabrati LIVE*, *zaštita vrijedi i za skicu* |
| write ignores the toggle (`resultsMode` always `AFTER_CLOSE`) | *uključen prekidač piše LIVE* |
| guard ignores the user's choice (drops `w.liveResults &&`) | *Free bez LIVE-a prolazi normalno* + 2 voter-cap tests |

The first mutation initially appeared to pass — it had silently failed to apply, because
`create-election.ts` is CRLF and the multi-line search string never matched. **A mutation that does
not apply looks exactly like a mutation that is not caught.** Re-run single-line, it was caught.

---

## Files changed

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `sealedResults` removed, replaced by a comment recording why |
| `prisma/migrations/20260808151527_drop_sealed_results/` | new, one `DROP COLUMN` |
| `src/lib/entitlements.ts` | `canUseLiveResults` |
| `src/actions/create-election.ts` | `liveResults` in the schema, writes `resultsMode`, Pro guard |
| `src/components/elections/wizard/{wizard-shared,election-wizard,step-settings,step-review}.tsx` | `sealedResults` → `liveResults`, now `pro: true` |
| `src/lib/organization-export.ts` | field removed, `EXPORT_VERSION` 3 |
| `src/lib/db/organization.ts` | field removed from the `select` |
| `messages/{hr,en}.json` | step-4 toggle copy replaced in place |
| `src/actions/create-election.test.ts`, `src/lib/organization-export.test.ts` | +5 tests, fixtures updated |

---

## Verification

`npm run lint` clean · `npx tsc --noEmit` clean · `npx vitest run` **518 passed** ·
`npm run build` clean · migration applied to the Neon **development** branch.

Browser pass on a throwaway pre-verified admin (the demo seed has never been run on this database,
so there was no account to sign in as):

| Check | Result |
| --- | --- |
| step 4 renders the new toggle | *"Rezultati uživo tijekom glasovanja"* + description |
| old toggle gone | *"Zapečaćeni rezultati"* absent from the DOM |
| Pro badge | present; a11y text reads **"PRO plan"** |
| toggle on → save draft | DB: `resultsMode: "LIVE"`, `status: "DRAFT"` |
| `resultsVisible` | still `false` — untouched, as designed |
| election set ACTIVE | overview shows **"Uživo — glasanje traje"** with the pulse; the sealed variant absent |
| results facet | renders the **tally**, not the sealed notice |

The last two are the payoff: that read side had never executed against a real LIVE row before.

Fixture org, admin, account and election all deleted afterwards (`usersLeft: 0`); dev server stopped;
temp scripts removed.

### Not verified

- **The Free refusal was never seen in the browser.** `BILLING_ENABLED=false` means every org
  resolves Pro, so the UI cannot reach that path today. It is unit-tested and mutation-checked.
- **The public results page** — untouched by design, still a scaffold behind its 404.

---

## Still open in the parent spec

- **§3 admin turnout emails** — the last slice; ships as "Uskoro" + disabled, not removed.
- **The public results page** still owes its own spec. `resultsVisible` is built, read, and has no
  writer — the same shape `resultsMode` was in before this slice. Whoever picks it up inherits a
  working gate and an empty page.

With §1 shipped, **both launch-blocking Pro claims are now true**: live results (this slice) and
automatic 24-hour reminders (§2).
