# All Elections Page Phase 2 — Election Creation Wizard

> Branch `feature/all-elections-page-phase-2` · Spec `context/features/all-elections-page-phase-2.md` · Design `context/design/electius-app-design-prototype/project/Election Wizard.dc.html` · v0.5.0

The 5-step election creation wizard at `/elections/new`, replacing the routing-phase-1 scaffold. It renders as a **centered modal filling ~90% of the viewport** over the dashboard shell (full-screen below `md`) — the route stays real and deep-linkable; the "modal" is page styling, not a client dialog. Confirming creates the election with its options and voters in one nested Prisma create; "Save as draft" persists at any point after a title exists.

## What was built

| File | Role |
| --- | --- |
| `prisma/migrations/20260723081207_add_wizard_fields` | Adds `Election.adminTurnoutReminder` + `Election.sealedResults` (both default `false`) and `VoteOption.description` (nullable — candidate role) |
| `src/lib/wizard-csv.ts` (+ `.test.ts`) | Pure CSV layer: `validateCsvFile` (extension + MIME + 1 MB cap), `parseCandidatesCsv` (`name, role?`), `parseVotersCsv` (`full_name, email` both required), zod row schemas, header-row detection (en + hr), skipped-row counting |
| `src/actions/create-election.ts` (+ `.test.ts`) | One org-scoped server action, two modes: full create / draft (`draft = true`). Zod-validates the whole payload, re-enforces the type/method coupling, ≥2 candidates and schedule sanity (full create only), dedupes voter emails case-insensitively, splits voter names into first/last |
| `src/components/elections/wizard/election-wizard.tsx` | Client shell: step state, top bar (X → `/elections`, title + "Step X of 5 · name", Eye + trust line, Save as draft), clickable stepper, scroll body, footer nav (Back / Continue / Create), validation gates, submit + draft flows |
| `.../wizard-shared.tsx` | `WizardData` type + initial state, `SelectCard`, `Toggle` (iOS switch), `ModeTabs` (manual/CSV), `CsvDropZone` (drag-drop + browse, file gate), `StepCard`, `ProBadge` |
| `.../step-basic-info.tsx` | Step 1 — title (required), description, type × method cards with coupling |
| `.../step-candidates.tsx` | Step 2 — manual add (Enter commits) or CSV, abstain toggle (PRO), removable list, "add at least two" empty state |
| `.../step-voters.tsx` | Step 3 — manual add (name + email required, dupes rejected) or CSV, Remove all, list with mono emails |
| `.../step-settings.tsx` | Step 4 — start mode (manual/scheduled), `DateTimeField` (split date + time inputs), 5 option toggles, quorum % input |
| `.../step-review.tsx` | Step 5 — read-back cards with per-section Edit jumps, enabled-options chips, locale-aware datetime formatting |
| `.../wizard-success.tsx` | Created screen — summary grid (method, counts, closes, election ID) + Create another / Go to election |
| `src/app/[locale]/(app)/elections/new/page.tsx` | Mounts the wizard in the 90% modal frame (backdrop `bg-black/40`) |
| `messages/hr.json` / `messages/en.json` | New `dashboard.wizard` namespace (~195 keys each): chrome, 5 steps, success, errors — ICU plurals with hr paucal forms |

## Domain rules

- **Type/method coupling** (enforced in UI *and* action): STANDARD supports both methods; SURVEY → `MULTI_CHOICE` only; POLL (Quick poll) → `SINGLE_CHOICE` only. Picking a restrictive type auto-corrects the method; the disabled card shows a toast on click.
- **Status on create:** manual start → `DRAFT` (admin opens voting later — election-manual-start spec); scheduled → `SCHEDULED`. Draft saves are always `DRAFT`.
- **Placeholder dates:** `startsAt`/`endsAt` are NOT NULL, so unscheduled drafts persist `now` and rely on the established phase-1 display rule (DRAFT renders "Not scheduled").
- **Schedule validation:** scheduled mode requires both datetimes with `closes > opens`; manual mode only rejects a close date in the past. Draft mode skips both (title is the only requirement).
- **Voter uniqueness:** `@@unique([email, electionId])` — the action drops duplicate emails (case-insensitive) before the nested create; the UI rejects them at entry with a toast.
- **Candidates → `VoteOption`:** `text` = name, `description` = role, `orderIndex` = list position. Abstain stays a boolean on the election (no synthetic option row).

## Two bugs found in browser verification (both fixed)

1. **`router.refresh()` immediately after `router.push()` cancels the navigation** and leaves the transition (and `isPending`) permanently pending. The draft-save flow now only pushes — `/elections` is dynamic and re-fetches fresh on navigation anyway.
2. **`datetime-local` reports `value=""` until *every* segment is filled**, so date-only entry (time left `--:--`) silently never reached React state and the schedule check failed with a misleading toast. Fix: `DateTimeField` splits into a native `date` input (required) + `time` input (optional; opens defaults `00:00`, closes `23:59`) and composes the `"YYYY-MM-DDTHH:mm"` string the action expects. Matches the spec's "scheduled date & time, or date only".

## Decisions

- **Modal-as-page** — no intercepting/parallel routes; a `fixed inset-0` frame in the page keeps refresh/deep-link semantics for free.
- **No new dependencies** — native date/time/number inputs, existing zod + react-hot-toast + Lucide; CSV parsing is a naive comma split (`ponytail:` comment marks the quoted-cell ceiling — swap in a real parser if users hit quoted commas).
- **Skipped by scope:** the design's QR block on the success screen and the custom voter-reminder datetime belong to the phase-2.5/3 specs; the reminder toggle maps to the existing `voterReminder24h`. PRO badges are visual only (MVP enforces nothing).
- **Stepper allows free jumping** (design parity); gates re-run on Continue and on Create, and the server action is the trust boundary regardless.

## Verification

- `npm run test` — 40/40 (17 new: 9 CSV, 8 action — validation short-circuit, coupling, draft leniency, schedule window, DRAFT/SCHEDULED mapping, voter dedupe + name splitting, DB-error mapping)
- `npm run build` — passes; `/[locale]/elections/new` resolves ƒ
- Playwright on the seeded dev DB (hr + en): full walk-through — coupling, both validation gates, Enter-to-add, real CSV upload (header skipped, malformed row reported), quorum input, review plurals, create → success with real ID; DB row proven exact via Neon SELECT (status, window, sealed, quorum, options incl. role, split voter names); draft save round trip; test rows deleted through the app's own delete flow (seed restored, zero orphans)
