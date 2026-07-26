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