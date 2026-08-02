import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { turnoutPct } from "@/lib/elections-view";
import {
  buildMerkleTree,
  MERKLE_ALGORITHM,
  MERKLE_LEAF_ORDERING,
} from "./merkle.service";
import { deleteObject } from "./storage.service";

// Pečaćenje arhive — trenutak u kojem glasovi izbora postaju dokazivo
// nepromijenjeni. Nakon ovoga svaki "kontrolni kod" s biračevog ekrana je
// tvrdnja koju bilo tko može provjeriti offline, bez baze i bez ovog koda.
//
// Zapečaćeno je nepromjenjivo: nema update staze, ponovno pečaćenje je greška.
// Brisanje arhive ide postojećim deleteElection tokom.

// Kalendarska godina, ne 365 dana — u prijelaznoj godini to nije isti datum, a
// rok zadržavanja je obećanje prema organizaciji.
function oneYearFrom(date: Date): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export type ArchiveErrorCode =
  | "invalidStatus" // nije CLOSED, tuđa organizacija, ili je već zapečaćeno
  | "failed";

export class ArchiveError extends Error {
  constructor(public code: ArchiveErrorCode) {
    super(`archive: ${code}`);
  }
}

// Snimka konfiguracije u trenutku arhiviranja. Tip je EKSPLICITAN i nema ni
// jedno polje o biračima — isti potez kao VoterExportRow: ubaciti e-mail u
// arhivu je greška prevođenja, ne nalaz recenzije. Pojedinačni glasovi žive
// samo kao hashevi u stablu, pa arhiva može dokazati integritet, a nikada
// rekonstruirati tko je što glasao.
export interface ElectionSnapshot {
  title: string;
  description: string | null;
  electionType: string;
  votingType: string;
  startsAt: string;
  endsAt: string;
  settings: {
    resultsVisible: boolean;
    resultsMode: string;
    allowAbstain: boolean;
    quorumThreshold: number | null;
    voterReminder24h: boolean;
  };
  options: { id: string; text: string; orderIndex: number }[];
  counts: { voters: number; votesCast: number; turnoutPct: number };
  sealedAt: string;
}

export interface SealResult {
  merkleRoot: string;
  votesSealed: number;
}

// organizationId ide u WHERE zajedno sa statusom (invarijanta #3) — nedostajući
// izbor, tuđa organizacija i pogrešan status skupa padaju u jedan invalidStatus,
// bez proročišta o postojanju i bez read-then-check jaza.
export async function sealElection(
  electionId: string,
  organizationId: string,
): Promise<SealResult> {
  const election = await prisma.election.findFirst({
    where: { id: electionId, organizationId, status: "CLOSED" },
    select: {
      id: true,
      title: true,
      description: true,
      electionType: true,
      votingType: true,
      startsAt: true,
      endsAt: true,
      resultsVisible: true,
      resultsMode: true,
      allowAbstain: true,
      quorumThreshold: true,
      voterReminder24h: true,
      options: {
        select: { id: true, text: true, orderIndex: true },
        orderBy: { orderIndex: "asc" },
      },
      // ponytail: neograničeno čitanje hasheva, uredno na MVP mjeri (Free ≤50
      // birača ⇒ ≤50 listova); stranicati tek ako Pro mjera ikad zaboli.
      votes: { select: { voteHash: true } },
      _count: { select: { voters: true } },
      // Retencija visi o izborima, ne o adminu koji klikne Arhiviraj — na
      // organizaciji s više admina to često nije ista osoba. Vlasnik zapisa je
      // autoritet, pa se čita createdBy.isPro, a ne isPro iz sesije.
      createdBy: { select: { isPro: true } },
      // Pročitano PRIJE transakcije: nakon nje su stupci već ništeni, pa ključ
      // objekta više ne bi imao odakle doći.
      reportKey: true,
    },
  });

  if (!election) throw new ArchiveError("invalidStatus");

  const { root, leaves, tree } = buildMerkleTree(
    election.votes.map((v) => v.voteHash),
  );

  const votesCast = election.votes.length;
  const voters = election._count.voters;

  const snapshot: ElectionSnapshot = {
    title: election.title,
    description: election.description,
    electionType: election.electionType,
    votingType: election.votingType,
    startsAt: election.startsAt.toISOString(),
    endsAt: election.endsAt.toISOString(),
    settings: {
      resultsVisible: election.resultsVisible,
      resultsMode: election.resultsMode,
      allowAbstain: election.allowAbstain,
      quorumThreshold: election.quorumThreshold,
      voterReminder24h: election.voterReminder24h,
    },
    options: election.options,
    counts: { voters, votesCast, turnoutPct: turnoutPct(votesCast, voters) },
    sealedAt: new Date().toISOString(),
  };

  const proofData = {
    algorithm: MERKLE_ALGORITHM,
    leafOrdering: MERKLE_LEAF_ORDERING,
    leaves,
    tree,
    root,
  };

  // Free: godina od nastanka arhive (createdAt je default now(), pa je ovo isti
  // trenutak). Pro: bez roka. Ovdje se samo PEČATIRA točan datum — čišćenje
  // isteklih arhiva je posao retencijske specifikacije.
  const expiresAt = election.createdBy.isPro ? null : oneYearFrom(new Date());

  // Jedna interaktivna transakcija: red arhive pa WHERE-čuvani prelaz. Ako
  // status u međuvremenu nije više CLOSED (dvoklik, paralelno pečaćenje), flip
  // pogodi 0 redova, bacimo i arhiva se povuče s njim. Unique electionId na
  // Archive je drugi pojas.
  await prisma.$transaction(async (tx) => {
    await tx.archive.create({
      data: {
        electionId,
        merkleRoot: root,
        proofData: proofData as unknown as Prisma.InputJsonValue,
        electionData: snapshot as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    const { count } = await tx.election.updateMany({
      where: { id: electionId, organizationId, status: "CLOSED" },
      data: {
        status: "ARCHIVED",
        // Spremljeni izvještaj zastarijeva upravo ovdje: nastao je prije pečata,
        // pa nema Merkle korijen. Bez ništenja bi brzi put zauvijek posluživao
        // taj dokument bez zapisa o integritetu (D8).
        reportKey: null,
        reportGeneratedAt: null,
        reportLocale: null,
      },
    });
    if (count === 0) throw new ArchiveError("invalidStatus");
  });

  // Tek nakon commita: baza prva, R2 drugi. Zaostali objekt je potrošen prostor;
  // ključ koji pokazuje u prazno je greška. Glasno, nikad progutano.
  if (election.reportKey) {
    try {
      await deleteObject("private", election.reportKey);
    } catch (error) {
      console.error("[archive] stale report delete failed", {
        electionId,
        key: election.reportKey,
        error,
      });
    }
  }

  return { merkleRoot: root, votesSealed: votesCast };
}
