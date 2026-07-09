import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { DashboardElection, ElectionStatus } from "@/lib/elections-view";

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

// Prisma `select` shared by every election-list/detail query below.
const ELECTION_SELECT = {
  id: true,
  title: true,
  votingType: true,
  status: true,
  resultsMode: true,
  startsAt: true,
  endsAt: true,
  _count: { select: { voters: true, votes: true } },
} as const;

type ElectionRow = {
  id: string;
  title: string;
  votingType: string;
  status: ElectionStatus;
  resultsMode: DashboardElection["resultsMode"];
  startsAt: Date;
  endsAt: Date;
  _count: { voters: number; votes: number };
};

const toDashboardElection = (e: ElectionRow): DashboardElection => ({
  id: e.id,
  name: e.title,
  type: VOTING_TYPE_LABEL[e.votingType] ?? e.votingType,
  status: e.status,
  resultsMode: e.resultsMode,
  voters: e._count.voters,
  voted: e._count.votes,
  opens: fmtDate(e.startsAt),
  closes: fmtDate(e.endsAt),
});

// Everything the dashboard main area needs, in one round trip.
// `voted` = ballots cast (anonymous Vote rows); equals voters with status VOTED.
export async function getDashboardData(): Promise<DashboardData> {
  const rows = await prisma.election.findMany({
    orderBy: { createdAt: "desc" },
    select: ELECTION_SELECT,
  });

  const elections = rows.map(toDashboardElection);
  return { elections, stats: computeStats(elections) };
}

// Cross-election list routes: /results (CLOSED), /archive (ARCHIVED), /voters (all).
export async function getElectionsByStatus(
  status?: ElectionStatus,
): Promise<DashboardElection[]> {
  const rows = await prisma.election.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    select: ELECTION_SELECT,
  });
  return rows.map(toDashboardElection);
}

// One election for the /elections/[id] aggregate-root layout + its facets.
// cache()-wrapped: the layout (chrome) and each facet page share a SINGLE DB
// round trip per request — App Router can't prop-drill layout→page, so request
// memoization is the "fetch once" seam. Returns null → layout renders notFound().
export const getElectionDetail = cache(
  async (id: string): Promise<DashboardElection | null> => {
    const e = await prisma.election.findUnique({
      where: { id },
      select: ELECTION_SELECT,
    });
    return e ? toDashboardElection(e) : null;
  },
);

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
