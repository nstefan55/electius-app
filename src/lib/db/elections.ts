import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { DashboardElection, ElectionStatus } from "@/lib/elections-view";

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
  // ISO strings — the DB layer has no request locale; render sites format
  // per-locale via formatVotingDate (lib/elections-view).
  opens: e.startsAt.toISOString(),
  closes: e.endsAt.toISOString(),
});

// Everything the dashboard main area needs, in one round trip.
// `voted` = ballots cast (anonymous Vote rows); equals voters with status VOTED.
// Scoped to the signed-in org — cross-tenant leak (finding #2) is blocked here.
export async function getDashboardData(
  organizationId: string,
): Promise<DashboardData> {
  const rows = await prisma.election.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: ELECTION_SELECT,
  });

  const elections = rows.map(toDashboardElection);
  return { elections, stats: computeStats(elections) };
}

// Cross-election list routes: /results (CLOSED), /archive (ARCHIVED), /voters (all).
// Org-scoped for the same reason as getDashboardData.
export async function getElectionsByStatus(
  organizationId: string,
  status?: ElectionStatus,
): Promise<DashboardElection[]> {
  const rows = await prisma.election.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    select: ELECTION_SELECT,
  });
  return rows.map(toDashboardElection);
}

// One election for the /elections/[id] aggregate-root layout + its facets.
// cache()-wrapped: the layout (chrome) and each facet page share a SINGLE DB
// round trip per request — App Router can't prop-drill layout→page, so request
// memoization is the "fetch once" seam. Returns null → layout renders notFound()
// (both for a missing id AND a cross-org id — never expose "exists but forbidden").
export const getElectionDetail = cache(
  async (
    id: string,
    organizationId: string,
  ): Promise<DashboardElection | null> => {
    const e = await prisma.election.findFirst({
      where: { id, organizationId },
      select: ELECTION_SELECT,
    });
    return e ? toDashboardElection(e) : null;
  },
);

// Extra fields the manual-start screen needs beyond DashboardElection
// (election-manual-start-spec). cache()-wrapped like getElectionDetail: the
// [id] layout (type subtitle) and the overview page (review list) share one
// round trip. Only queried for DRAFT elections.
export const getElectionStartInfo = cache(
  async (id: string, organizationId: string) => {
    const e = await prisma.election.findFirst({
      where: { id, organizationId },
      select: { electionType: true, _count: { select: { options: true } } },
    });
    return e ? { electionType: e.electionType, candidates: e._count.options } : null;
  },
);

// Everything the overview BODY needs beyond getElectionDetail (election-overview-
// phase-2): the raw config enums (the detail mapper flattens votingType into an
// English label, unusable for i18n) plus three derived counts. Filtered `_count`
// selects keep all three in the SAME round trip as the config read.
// cache()-wrapped like its siblings so a re-render can't double-query.
export const getElectionOverview = cache(
  async (id: string, organizationId: string) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const e = await prisma.election.findFirst({
      where: { id, organizationId },
      select: {
        electionType: true,
        votingType: true,
        quorumThreshold: true,
        voterReminder24h: true,
        _count: {
          select: {
            options: true,
            voters: { where: { status: "PENDING" } },
            votes: { where: { createdAt: { gte: since } } },
          },
        },
      },
    });
    if (!e) return null;
    return {
      electionType: e.electionType,
      votingType: e.votingType,
      quorumThreshold: e.quorumThreshold,
      voterReminder24h: e.voterReminder24h,
      candidates: e._count.options,
      // PENDING voters were never emailed, so "invitations sent" = voters - this.
      notInvited: e._count.voters,
      voted24h: e._count.votes,
    };
  },
);

// Ballot options for the top bar's "Preview ballot" modal (election-overview-
// phase-1) — what the voter would see, read from the same rows the real ballot
// renders. cache()-wrapped for consistency with the other [id] reads.
export const getBallotPreview = cache(
  async (id: string, organizationId: string) => {
    const e = await prisma.election.findFirst({
      where: { id, organizationId },
      select: {
        votingType: true,
        options: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, text: true, description: true },
        },
      },
    });
    return e ? { votingType: e.votingType, options: e.options } : null;
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

// Public apex results page (/vote-host /results/[id]) — the resultsVisible gate + title only.
// Null → notFound(); resultsVisible=false → notFound() too (never leak unpublished results).
// The detailed public-results UI selects more later (public-results spec).
export async function getPublicResultsElection(id: string) {
  return prisma.election.findUnique({
    where: { id },
    select: { id: true, title: true, resultsVisible: true },
  });
}

// Live turnout for the hero panel's polling (see actions/dashboard.ts).
// Org-scoped so polling can't be pointed at another org's election id.
export async function getElectionTurnout(id: string, organizationId: string) {
  const e = await prisma.election.findFirst({
    where: { id, organizationId },
    select: { _count: { select: { voters: true, votes: true } } },
  });
  return e ? { voters: e._count.voters, voted: e._count.votes } : null;
}
