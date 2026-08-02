import "server-only";

import { prisma } from "@/lib/prisma";
import { deleteObject, keyFromUrl } from "@/lib/services/storage.service";

// Brisanje računa administratora (profile-settings-phase-4-spec §3). Pokreće se
// isključivo iz BetterAuthove kuke beforeDelete, dakle tek nakon što je korisnik
// kliknuo poveznicu iz e-pošte — modal sam po sebi ne briše ništa.
//
// Redoslijed nije stilski: users.organizationId je ON DELETE SET NULL (brisanje
// organizacije samo očisti vezu), a elections.createdById je RESTRICT — izbori
// moraju nestati prije korisnika, što beforeDelete i jamči.

export type DeleteAccountErrorCode = "subscriptionActive" | "sharedOrganization";

export class DeleteAccountError extends Error {
  constructor(readonly code: DeleteAccountErrorCode) {
    super(code);
    this.name = "DeleteAccountError";
  }
}

/** Aktivna pretplata blokira brisanje — Stripe bi nastavio naplaćivati nepostojeći račun. */
export function subscriptionBlocks(user: {
  isPro: boolean;
  stripeSubscriptionId: string | null;
}): boolean {
  return user.isPro && Boolean(user.stripeSubscriptionId);
}

// R2 ne sudjeluje u Postgresovoj transakciji, pa objekti idu nakon commita i
// svaki pad se glasno zapisuje, nikad ne guta. Ključevi se čitaju PRIJE brisanja
// redaka — poslije ih nema odakle pročitati.
async function dropObjects(objects: { bucket: "public" | "private"; key: string }[]) {
  for (const { bucket, key } of objects) {
    try {
      await deleteObject(bucket, key);
    } catch (error) {
      console.error("[account-deletion] object delete failed", { bucket, key, error });
    }
  }
}

/** Ključ iz javnog URL-a; null ako URL nije naš ili R2 nije konfiguriran. */
function publicKey(url: string | null): string | null {
  if (!url) return null;
  try {
    return keyFromUrl(url);
  } catch {
    return null;
  }
}

/**
 * Briše organizaciju administratora i sve njezine izbore. Korisnika briše
 * BetterAuth nakon ove kuke (kaskadno accounts + sessions).
 * Baca DeleteAccountError ako brisanje nije dopušteno — pad ovdje prekida
 * cijeli BetterAuthov tok, pa se ništa ne obriše.
 */
export async function purgeOrganizationData(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isPro: true,
      stripeSubscriptionId: true,
      organizationId: true,
      organization: { select: { logoUrl: true } },
    },
  });
  if (!user) return;

  // Provjera se ponavlja i ovdje, ne samo u sučelju: između klika na "Obriši" i
  // klika na poveznicu iz e-pošte prođe vrijeme u kojem se pretplata može aktivirati.
  if (subscriptionBlocks(user)) {
    throw new DeleteAccountError("subscriptionActive");
  }

  const organizationId = user.organizationId;
  if (!organizationId) return; // račun bez organizacije — nema što kaskadirati

  // Obrana za višeadministratorske organizacije. Danas ih nema (setup radi 1:1),
  // ali tuđu organizaciju se ne briše nikada.
  // ponytail: odbijamo umjesto da brišemo samo korisnika — elections.createdById je
  // RESTRICT, pa bi brisanje korisnika ionako palo. Pravo rješenje je prijenos
  // vlasništva na preostalog administratora; to je zaseban tok koji ne postoji.
  const otherAdmins = await prisma.user.count({
    where: { organizationId, id: { not: userId } },
  });
  if (otherAdmins > 0) {
    throw new DeleteAccountError("sharedOrganization");
  }

  const elections = await prisma.election.findMany({
    where: { organizationId },
    select: { id: true, reportKey: true },
  });
  const electionIds = elections.map((e) => e.id);

  // Operativni zapis PRIJE brisanja — samo identifikatori i brojevi, bez osobnih
  // podataka. Da je poslije, ne bi imao odakle nastati.
  const [voters, votes, archives] = await Promise.all([
    prisma.voter.count({ where: { electionId: { in: electionIds } } }),
    prisma.vote.count({ where: { electionId: { in: electionIds } } }),
    prisma.archive.count({ where: { electionId: { in: electionIds } } }),
  ]);
  console.info("[account-deletion] purging", {
    userId,
    organizationId,
    at: new Date().toISOString(),
    elections: electionIds.length,
    voters,
    votes,
    archives,
  });

  // Jedna transakcija: polovično obrisana organizacija je gora od neuspjelog
  // brisanja, koje se barem može ponoviti. Archive i Vote namjerno nemaju kaskadu
  // (anonimnost/integritet), pa idu prvi i eksplicitno — isti obrazac kao
  // deleteElection. Izbori kaskadiraju birače, tokene i opcije.
  await prisma.$transaction([
    prisma.archive.deleteMany({ where: { electionId: { in: electionIds } } }),
    prisma.vote.deleteMany({ where: { electionId: { in: electionIds } } }),
    prisma.election.deleteMany({ where: { organizationId } }),
    prisma.organization.delete({ where: { id: organizationId } }),
  ]);

  // Izvještaji nose zbrojeve izbora kojima je resultsVisible false — ne smiju
  // ostati u kanti. Logotip je javan, ali osirotjeli objekt je datoteka za koju
  // nitko ne zna da postoji.
  await dropObjects([
    ...elections
      .filter((e) => e.reportKey)
      .map((e) => ({ bucket: "private" as const, key: e.reportKey as string })),
    ...(publicKey(user.organization?.logoUrl ?? null)
      ? [{ bucket: "public" as const, key: publicKey(user.organization!.logoUrl)! }]
      : []),
  ]);
}

/**
 * Avatar administratora (User.image). Briše se u afterDelete, kad korisnika više
 * nema — svaki objekt nestaje nakon svog retka.
 * Google URL-ovi nisu naši; keyFromUrl ih preskoči.
 */
export async function purgeAvatar(image: string | null | undefined): Promise<void> {
  const key = publicKey(image ?? null);
  if (key) await dropObjects([{ bucket: "public", key }]);
}
