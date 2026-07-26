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

// ───────── Overview body maths (election-overview-phase-2) ─────────
// Turnout denominator is the FULL voter list, not "invitations sent" — same rule
// as the dashboard, and the only reading that matches "quorum = % of eligible
// voters". A partially-published election therefore reports a lower turnout than
// invited/voted alone would suggest, which is the honest number.
export const turnoutPct = (voted: number, voters: number) =>
  voters > 0 ? Math.round((voted / voters) * 100) : 0;

// Voters needed to clear the quorum bar. Ceil — 49.2 voters is not enough.
export const quorumRequiredVoters = (voters: number, pct: number) =>
  Math.ceil((voters * pct) / 100);

// Jedina derivacija brojki o biračima — dijele je pregled izbora i popis birača,
// da ista dva zaslona nikad ne prijave različite brojeve.
// `voted` su prebrojani listići (Vote), ne status birača; `notInvited` je broj
// birača sa statusom PENDING (uvezeni, e-pošta im nikad nije uspješno poslana).
export const voterCounts = ({
  total,
  notInvited,
  voted,
}: {
  total: number;
  notInvited: number;
  voted: number;
}) => ({
  total,
  invited: Math.max(0, total - notInvited),
  voted,
  pending: Math.max(0, total - voted),
});

// Countdown split for the "Time left" stat card. Returns parts (not a label) so
// the unit suffixes stay in the i18n catalogs. Clamped at zero: a target in the
// past reads 0h 0m rather than counting up.
export const timeLeftParts = (targetIso: string, nowMs: number) => {
  let ms = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const days = Math.floor(ms / 86_400_000);
  ms -= days * 86_400_000;
  const hours = Math.floor(ms / 3_600_000);
  ms -= hours * 3_600_000;
  return { days, hours, minutes: Math.floor(ms / 60_000) };
};

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

// Full window instant: "9. srp 2026. · 18:00" / "Jul 9, 2026 · 6:00 PM".
// Used where a bare day+month would be ambiguous — the start screen's review
// row and the close-early confirmation. Same UTC determinism as above.
export const formatVotingDateTime = (iso: string, locale: string) => {
  const l = DATE_LOCALE[locale] ?? locale;
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(l, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat(l, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
  return `${date} · ${time}`;
};
