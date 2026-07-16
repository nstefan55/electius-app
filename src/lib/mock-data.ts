// Mock data — imported by prisma/seed.ts (Node) only; the app reads real data
// (requireSession() is a real BetterAuth session as of auth-phase-3).
// ponytail: no "server-only" guard — seed runs under tsx (no react-server condition)
// and would throw. Client components MUST NOT import from here.

export type ElectionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "CLOSED"
  | "ARCHIVED";

export interface MockElection {
  id: string;
  name: string;
  type: string;
  status: ElectionStatus;
  voters: number;
  voted: number;
  opens: string;
  closes: string;
}

export interface MockUser {
  name: string;
  email: string;
  organization: string;
  isPro: boolean;
}

export const currentUser: MockUser = {
  name: "Nikola Štefančić",
  email: "nikola.stefancic@gmail.com",
  organization: "University of Applied Sciences Velika Gorica",
  isPro: true,
};

export const elections: MockElection[] = [
  { id: "1", name: "Student Council representative election", type: "Single choice", status: "ACTIVE", voters: 412, voted: 282, opens: "Jun 18", closes: "Jun 24" },
  { id: "2", name: "Cafeteria vendor referendum", type: "Yes / no referendum", status: "ACTIVE", voters: 620, voted: 410, opens: "Jun 20", closes: "Jun 23" },
  { id: "3", name: "Faculty senate seat — Engineering", type: "Single choice", status: "ACTIVE", voters: 156, voted: 98, opens: "Jun 19", closes: "Jun 25" },
  { id: "4", name: "Library committee chair", type: "Ranked choice", status: "SCHEDULED", voters: 89, voted: 0, opens: "Jun 28", closes: "Jul 2" },
  { id: "5", name: "Annual budget ratification", type: "Yes / no referendum", status: "CLOSED", voters: 1240, voted: 851, opens: "Jun 1", closes: "Jun 8" },
  { id: "6", name: "Sports association board", type: "Multiple choice", status: "DRAFT", voters: 0, voted: 0, opens: "—", closes: "—" },
  { id: "7", name: "Department head election — Law", type: "Single choice", status: "ARCHIVED", voters: 340, voted: 301, opens: "May 5", closes: "May 12" },
  { id: "8", name: "Spring semester schedule poll", type: "Multiple choice", status: "ARCHIVED", voters: 980, voted: 612, opens: "Apr 1", closes: "Apr 8" },
];

// Summary stats shown on the dashboard cards.
export const dashboardStats = {
  activeElections: 3,
  totalVoters: 3837,
  avgTurnout: 66, // percent
  archived: 2,
};
