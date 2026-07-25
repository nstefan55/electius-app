# Election Overview Phase 1 — Top Bar & Sidebar

> Branch: `feature/election-overview-phase-1` · v0.9.3 · Spec: `election-overview-phase-1-spec` (Election Spec Files) · Design: `context/design/electius-app-design-prototype/project/Election Overview.dc.html`
> Phase 1 of 3. This is **chrome only** — the overview *body* (live turnout, invited/voted/pending stats, time-left, Send Reminder / Voter List / Export CSV / QR actions) belongs to phases 2–3.

## What shipped

The top bar for `/elections/[id]`: election title with an "Election Overview" subtitle, a live status chip, and a set of actions whose visibility is driven entirely by the election's status.

| Surface | File |
| --- | --- |
| Top bar + all three modals | `src/components/elections/election-topbar.tsx` |
| Close-early mutation | `src/actions/elections.ts` (`closeElection`) |
| Ballot-preview query | `src/lib/db/elections.ts` (`getBallotPreview`) |
| Aggregate-root chrome | `src/app/[locale]/(app)/elections/[id]/layout.tsx` |
| Status chip (gained `size`) | `src/components/elections/status-badge.tsx` |
| Shared date formatter | `src/lib/elections-view.ts` (`formatVotingDateTime`) |
| i18n | `messages/{hr,en}.json` → `dashboard.election.topbar` |

## Action visibility — the one table that matters

Straight from the spec. `ElectionTopbar` derives these from `status` alone; there is no other gating.

| Action | Visible when | Behaviour |
| --- | --- | --- |
| **Edit** | `DRAFT` · `SCHEDULED` | Placeholder toast — see *Known gap* below |
| **Preview ballot** | always | Modal mockup of the voter's ballot |
| **Close election** | `ACTIVE` only | Confirm modal → `closeElection` → `router.refresh()` |
| **Remove election** | everything **except** `ACTIVE` | Confirm modal → `deleteElection` → `router.push('/elections')` |
| **Exit** | always | `Link` back to `/elections` |

Editing a running election is not allowed, and a running election cannot be removed — it must be closed first. Those two rules are why Close and Remove are mutually exclusive.

## `closeElection` — atomic status guard

```ts
const { count } = await prisma.election.updateMany({
  where: { id, organizationId, status: "ACTIVE" },
  data: { status: "CLOSED", endsAt: new Date() },
});
if (count === 0) return { success: false, error: "invalidStatus" };
```

The same pattern as `startElection`. **The `where` clause is the check** — org ownership and the status guard are one statement, so there is no read-then-write window. A double-click, a cross-org id, an already-closed election, and a future race with an auto-close deadline sweep all land on `count === 0` and no-op. "Missing", "forbidden" and "not active" deliberately collapse into one `invalidStatus` error — the UI never needs to distinguish them, and the client never learns whether an id exists in another org.

`endsAt` is set to the click moment so the window reads as genuinely over everywhere it is rendered (turnout bars, "time left", the voter-flow state router). `startsAt` is untouched. This mirrors `startElection` setting `startsAt` at its click.

Covered by 4 Vitest cases in `src/actions/elections.test.ts` that pin the WHERE-clause shape and the `endsAt`-is-now assertion.

## Chrome changes to the `[id]` layout

Two structural changes worth knowing before you touch this layout:

1. **One header for every status.** The DRAFT-only "Pokreni izbore" header from the manual-start feature (v0.7.0) is gone — the top bar now renders for all five statuses, which it must, since Edit is `DRAFT`/`SCHEDULED`-only. The start card underneath keeps its own "Spremni pokrenuti glasanje?" heading, so nothing reads as missing.
2. **The layout no longer double-pads.** It previously added `p-8` on top of the shell's `p-8`. The shell's padding is the convention (`/elections`, `/settings`, etc. add none), so the layout wrapper is now bare and the header uses `-mx-8 -mt-8` to sit flush.

The header background is `bg-neutral-50` — the same token as the page background — so it blends in and only the bottom border separates it from the tab nav. The action buttons keep their white fill to stay legible against it.

`ElectionTabs` (Overview · Results · Voters) still renders for every status, including drafts.

## Data reads

`getElectionDetail` stays the single `cache()`-wrapped read shared by the layout and every facet page — one DB round trip per request.

`getBallotPreview` is a **separate** query rather than a widening of the shared `ELECTION_SELECT`. That is deliberate: the `/results` and `/voters` facets would otherwise pay for ballot options they never render. It selects `votingType` plus each option's `id`, `text` and `description`, ordered by `orderIndex` — the same rows the real ballot renders, so the preview cannot drift from what voters see.

The organization name in the preview modal comes from `requireSession().user.organization` — no extra query.

## Preview modal

A mockup, not a ballot. The submit button is permanently `disabled`, options are inert, and there is no form state. Option indicators render as circles for `SINGLE_CHOICE` and squares for `MULTI_CHOICE`, matching the voter flow. An election with no options yet shows an empty-state line instead of a blank list.

## Shared bits touched

- **`StatusBadge`** gained an optional `size` prop. `sm` (default) is unchanged everywhere it was already used; `md` is the top bar's larger chip and pulses the dot when the election is `ACTIVE`, so a live election reads as live.
- **`formatVotingDateTime`** ("9. srp 2026. · 18:00" / "Jul 9, 2026 · 6:00 PM") moved into `elections-view.ts` from a private copy inside `start-election-card.tsx`. Both callers now share it. Like `formatVotingDate`, it formats in **UTC** so server and browser render identically — do not remove the `timeZone: "UTC"`, it prevents hydration mismatches.

Unscheduled drafts carry `endsAt === startsAt` (the wizard's placeholder rule), which both callers detect and render as "Not scheduled" instead of a bogus date.

## Known gap — Edit has no destination

There is no edit route in the app; the wizard at `/elections/new` only creates. The Edit button is therefore a **placeholder that fires a toast**, marked with a `ponytail:` comment at the call site. The real work — teaching the wizard an edit mode (`/elections/new?edit=<id>`, prefill from the DB, `updateElection` instead of create) — is recorded in `docs/post-mvp-feature-list.md`. Do not wire Edit to `/elections/new` as-is: it would create a new election rather than edit the current one.

## Verification

- `npm run test` — 94/94 (4 new on `closeElection`)
- `npm run build` — clean
- Browser (seeded dev DB, hr + en, 0 console errors): action visibility confirmed for all five statuses; sidebar "Elections" active on each; close round trip proven in the DB (`status: CLOSED`, `endsAt` = click moment, `startsAt` untouched) and the test row restored to its exact pre-test state afterwards; preview modal renders real candidates; Exit returns to `/elections`.

One bug found and fixed during the browser pass: the preview modal's dismiss button was absolutely positioned and overlapped the "Preview" badge — it now sits inline beside it.
