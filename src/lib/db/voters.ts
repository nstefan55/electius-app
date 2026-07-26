import "server-only";

import type { Prisma, VoterStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { voterCounts } from "@/lib/elections-view";

// Popis birača za /elections/[id]/voters. Zaseban upit, ne proširenje
// ELECTION_SELECT-a — /results i pregled ne smiju plaćati retke koje ne
// prikazuju (voter-management-spec §Notes).
//
// Granica anonimnosti: `select` nikad ne dira token ni glasački listić. Da je
// birač glasao vidi se iz `status`, kako je glasao ne postoji u shemi.

export const ROSTER_PAGE_SIZE = 25;

export interface RosterVoter {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  status: VoterStatus;
}

export interface VoterRoster {
  voters: RosterVoter[];
  page: number;
  pageCount: number;
  matched: number; // redaka nakon pretrage/filtra
  counts: ReturnType<typeof voterCounts>;
}

export interface RosterQuery {
  page?: number;
  q?: string;
  status?: VoterStatus;
}

// Pretraga i filtar idu u WHERE, ne u klijent: uz stranicanje bi pretraga po
// dohvaćenoj stranici promašila podudaranja na svim ostalima.
function rosterWhere(electionId: string, q?: string, status?: VoterStatus) {
  const term = q?.trim();
  const where: Prisma.VoterWhereInput = { electionId };
  if (status) where.status = status;
  if (term) {
    where.OR = [
      { email: { contains: term, mode: "insensitive" } },
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
    ];
  }
  return where;
}

// Vraća null za nepostojeći ILI tuđi izbor — pozivatelj radi notFound().
export async function getVoterRoster(
  electionId: string,
  organizationId: string,
  { page = 1, q, status }: RosterQuery = {},
): Promise<VoterRoster | null> {
  // Vlasništvo u WHERE-u; ujedno donosi broj listića za sažetak.
  const election = await prisma.election.findFirst({
    where: { id: electionId, organizationId },
    select: { _count: { select: { votes: true, voters: true } } },
  });
  if (!election) return null;

  const where = rosterWhere(electionId, q, status);

  // groupBy je ovdje siguran bez org uvjeta — dolazi se do njega samo ako je
  // gornji vlasnički upit prošao.
  const [matched, byStatus, voters] = await Promise.all([
    prisma.voter.count({ where }),
    prisma.voter.groupBy({
      by: ["status"],
      where: { electionId },
      _count: { _all: true },
    }),
    prisma.voter.findMany({
      where,
      // Stabilan poredak; Postgres stavlja NULL na kraj kod ASC.
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { email: "asc" }],
      skip: (Math.max(1, page) - 1) * ROSTER_PAGE_SIZE,
      take: ROSTER_PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
      },
    }),
  ]);

  const notInvited =
    byStatus.find((g) => g.status === "PENDING")?._count._all ?? 0;

  return {
    voters,
    page: Math.max(1, page),
    pageCount: Math.max(1, Math.ceil(matched / ROSTER_PAGE_SIZE)),
    matched,
    counts: voterCounts({
      total: election._count.voters,
      notInvited,
      voted: election._count.votes,
    }),
  };
}
