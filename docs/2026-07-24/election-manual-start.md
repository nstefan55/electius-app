# Election Manual Start

> Branch `feature/election-manual-start` · Spec `context/features/Election Spec Files/election-manual-start-spec.md` · Design `Election Start.dc.html`

A manually-configured election sits as **DRAFT** until the admin opens voting themselves. Visiting `/elections/[id]` for a DRAFT election now shows the **Start election** screen instead of the overview scaffold: a review card (election, candidates, voter count, close date, reminder), an orange "this sends emails immediately" warning, and the **Start election & send invitations** button. Non-draft statuses (SCHEDULED / ACTIVE / CLOSED / ARCHIVED) never see it — they keep their normal overview.

## Scope decision — status flip only

**Starting an election does NOT send emails yet.** The button flips `DRAFT → ACTIVE` (and sets `startsAt` to the click moment); token generation + Resend invitations belong to the future election-publication spec. Two consequences, both deliberate:

- **Voters stay `PENDING`** — `INVITED` means "invitation sent" (schema docs), and no email was sent. The publication pipeline flips them when invites really go out.
- The warning/success copy still promises emails (spec + prototype copy kept verbatim) — a known over-promise until the pipeline lands.

## Flow

1. Admin opens a DRAFT election → `[id]/layout.tsx` swaps the chrome: h1 "Pokreni izbore", subtitle `{title} — {type}`, **no tabs**; the overview page renders `StartElectionCard`.
2. Click Start → `startElection(id)` server action → success swaps the card to a client-side confirmation ("Glasanje je pokrenuto") with **Back to elections** / **View election**.
3. **View election** calls `router.refresh()` — the route re-renders as ACTIVE with the normal chrome (title + badge + tabs). The success card deliberately does *not* auto-refresh: refreshing unmounts it before the admin sees the confirmation.

## The atomic status guard

```ts
await prisma.election.updateMany({
  where: { id, organizationId, status: "DRAFT" },
  data: { status: "ACTIVE", startsAt: new Date() },
});
```

The DRAFT-only rule lives **in the WHERE clause**, not in a prior read — check + flip is one statement, so a double-click, a second admin, or a devtools-resurrected button all match zero rows and return `{ error: "invalidStatus" }`. The same clause is the org-ownership check; "not yours", "missing", and "not a draft" collapse into one error (never expose "exists but forbidden").

## Files

| File | Change |
| --- | --- |
| `src/actions/elections.ts` | New `startElection(id)` — atomic `updateMany` guard, `startsAt = now`, `endsAt` untouched |
| `src/actions/elections.test.ts` | New — 4 Vitest cases; pins the WHERE-clause atomicity, `count 0 → invalidStatus`, error paths |
| `src/lib/db/elections.ts` | New `getElectionStartInfo(id, orgId)` — `electionType` + candidate count (`_count.options`), `cache()`-wrapped so layout + page share one round trip |
| `src/app/[locale]/(app)/elections/[id]/layout.tsx` | DRAFT branch: start-screen header (no tabs); other statuses unchanged |
| `src/app/[locale]/(app)/elections/[id]/page.tsx` | DRAFT → `StartElectionCard`; SCHEDULED split off DRAFT (keeps the setup scaffold) |
| `src/components/elections/start-election-card.tsx` | New client component — review card + success card, `useTransition`, toasts |
| `messages/hr.json` / `messages/en.json` | New `dashboard.election.start` namespace (+29 lines each, hr paucal plurals) |

## Implementation notes

- **Type labels reused** from `dashboard.wizard.step1.types.{STANDARD,POLL,SURVEY}.label` — no duplicated translations.
- **`DashboardElection` untouched**: the extra fields ride in a narrow, DRAFT-only query instead of widening the shared list interface that feeds dashboard/lists/charts/filters.
- **Close date** formats in UTC (like `formatVotingDate`) → identical server/browser output, no hydration mismatch. `closes === opens` detects the wizard's unscheduled-draft placeholder → "Nije zakazano".
- **Reminder row** is the static default "Automatski · 24 h prije roka" — no custom reminder datetime exists in the schema (skipped in the wizard); revisit when reminders ship.
- The prototype's standalone guard card ("this election can't be started manually") was **not** built — non-drafts structurally never render the start UI, and the server action enforces the rest.

## Verification

- `npm run test` 44/44 · `npm run build` passes
- Playwright (hr + en, seeded dev DB): review card renders with correct paucal forms ("2 kandidata", "1 birač"), close date localized; Start → success card → View election → ACTIVE chrome + badge. Zero console errors.
- DB proven via Neon SELECT (development branch): `status ACTIVE`, `startsAt` = click time, `endsAt` untouched. Test election restored to DRAFT afterwards.
