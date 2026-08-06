import "server-only";

import { prisma } from "@/lib/prisma";
import { isProStatus } from "@/lib/billing";
import { archiveExpiresAt } from "@/lib/entitlements";

// Projekcija prava iz Stripea (stripe-integration-phase-2-spec §3). Subscription
// je izvor istine, users.isPro je projekcija koju čita sve ostalo — i ovo je
// JEDINO mjesto gdje se ta projekcija piše.
//
// Sve kuke zovu istu funkciju. Svaki upis je apsolutno stanje izvedeno iz statusa
// samog događaja — bez inkrementa i bez pročitaj-pa-piši — pa je ponovljeni
// webhook no-op. Stripe ponavlja i zna promijeniti redoslijed.

export type BillingHook =
  | "complete"
  | "created"
  | "update"
  | "cancel"
  | "deleted";

type SubscriptionEvent = {
  status: string;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
};

/**
 * Upisuje pravo za organizaciju iz `referenceId` (faza 1 D1 — to je
 * organizationId, ne userId).
 *
 * isPro ide svim administratorima organizacije: pravo je organizacijsko, a
 * ključanje po korisniku iz sesije bilo bi neispravno onog dana kad organizacija
 * dobije drugog administratora — i nevidljivo do tada.
 *
 * stripeSubscriptionId NE ide svima: users.stripeSubscriptionId je @unique, pa
 * bi isti id na dva retka pao na P2002. Identitet kupca ionako pripada jednom
 * retku — onom kojem je plugin upisao stripeCustomerId. Drugi administrator
 * ostaje bez id-a, što ne otvara rupu: purgeOrganizationData ga odbija zbog
 * sharedOrganization prije nego što subscriptionBlocks uopće dođe na red.
 *
 * stripeCustomerId ne piše ova funkcija — to radi plugin.
 */
export async function projectEntitlement(
  hook: BillingHook,
  referenceId: string,
  sub: SubscriptionEvent,
): Promise<void> {
  const isPro = isProStatus(sub.status);
  const subscriptionId = sub.stripeSubscriptionId ?? null;
  const customerId = sub.stripeCustomerId ?? null;

  const writes = [
    prisma.user.updateMany({
      where: { organizationId: referenceId },
      data: { isPro },
    }),
  ];

  // Jedna transakcija: isPro bez id-a pretplate znači subscriptionBlocks false,
  // dakle račun s aktivnom pretplatom postaje obrisiv — točno rupa koju ta
  // provjera zatvara.
  if (customerId) {
    writes.push(
      prisma.user.updateMany({
        where: { organizationId: referenceId, stripeCustomerId: customerId },
        data: { stripeSubscriptionId: isPro ? subscriptionId : null },
      }),
    );
  }

  await prisma.$transaction(writes);

  // Vercelovi zapisi su MVP nadzor i trag za spor oko naplate. past_due namjerno
  // ostaje Pro (faza 1 D5), pa se zapisuje izrijekom — problem s naplatom mora
  // biti vidljiv, ne tih.
  console.info("[billing] entitlement projected", {
    hook,
    referenceId,
    status: sub.status,
    isPro,
    stripeSubscriptionId: subscriptionId,
  });
}

/**
 * Pečat zadržavanja arhive kad pretplata istekne (§3). Stampa expiresAt SAMO
 * ondje gdje je null — Pro arhive koje su već dobile datum se ne diraju, a
 * ponovljeni događaj ne pomiče rok.
 *
 * NIŠTA SE NE BRIŠE. Nema povrata arhive (pravilo uklonjeno 2026-08-03):
 * expiresAt znači "kasnije obreži sadržaj ovog retka", a ta metla je UPDATE i
 * pripada entitlement-enforcement-specu. Ako za vrijeme testa nestane ijedan
 * redak arhive, ova je funkcija pogrešna.
 *
 * Datum računa archiveExpiresAt iz faze 1 — kalendarska godina, nikad
 * 365 * 24 * 60 * 60 * 1000.
 */
export async function stampArchiveRetention(
  referenceId: string,
): Promise<number> {
  // ponytail: bez granice. Organizacija ima desetke arhiva, ne tisuće.
  const archives = await prisma.archive.findMany({
    where: { expiresAt: null, election: { organizationId: referenceId } },
    select: { id: true, createdAt: true },
  });
  if (archives.length === 0) return 0;

  // Rok ovisi o createdAt svakog retka, pa updateMany ne može — jedna
  // transakcija umjesto toga.
  await prisma.$transaction(
    archives.map((archive) =>
      prisma.archive.update({
        where: { id: archive.id },
        data: {
          expiresAt: archiveExpiresAt({ kind: "free" }, archive.createdAt),
        },
      }),
    ),
  );

  console.info("[billing] archive retention stamped", {
    referenceId,
    archives: archives.length,
  });
  return archives.length;
}
