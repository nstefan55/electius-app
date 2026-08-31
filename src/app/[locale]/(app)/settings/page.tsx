import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import { isCanceling } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import {
  deletionGate,
  hasPendingDeletionRequest,
  type DeletionState,
} from "@/lib/services/account-deletion.service";
import { BILLING_ENABLED } from "@/lib/services/entitlement.service";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import { AccessibilityCard } from "@/components/settings/accessibility-card";
import { BillingCard, type BillingState } from "@/components/settings/billing-card";
import { DashboardCustomizationsCard } from "@/components/settings/dashboard-customizations-card";
import { DataExportCard } from "@/components/settings/data-export-card";
import { AccountManagementCard } from "@/components/settings/account-management-card";

// /settings — controls only; identity moved to /profile. Stays a server
// component so kartice mogu dohvaćati podatke ovdje.
export default async function SettingsPage() {
  const session = await requireSession();
  const t = await getTranslations("dashboard.settings");

  // isPro stiže iz sesije, ali blokada brisanja treba i stvarnu pretplatu —
  // jedan uzak upit umjesto širenja requireSession za jednu karticu.
  const billing = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isPro: true, stripeSubscriptionId: true },
  });

  // Pretplata je stupac koji održava webhook, ne poziv Stripeu po učitavanju
  // stranice. findFirst, ne findUnique: referenceId namjerno nije unique (faza 1
  // §4), jer tko otkaže pa se vrati ima dva retka — najnoviji rok je mjerodavan.
  //
  // nulls: "last" nije kozmetika. Započet pa napušten Checkout ostavlja redak
  // "incomplete" s periodEnd = NULL, a Postgres u DESC poretku stavlja NULL
  // PRVI — bez ovoga bi taj redak pobijedio i Pro korisniku bi nestao datum
  // obnove jer je odustao od druge kupnje. Uhvaćeno pravim drugim Checkoutom.
  const subscription = BILLING_ENABLED
    ? await prisma.subscription.findFirst({
        where: { referenceId: session.organizationId },
        orderBy: { periodEnd: { sort: "desc", nulls: "last" } },
      })
    : null;

  // Dok naplata nije moguća kartica prikazuje beta stanje: mreža ograničenja
  // koja se ne provode i mrtav gumb za kupnju gori su od nikakve ponude.
  const billingState: BillingState = !BILLING_ENABLED
    ? { kind: "prelaunch" }
    : billing?.isPro
      ? {
          kind: "pro",
          // Ostaje nullable: između povratka s Checkouta i dolaska webhooka
          // retka još nema. Tada se prikazuje postojeći tekst bez datuma —
          // stupac je predmemorija, a krivi datum obnove je gori od nikakvog.
          subscription: subscription?.periodEnd
            ? {
                // Ista izvedenica koju čitaju i vrata za brisanje: jantarni čip
                // i gumb "Obriši račun" ne smiju tvrditi različito o tome
                // završava li pretplata (invarijanta #5).
                status: isCanceling(subscription)
                  ? "canceling"
                  : subscription.status === "trialing"
                    ? "trialing"
                    : "active",
                // Kad je otkazano, mjerodavan je stvarni kraj, ne sljedeća obnova.
                renewsAt: subscription.cancelAt ?? subscription.periodEnd,
                cycle:
                  subscription.billingInterval === "year" ? "yearly" : "monthly",
                stripeSubscriptionId: subscription.stripeSubscriptionId,
              }
            : null,
        }
      : { kind: "free" };

  // "pending" nadjačava "blocked" namjerno: /delete-user (sam zahtjev) ne
  // prolazi kroz vrata — to radi tek callback — pa zahtjev poslan dok je
  // pretplata bila na otkazivanju preživi ponovno pokretanje u portalu.
  // Kartica tada pokazuje što visi i nudi povlačenje; klik na poveznicu bi
  // ionako izgorio na subscriptionActive.
  // Paralelno, jer u uobičajenom slučaju (ništa ne visi) trebaju oba odgovora;
  // deletionGate za korisnika bez pretplate ne radi nijedan upit.
  const [pendingDeletion, gate] = billing
    ? await Promise.all([
        hasPendingDeletionRequest(billing.id),
        deletionGate(billing),
      ])
    : [false, { kind: "open" } as const];

  const deletion: DeletionState = pendingDeletion ? { kind: "pending" } : gate;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-neutral-600">{t("subtitle")}</p>
      </div>

      <AccessibilityCard prefs={session.accessibility} />

      {/* organizationId je referenceId pretplate (faza 1 D1); poslužitelj ga
          provjerava kroz authorizeReference, pa krivotvorina s klijenta pada. */}
      <BillingCard state={billingState} organizationId={session.organizationId} />

      <DashboardCustomizationsCard />

      <DataExportCard />

      <AccountManagementCard
        organizationName={session.user.organization}
        organizationId={session.organizationId}
        deletion={deletion}
      />

      <DashboardFooter />
    </div>
  );
}
