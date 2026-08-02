import "server-only";

import type { Prisma, VoterStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { voterCounts } from "@/lib/elections-view";
import { ROSTER_PAGE_SIZE } from "@/lib/constants/pagination";
import { clampPage, pageCountOf } from "@/lib/pagination";

// Popis birača za /elections/[id]/voters. Zaseban upit, ne proširenje
// ELECTION_SELECT-a — /results i pregled ne smiju plaćati retke koje ne
// prikazuju (voter-management-spec §Notes).
//
// Granica anonimnosti: `select` nikad ne dira token ni glasački listić. Da je
// birač glasao vidi se iz `status`, kako je glasao ne postoji u shemi.

// Veličina stranice živi u lib/pagination.ts, uz sve ostale — jedna lista ne
// može tiho odlutati na drugu vrijednost.

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
  const [matched, byStatus] = await Promise.all([
    prisma.voter.count({ where }),
    prisma.voter.groupBy({
      by: ["status"],
      where: { electionId },
      _count: { _all: true },
    }),
  ]);

  // Stegni PRIJE `skip`, zato u zasebnom koraku: `?q=xyz&page=8` gdje xyz sada
  // pogađa tri birača inače vrati prazan popis uz pageCount 1 — a tada se
  // kontrola stranicanja skriva, pa iz slijepe ulice nema izlaza osim ručnog
  // uređivanja URL-a.
  const pageCount = pageCountOf(matched, ROSTER_PAGE_SIZE);
  const current = clampPage(page, pageCount);

  const voters = await prisma.voter.findMany({
    where,
    // Stabilan poredak; Postgres stavlja NULL na kraj kod ASC.
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { email: "asc" }],
    skip: (current - 1) * ROSTER_PAGE_SIZE,
    take: ROSTER_PAGE_SIZE,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
    },
  });

  const notInvited =
    byStatus.find((g) => g.status === "PENDING")?._count._all ?? 0;

  return {
    voters,
    page: current,
    pageCount,
    matched,
    counts: voterCounts({
      total: election._count.voters,
      notInvited,
      voted: election._count.votes,
    }),
  };
}
