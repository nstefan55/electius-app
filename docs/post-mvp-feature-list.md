# Post MVP Features List

## Elections

Pin Elections (PRO feature)
QR Code Generation for Voters

### Wizard Edit Mode

The **Edit** button on `/elections/[id]` (election-overview phase 1) is a placeholder toast — there is no edit route. Make the 5-step wizard accept an existing election (`/elections/new?edit=<id>`), prefill every step from the DB, and update instead of create. Only reachable for `DRAFT` / `SCHEDULED` elections, since editing a running vote is not allowed. Needs: a detail query for wizard hydration, an `updateElection` server action, and wizard state hydration.

### Reminder Send Cooldown

`sendElectionReminders` (election-overview phase 3) has no rate limit — it is session-gated and org-scoped, but an admin can click **Send reminder** repeatedly and every click re-mints a fresh token for each recipient, invalidating the link from the click before. Voters get a burst of near-identical emails, each one killing the last link. Marked `ponytail:` at the call site in `src/actions/elections.ts`.

Options, cheapest first:
- A per-election cooldown window in Upstash (`src/lib/rate-limit.ts` already has the sliding-window helper — add a `reminder` rule keyed on election id, e.g. 1 per hour) and surface the remaining time in the modal instead of the Send button.
- Persist `lastReminderAt` on `Election` (needs a migration) if the cooldown should survive a Redis flush and be visible in the UI as "last reminded 2 h ago".

The client-side `pending` guard only covers the in-flight request, not a second click a minute later.

### Reminder Email Copy

A reminder currently re-sends the invitation email verbatim — same subject, same body — because the spec phrased it as "sends invite" (`voter.inviteEmail` in the catalogs, reused by `sendReminders`). A voter who has been reminded receives what reads as a duplicate invitation.

Add a `voter.reminderEmail` namespace (hr + en) with reminder-flavoured copy ("You haven't voted yet", closing date, the new link) and give `sendInvitationEmails` a variant parameter — or split a `sendReminderEmails` sender sharing the same `sendActionEmail` template. No schema change; catalogs + one branch in `email.service.ts`.

Worth pairing with the deadline: the reminder body is the natural place to say *when* voting closes, which the invitation does not currently state.

## Archive

### Hide an Archived Election

`archive-list.tsx` shipped a **Hide** row action as a `comingSoon` toast from routing-phase-3 until `elections-archived-phase-2` (2026-07-30), which dropped it along with the ⋯ menu — the card design has three real actions and no menu, and a control that only ever toasts is worse than no control.

It needs its own spec before it can come back, because **there is no `hidden` field in the schema** and the feature is not defined:

- What does "hidden" mean for a row that is *already* in an archive? Hidden from `/archive` only, or from `/results` and the dashboard stats too? If turnout stats keep counting it, "hidden" is cosmetic; if they stop, hiding an election silently changes the organization's average turnout.
- Migration: a nullable `hiddenAt` on `Election` (who/when, and reversible) beats a bare boolean.
- Where does the unhide affordance live? A hidden row that cannot be found again is a delete with extra steps.

Pairs naturally with the retention/billing spec — both are about what an organization sees in a full archive.

### Delete from the Archive

Also dropped in `elections-archived-phase-2`. The ruling it needs is a real one: **deleting the `Archive` row and deleting the election are different operations.**

- `deleteElection` already exists and removes *both*, cascading voters, tokens, options and votes (its transaction clears `Archive` + `Vote` first — neither has an `onDelete` cascade, by design).
- The Free-tier copy promises "delete any archive at any time", which reads as dropping the *stored artifact* while the election record survives — a different, unbuilt operation.

Decide which one the archive offers, then decide whether it is reachable from a list at all: an archive is the record an organization keeps, and a one-click destroy beside "View" is the wrong ergonomics for it. Blocked on nothing but the decision; belongs with the retention/billing spec, which is where the promise was made.

## Exports

### XLSX Export

Both CSV exports (voter roster, shipped `v0.9.5`; results tally, spec'd) carry a `sep=;` first line so Excel splits into columns regardless of the reader's Windows list separator — Excel splits on the *reader's* OS setting, not on what the file contains, so a locale-keyed delimiter alone puts the whole export in column A on a mismatched machine.

That line is an Excel/LibreOffice directive. **Google Sheets and pandas do not implement it and show `sep=;` as a data row.** A real `.xlsx` is the clean fix: a spreadsheet has genuine columns, so there is no delimiter to guess and no preamble to strip.

Worth doing when either happens: an admin pipes an export into Sheets or a script and hits the junk row, or the results export wants formatting the PDF report already has (bold headers, column widths, a merged organization row — none of which CSV can express, which is why `election-results-csv-export-spec` had to drop that language).

Shape:
- One package, user-approved before install — `write-excel-file` (~40 KB, no native deps) or `exceljs` if styling gets serious.
- `src/lib/csv.ts` stays as-is. Add a sibling `xlsx.ts` with the same `rows → buffer` signature; the builders in `voter-export.ts` already return plain string rows, so they feed either writer unchanged.
- Route handlers take a `?format=csv|xlsx` param, or gain a second button. Decide whether XLSX **replaces** CSV for the roster or sits beside it — two buttons in an Actions card that already has five is a real UI cost.

Once XLSX exists, the `sep=` line can be reconsidered: keep it for CSV consumers on Excel, or drop it and point Excel users at the XLSX download instead.

## Dashboard

### Dynamic Footer Hint Generator

Generate random facts to the administrator of the current features what he can do and have it change every day, its going to fetch from a JSON file named daily-feature-hints.json