# Post MVP Features List

## Elections

Pin Elections (PRO feature)
QR Code Generation for Voters

### Wizard Edit Mode

The **Edit** button on `/elections/[id]` (election-overview phase 1) is a placeholder toast — there is no edit route. Make the 5-step wizard accept an existing election (`/elections/new?edit=<id>`), prefill every step from the DB, and update instead of create. Only reachable for `DRAFT` / `SCHEDULED` elections, since editing a running vote is not allowed. Needs: a detail query for wizard hydration, an `updateElection` server action, and wizard state hydration.

## Dashboard

### Dynamic Footer Hint Generator

Generate random facts to the administrator of the current features what he can do and have it change every day, its going to fetch from a JSON file named daily-feature-hints.json