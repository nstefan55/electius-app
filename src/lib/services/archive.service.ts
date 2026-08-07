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
import { resolveEntitlement } from "./entitlement.service";
import { archiveExpiresAt } from "@/lib/entitlements";
import {
  buildArchiveTombstone,
  readProofMeta,
  shouldPrune,
} from "@/lib/archive-prune";

// Pečaćenje arhive — trenutak u kojem glasovi izbora postaju dokazivo
// nepromijenjeni. Nakon ovoga svaki "kontrolni kod" s biračevog ekrana je
// tvrdnja koju bilo tko može provjeriti offline, bez baze i bez ovog koda.
//
// Zapečaćeno je nepromjenjivo: nema update staze, ponovno pečaćenje je greška.
// Brisanje arhive ide postojećim deleteElection tokom.

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

  // Free: kalendarska godina od nastanka arhive (createdAt je default now(), pa
  // je ovo isti trenutak). Pro: bez roka. Ovdje se samo PEČATIRA datum —
  // obrezivanje isteklih arhiva radi pruneExpiredArchives.
  //
  // Vlastiti oneYearFrom i izravno čitanje createdBy.isPro maknuti su ovdje
  // (invarijanta #5): to je bila druga izvedba istog kalendarskog pravila, samo
  // s pravom razriješenim po adminu umjesto po organizaciji. Sada odlučuje isti
  // resolver kao i svaka druga zaštita — i pravo i dalje visi o izborima, ne o
  // adminu koji je slučajno kliknuo Arhiviraj.
  const expiresAt = archiveExpiresAt(
    await resolveEntitlement(electionId, organizationId),
    new Date(),
  );

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

export interface PruneResult {
  pruned: number;
  /** Isteklih kandidata koje je pravo spasilo — nadograđene organizacije. */
  kept: number;
}

/**
 * Obrezivanje isteklog tereta dokaza (§6). Vrti se u metli životnog ciklusa
 * izbora; idempotentno je i na gotovo svakom pingu pogodi 0 redaka.
 *
 * Obrezuje se ISKLJUČIVO proofData. merkleRoot, electionData i spremljeni PDF
 * ostaju zauvijek (D6) — zato ovdje nema ni jednog poziva prema R2 ni jednog
 * report* stupca. Redak arhive se ne briše nikad.
 *
 * `expiresAt <= now` bira kandidate; pravo odlučuje hoće li koji doista biti
 * obrezan. Pečat je jednosmjeran (stampArchiveRetention piše pri padu na Free,
 * nitko ga ne briše pri nadogradnji), pa bi metla koja mu vjeruje uništila teret
 * dokaza organizaciji koja plaća.
 */
export async function pruneExpiredArchives(
  now: Date = new Date(),
): Promise<PruneResult> {
  // prunedAt je stupac, ne ključ u JSON-u: negirani JSON path filtar na retku
  // bez tog ključa vraća NULL, NOT(NULL = true) je NULL, pa bi svaki neobrezani
  // redak tiho ispao iz izbora i metla nikad ne bi obrezala ništa.
  // ponytail: čita proofData kandidata (stablo), jer algoritam mora doći s
  // retka. Isteklih arhiva je malo; stranicati tek ako to ikad zaboli.
  const candidates = await prisma.archive.findMany({
    where: { expiresAt: { lte: now }, prunedAt: null },
    select: {
      id: true,
      merkleRoot: true,
      proofData: true,
      createdAt: true,
      election: { select: { id: true, organizationId: true } },
    },
  });
  if (candidates.length === 0) return { pruned: 0, kept: 0 };

  // Jedno razrješavanje po organizaciji, ne po arhivi.
  const byOrg = new Map<string, Awaited<ReturnType<typeof resolveEntitlement>>>();

  let pruned = 0;
  let kept = 0;

  for (const archive of candidates) {
    const orgId = archive.election.organizationId;
    let entitlement = byOrg.get(orgId);
    if (!entitlement) {
      entitlement = await resolveEntitlement(archive.election.id, orgId);
      byOrg.set(orgId, entitlement);
    }

    // Rok se PONOVNO izvodi iz prava koje vrijedi sada, ne čita s retka. Pro
    // vraća null → shouldPrune je false → redak preživi svoj vlastiti pečat.
    if (!shouldPrune(archiveExpiresAt(entitlement, archive.createdAt), now)) {
      kept++;
      continue;
    }

    const meta = readProofMeta(archive.proofData, {
      algorithm: MERKLE_ALGORITHM,
      leafOrdering: MERKLE_LEAF_ORDERING,
    });

    // prunedAt: null i u WHERE-u — isti atomski oblik kao svugdje, pa dvije
    // istovremene metle obrežu svaki redak točno jednom.
    const { count } = await prisma.archive.updateMany({
      where: { id: archive.id, prunedAt: null },
      data: {
        proofData: buildArchiveTombstone({
          root: archive.merkleRoot,
          algorithm: meta.algorithm,
          leafOrdering: meta.leafOrdering,
          prunedAt: now,
        }) as unknown as Prisma.InputJsonValue,
        prunedAt: now,
      },
    });
    pruned += count;
  }

  if (pruned > 0 || kept > 0) {
    console.info("[archive] proof payload pruned", { pruned, kept });
  }
  return { pruned, kept };
}
