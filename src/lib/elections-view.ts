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

// Non-archived elections, sorted Active > Scheduled > Closed > Draft.
export const sortRecent = (els: DashboardElection[]) =>
  els
    .filter((e) => e.status !== "ARCHIVED")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
