import "server-only";

// Samo tip — brisan pri prevođenju, pa ovaj modul i dalje ne povlači Stripe SDK.
import type Stripe from "stripe";

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
  event: Stripe.Event,
): Promise<boolean> {
  // Pretvorba živi OVDJE, uz branu koju hrani, a ne na pozivnom mjestu u
  // auth/index.ts: ondje je nijedan test ne bi dosegnuo (taj modul diže
  // BetterAuth). Izostanak *1000 svaki bi događaj bacio u 1970., pa bi `lte`
  // uvijek bio istinit i brana bi propuštala SVE — tiho, i baš ono što
  // sprječava. Mjereno mutacijom: s pretvorbom na pozivnom mjestu nijedan test
  // to nije uhvatio.
  const eventCreated = eventTime(event);
  const isPro = isProStatus(sub.status);
  const subscriptionId = sub.stripeSubscriptionId ?? null;
  const customerId = sub.stripeCustomerId ?? null;

  // Brana redoslijeda. Zahtjev JE u WHERE klauzuli, a broj pogođenih redaka JE
  // provjera — isti obrazac kao sealElection i startElection. Pročitaj-pa-
  // provjeri ovdje ne bi valjalo: Stripe isporučuje istodobno, pa bi dva
  // događaja mogla oba pročitati stari marker i oba upisati, a pobijedio bi onaj
  // koji zadnji završi — točno zastarjeli.
  //
  // lte, ne lt (odluka "primijeni na jednako", 2026-09-11): event.created ima
  // rezoluciju SEKUNDE, a rafal cancel-pa-delete rutinski stane u istu sekundu.
  // Odbijanje na jednako tiho bi ispustilo legitiman prijelaz; primjena na
  // jednako najgore primijeni istodobnog blizanca — a krivo pravo je vidljivo i
  // popravljivo, dok je ispušteno nijemo. Ponovljeni isti događaj je usto no-op
  // jer je projekcija apsolutno stanje.
  const applied = await prisma.$transaction(async (tx) => {
    const claimed = await tx.organization.updateMany({
      where: {
        id: referenceId,
        OR: [
          { billingEventAppliedAt: null },
          { billingEventAppliedAt: { lte: eventCreated } },
        ],
      },
      data: { billingEventAppliedAt: eventCreated },
    });
    // 0 = ili je primijenjen noviji događaj (zastarjelo), ili organizacija više
    // ne postoji (obrisan račun, zakašnjeli webhook). Oba znače: nemamo što
    // projicirati. Ništa nije upisano, pa nema što ni poništavati.
    if (claimed.count === 0) return false;

    await tx.user.updateMany({
      where: { organizationId: referenceId },
      data: { isPro },
    });

    // Ista transakcija: isPro bez id-a pretplate znači subscriptionBlocks false,
    // dakle račun s aktivnom pretplatom postaje obrisiv — točno rupa koju ta
    // provjera zatvara.
    if (customerId) {
      await tx.user.updateMany({
        where: { organizationId: referenceId, stripeCustomerId: customerId },
        data: { stripeSubscriptionId: isPro ? subscriptionId : null },
      });
    }
    return true;
  });

  if (!applied) {
    // Zastarjeli događaj nije greška — zato info, ne error. Mora ostati vidljiv:
    // ovo je jedini trag da je Stripe isporučio izvan redoslijeda.
    console.info("[billing] stale event skipped", {
      hook,
      referenceId,
      status: sub.status,
      eventCreated: eventCreated.toISOString(),
    });
    return false;
  }

  // Vercelovi zapisi su MVP nadzor i trag za spor oko naplate. past_due namjerno
  // ostaje Pro (faza 1 D5), pa se zapisuje izrijekom — problem s naplatom mora
  // biti vidljiv, ne tih.
  console.info("[billing] entitlement projected", {
    hook,
    referenceId,
    status: sub.status,
    isPro,
    stripeSubscriptionId: subscriptionId,
    eventCreated: eventCreated.toISOString(),
  });
  return true;
}

/**
 * Je li projekcija za ovaj događaj doista sletjela — i ako nije, BACI.
 *
 * Zašto postoji: @better-auth/stripe svaku kuku pretplate omata vlastitim
 * try/catch koji grešku SAMO zapiše i ne baci dalje (dist/index.mjs:409-411 i
 * :457-459). Naš projectEntitlement se zove unutar tog try-a, pa Prisma iznimka
 * (hladan start Neona, prekid veze) završi kao zapis u logu, ruta vrati
 * `{ success: true }` → HTTP 200, a Stripe to čita kao uspjeh i NIKAD ne
 * ponavlja. Prijelaz prava se tiho i trajno izgubi.
 *
 * onEvent se, za razliku od kuka, poziva IZVAN te unutarnje hvataljke a UNUTAR
 * vanjske (:1566-1591), pa iznimka odavde postaje 400 — a Stripe ponavlja na
 * svaki odgovor koji nije 2xx.
 *
 * ⚠️ Redoslijed nije proizvoljan: ova provjera smije stići tek ZAJEDNO s branom
 * redoslijeda iznad ili poslije nje. Sama bi umnožila ponavljanja, a svako je
 * ponavljanje nova prilika da se događaj primijeni izvan redoslijeda.
 */
export async function assertProjectionLanded(event: Stripe.Event): Promise<void> {
  const subscriptionId = stripeSubscriptionIdOf(event);
  // Događaj koji uopće ne nosi pretplatu nema što projicirati.
  if (!subscriptionId) return;

  const row = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { referenceId: true },
  });
  if (!row) return;

  const org = await prisma.organization.findUnique({
    where: { id: row.referenceId },
    select: { billingEventAppliedAt: true },
  });
  // Organizacija obrisana — nema kamo projicirati. Bacanje bi ovdje značilo
  // vječno ponavljanje za račun koji više ne postoji.
  if (!org) return;

  const eventCreated = eventTime(event);
  const applied = org.billingEventAppliedAt;
  // >= pokriva oboje: marker JEDNAK znači da je ova kuka prošla, a marker NOVIJI
  // znači da je brana namjerno preskočila zastarjeli događaj. Nijedno nije greška.
  if (applied !== null && applied >= eventCreated) return;

  throw new Error(
    `[billing] projekcija nije sletjela za ${event.type} (${event.id}) — vraćam ne-2xx da Stripe ponovi`,
  );
}

/** event.created je Unix vrijeme u SEKUNDAMA, ne milisekundama. */
function eventTime(event: Stripe.Event): Date {
  return new Date(event.created * 1000);
}

/** id pretplate iz sirovog događaja; null ako ga događaj ne nosi. */
function stripeSubscriptionIdOf(event: Stripe.Event): string | null {
  const obj = event.data.object as {
    object?: string;
    id?: string;
    subscription?: unknown;
  };
  if (obj.object === "subscription") return obj.id ?? null;
  if (obj.object === "checkout.session") {
    return typeof obj.subscription === "string" ? obj.subscription : null;
  }
  return null;
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
