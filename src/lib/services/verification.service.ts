import "server-only";

import { prisma } from "@/lib/prisma";
import type { VerifyResult } from "@/lib/merkle-verify";
import { merkleProof } from "./merkle.service";

// Javna provjera verifikacijskog koda (stadij 3 lanca integriteta, s biračeve
// strane). Vraća put samo za JEDAN list — nikad `leaves` ni `tree`.
//
// D2: prije v0.9.78 kôd je bio SHA-256(electionId + opcije + ISO vrijeme), pa
// je svaki list razbijljiv u minutama. Put nosi točno jedan tuđi list (brata na
// razini 0), što bi otkrilo tuđi izbor i milisekundu glasanja — a milisekunda
// uz IP iz dnevnika glasanja je deanonimizacija. Slučajni kodovi stigli su na
// origin 2026-09-14 13:55 +0200; izbori koji su počeli prije ovog trenutka mogu
// nositi stare kodove, pa za njih nema puta. Konzervativno, po startsAt.
export const RANDOM_RECEIPTS_SINCE = new Date("2026-09-15T00:00:00Z");

export async function verifyReceipt(
  electionId: string,
  code: string,
): Promise<VerifyResult> {
  // Kôd MORA pripadati ovim izborima: nepostojeći izbori, tuđi izbori i
  // nepoznat kôd padaju u isti notFound — nema proročišta o postojanju.
  const vote = await prisma.vote.findFirst({
    where: { electionId, voteHash: code },
    select: {
      election: {
        select: {
          title: true,
          startsAt: true,
          organization: { select: { name: true } },
          archive: {
            // ponytail: čita cijelo stablo radi jednog puta — O(n) hasheva,
            // uredno na MVP mjeri; spremiti putove pri pečaćenju ako zaboli.
            select: {
              merkleRoot: true,
              proofData: true,
              prunedAt: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!vote) return { kind: "notFound" };

  const e = vote.election;
  const election = { title: e.title, organizationName: e.organization.name };

  const a = e.archive;
  // D1: prije pečata odgovara baza — poslužitelj tvrdi, preglednik ne provjerava.
  if (!a) return { kind: "recorded", election };

  // Stari oblik koda je temeljniji razlog od obrezivanja, pa ide prvi.
  if (e.startsAt < RANDOM_RECEIPTS_SINCE) return { kind: "legacy", election };

  const tree = (a.proofData as { tree?: unknown } | null)?.tree;
  if (a.prunedAt || !Array.isArray(tree)) return { kind: "pruned", election };

  // Kôd u bazi, a ne u stablu? Tada je put prazan i preglednikov fold kaže
  // "ne" — upravo nalaz koji ova stranica postoji da pokaže.
  return {
    kind: "sealed",
    election,
    root: a.merkleRoot,
    sealedAt: a.createdAt.toISOString(),
    path: merkleProof(tree, code).path,
  };
}
