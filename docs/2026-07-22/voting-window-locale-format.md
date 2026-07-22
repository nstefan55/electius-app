# Voting Window — Locale-Aware Date Formatting

> Branch `fix/voting-window-locale-format` · Follow-up flagged in `docs/2026-07-22/all-elections-page-phase-1.md`

Voting-window dates were hardcoded to en-US ("Jun 18") in the DB layer. They now render per active locale: **hr → "18. lip"** (day-first, Croatian month abbreviation), **en → "Jun 18"** (unchanged).

## The change

- **`src/lib/db/elections.ts`** — `fmtDate` deleted; `DashboardElection.opens`/`closes` now carry **ISO strings** (`startsAt.toISOString()`). The DB layer has no request locale, so it stops formatting altogether.
- **`src/lib/elections-view.ts`** — new pure helper:

  ```ts
  formatVotingDate(iso: string, locale: string): string
  ```

  `Intl.DateTimeFormat` with `{ day: "numeric", month: "short", timeZone: "UTC" }`; maps `hr → hr-HR`, `en → en-US`. **UTC is deliberate** — output is deterministic across server/browser timezones and matches prod (Vercel serverless runs UTC); a 23:30 UTC timestamp no longer risks rolling to the next day on a CET machine.

- **Render sites** (all five voting-window consumers):
  - `components/dashboard/recent-elections.tsx` — client, `useLocale()`
  - `components/dashboard/live-hero.tsx` — client, `useLocale()` (the `live.meta` "Closes {date}" param)
  - `components/elections/archive-list.tsx` — client, `useLocale()`
  - `components/elections/election-funnel-list.tsx` — server component, `useLocale()` (sync, works in RSC) — covers both `/results` and `/voters` lists
  - `components/elections/elections-list.tsx` — client, `useLocale()` (DRAFT rows keep the "Not scheduled" rule)

No schema change, no new dependency, no i18n-catalog change (dates aren't copy).

## Notes

- `src/lib/mock-data.ts` untouched — it has its own `MockElection` type and only feeds the seed; no component imports it.
- This fix was originally dispatched to a background subagent in an isolated worktree; the subagent's file writes were permission-denied environment-wide, so its analysis was applied manually on a fresh branch after the all-elections feature merged (letting one pass cover the new page too).

## Verification

- `src/lib/elections-view.test.ts` — 3 new cases: en "Jun 18", hr "18. lip", and the UTC day-boundary guard ("May 4" / "4. svi" at 23:30 UTC). `npm run test` 15/15.
- `npm run build` passes.
- Browser (dev server, both locales): `/hr/elections` ("27. tra – 4. svi"), `/hr/home` recent list + hero ("Zatvara se 23. srp"), `/hr/archive`, `/hr/results`; `/en/*` unchanged ("Jul 17 – Jul 22", "Closes Jul 23"). 0 console errors on fresh loads.
