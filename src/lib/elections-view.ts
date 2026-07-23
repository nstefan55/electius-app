// Pure view helpers for dashboard election data — shared by server and client
// components, so charts and the live hero can import the types + sort rule too.
// No DB, no `server-only`. Shape mirrors the old mock-data MockElection.

export type ElectionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "CLOSED"
  | "ARCHIVED";

export type ResultsMode = "AFTER_CLOSE" | "LIVE";

export interface DashboardElection {
  id: string;
  name: string;
  type: string;
  status: ElectionStatus;
  resultsMode: ResultsMode;
  voters: number;
  voted: number;
  opens: string;
  closes: string;
}

// Recent-elections sort priority. Archived lives in the Archive tab, excluded here.
const STATUS_ORDER: Record<ElectionStatus, number> = {
  ACTIVE: 0,
  SCHEDULED: 1,
  CLOSED: 2,
  DRAFT: 3,
  ARCHIVED: 4,
};

// Badge tint + status-dot + turnout-bar classes per status (design-system §7.9 /
// §2 status colors). Shared by the recent-elections list and the aggregate-root
// StatusBadge so one status renders identically everywhere.
export const STATUS_STYLES: Record<
  ElectionStatus,
  { badge: string; dot: string; bar: string }
> = {
  ACTIVE: { badge: "bg-success-50 text-success-700", dot: "bg-status-active", bar: "bg-status-active" },
  SCHEDULED: { badge: "bg-warning-50 text-warning-700", dot: "bg-status-scheduled", bar: "bg-status-scheduled" },
  CLOSED: { badge: "bg-error-50 text-error-700", dot: "bg-status-closed", bar: "bg-status-closed" },
  DRAFT: { badge: "bg-brand-50 text-brand-700", dot: "bg-status-draft", bar: "bg-status-draft" },
  ARCHIVED: { badge: "bg-neutral-100 text-neutral-600", dot: "bg-status-archived", bar: "bg-status-archived" },
};

// Non-archived elections, sorted Active > Scheduled > Closed > Draft.
export const sortRecent = (els: DashboardElection[]) =>
  els
    .filter((e) => e.status !== "ARCHIVED")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

// Filter-toolbar predicates (design: Elections.dc.html). Pure so the client
// list and unit tests share one rule set.
export type StatusFilter = "all" | ElectionStatus;
export type TurnoutFilter = "all" | "high" | "medium" | "low" | "none";
export type WindowFilter = string; // "all" | "unscheduled" | a close-date year like "2026"

export const matchesTurnout = (
  e: Pick<DashboardElection, "voters" | "voted">,
  f: TurnoutFilter,
) => {
  if (f === "all") return true;
  if (f === "none") return e.voters === 0 || e.voted === 0;
  if (e.voters === 0) return false;
  const p = Math.round((e.voted / e.voters) * 100);
  if (f === "high") return p >= 75;
  if (f === "medium") return p >= 40 && p < 75;
  return p > 0 && p < 40; // low
};

// Schema requires startsAt/endsAt, so DRAFT rows carry placeholder dates —
// "unscheduled" keys on status, same rule as the list's "Not scheduled" cell.
export const matchesWindow = (
  e: Pick<DashboardElection, "status" | "closes">,
  f: WindowFilter,
) => {
  if (f === "all") return true;
  if (f === "unscheduled") return e.status === "DRAFT";
  if (e.status === "DRAFT") return false;
  return String(new Date(e.closes).getUTCFullYear()) === f;
};

// Distinct close-date years for the window select, newest first.
export const windowYears = (els: DashboardElection[]) =>
  [
    ...new Set(
      els
        .filter((e) => e.status !== "DRAFT")
        .map((e) => new Date(e.closes).getUTCFullYear()),
    ),
  ]
    .sort((a, b) => b - a)
    .map(String);

// Voting-window date, locale-aware: en "Jun 18" · hr "18. lip". Takes the ISO
// string from DashboardElection.opens/closes. timeZone UTC keeps output
// deterministic across server/browser timezones (prod serverless runs UTC).
const DATE_LOCALE: Record<string, string> = { hr: "hr-HR", en: "en-US" };

export const formatVotingDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
