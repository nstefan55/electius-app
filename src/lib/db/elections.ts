import "server-only";

import { prisma } from "@/lib/prisma";
import type { DashboardElection } from "@/lib/elections-view";

// "Jun 18" — matches the old mock date format.
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Schema only has SINGLE_CHOICE / MULTI_CHOICE; render as readable labels.
const VOTING_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTI_CHOICE: "Multiple choice",
};

export interface DashboardStats {
  activeElections: number;
  totalVoters: number;
  avgTurnout: number; // percent
  archived: number;
}

export interface DashboardData {
  elections: DashboardElection[];
  stats: DashboardStats;
}

// Everything the dashboard main area needs, in one round trip.
// `voted` = ballots cast (anonymous Vote rows); equals voters with status VOTED.
export async function getDashboardData(): Promise<DashboardData> {
  const rows = await prisma.election.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      votingType: true,
      status: true,
      resultsMode: true,
      startsAt: true,
      endsAt: true,
      _count: { select: { voters: true, votes: true } },
    },
  });

  const elections: DashboardElection[] = rows.map((e) => ({
    id: e.id,
    name: e.title,
    type: VOTING_TYPE_LABEL[e.votingType] ?? e.votingType,
    status: e.status,
    resultsMode: e.resultsMode,
    voters: e._count.voters,
    voted: e._count.votes,
    opens: fmtDate(e.startsAt),
    closes: fmtDate(e.endsAt),
  }));

  return { elections, stats: computeStats(elections) };
}

function computeStats(els: DashboardElection[]): DashboardStats {
  const withVoters = els.filter((e) => e.voters > 0);
  const avgTurnout = withVoters.length
    ? Math.round(
        (withVoters.reduce((s, e) => s + e.voted / e.voters, 0) /
          withVoters.length) *
          100,
      )
    : 0;

  return {
    activeElections: els.filter((e) => e.status === "ACTIVE").length,
    totalVoters: els.reduce((s, e) => s + e.voters, 0),
    avgTurnout,
    archived: els.filter((e) => e.status === "ARCHIVED").length,
  };
}

// Live turnout for the hero panel's polling (see actions/dashboard.ts).
export async function getElectionTurnout(id: string) {
  const e = await prisma.election.findUnique({
    where: { id },
    select: { _count: { select: { voters: true, votes: true } } },
  });
  return e ? { voters: e._count.voters, voted: e._count.votes } : null;
}
