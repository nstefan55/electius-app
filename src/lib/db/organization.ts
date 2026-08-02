import "server-only";

import { prisma } from "@/lib/prisma";
import type { ExportSource } from "@/lib/organization-export";

// Cjeloviti izvoz organizacije (profile-settings-phase-6-spec §3).
//
// `select` JEST granica: token, hash tokena, lozinka, sesije i Stripe id-evi
// nisu navedeni, pa ne mogu ni ispasti. Prijenosivost znači podatke koje je
// organizacija dala, ne tajne koje ih čuvaju.
//
// Listići ostaju anonimni bez ijedne provjere: Vote nema voterId ni vezu na
// Voter, pa izvoz ne može spojiti glas i birača jer to ne može ni baza.
//
// ponytail: findMany bez limita — cijela organizacija odjednom. Dovoljno na MVP
// mjerilu (besplatni plan: 50 birača po izboru); kad izvoz preraste granicu
// trajanja funkcije, to je trenutak za pozadinski posao, a oblik dokumenta se
// ne mijenja.
export async function getOrganizationExport(
  organizationId: string,
  adminEmail: string,
): Promise<ExportSource | null> {
  const [organization, admin, elections] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        type: true,
        contactEmail: true,
        logoUrl: true,
        createdAt: true,
      },
    }),
    // Samo administrator koji traži izvoz; suradnici imaju svoj račun i svoje
    // pravo na prijenosivost.
    prisma.user.findUnique({
      where: { email: adminEmail },
      select: {
        name: true,
        email: true,
        emailVerified: true,
        isPro: true,
        createdAt: true,
      },
    }),
    prisma.election.findMany({
      // Organizacija dolazi iz sesije i nikad iz zahtjeva — tuđi izbori nemaju
      // način ući u upit.
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        electionType: true,
        votingType: true,
        status: true,
        startsAt: true,
        endsAt: true,
        resultsVisible: true,
        resultsMode: true,
        allowAbstain: true,
        quorumThreshold: true,
        autoCloseOnDeadline: true,
        voterReminder24h: true,
        adminTurnoutReminder: true,
        sealedResults: true,
        createdAt: true,
        updatedAt: true,
        // reportKey/reportGeneratedAt/reportLocale i strani ključevi namjerno
        // izostaju: pokazivač na objekt u kanti nije podatak organizacije, a
        // primatelju ne znači ništa.
        options: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            text: true,
            description: true,
            orderIndex: true,
            _count: { select: { votes: true } },
          },
        },
        voters: {
          orderBy: { createdAt: "asc" },
          select: {
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
        votes: {
          // Bez batchOrder i bez id-a: oba govore o redoslijedu upisa, a on
          // namjerno ne odgovara redoslijedu glasanja.
          select: {
            voteHash: true,
            createdAt: true,
            options: { select: { optionId: true } },
          },
        },
        archive: {
          select: {
            merkleRoot: true,
            proofData: true,
            electionData: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  if (!organization || !admin) return null;

  return {
    organization,
    admin,
    elections: elections.map((e) => ({
      ...e,
      options: e.options.map((o) => ({
        id: o.id,
        text: o.text,
        description: o.description,
        orderIndex: o.orderIndex,
        votes: o._count.votes,
      })),
      votes: e.votes.map((v) => ({
        voteHash: v.voteHash,
        createdAt: v.createdAt,
        optionIds: v.options.map((o) => o.optionId),
      })),
    })),
  };
}
