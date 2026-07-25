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

## Dashboard

### Dynamic Footer Hint Generator

Generate random facts to the administrator of the current features what he can do and have it change every day, its going to fetch from a JSON file named daily-feature-hints.json