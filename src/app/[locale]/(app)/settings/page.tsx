import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { subscriptionBlocks } from "@/lib/services/account-deletion.service";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import { AccessibilityCard } from "@/components/settings/accessibility-card";
import { BillingCard, type BillingState } from "@/components/settings/billing-card";
import { DashboardCustomizationsCard } from "@/components/settings/dashboard-customizations-card";
import { DataExportCard } from "@/components/settings/data-export-card";
import { AccountManagementCard } from "@/components/settings/account-management-card";

// ponytail: zastavica se čita ovdje dok ne stigne src/lib/entitlements.ts
// (stripe-integration-phase-1 §5). Zadano false — odsutnost i tipfeler znače
// "svi su Pro", što je pravno sigurna strana (pre-incorporation-billing-spec).
const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

// /settings — controls only; identity moved to /profile. Stays a server
// component so kartice mogu dohvaćati podatke ovdje.
export default async function SettingsPage() {
  const session = await requireSession();
  const t = await getTranslations("dashboard.settings");

  // isPro stiže iz sesije, ali blokada brisanja treba i stvarnu pretplatu —
  // jedan uzak upit umjesto širenja requireSession za jednu karticu.
  const billing = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { isPro: true, stripeSubscriptionId: true },
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
                // Otkazivanje se čita iz OBA polja. Stripe za pretplatu u
                // probnom razdoblju ne diže cancelAtPeriodEnd, nego postavlja
                // cancelAt na kraj razdoblja — provjera samo booleana ostavlja
                // otkazanu pretplatu da piše "prva naplata …", dakle poručuje
                // naplatu koje neće biti. Uhvaćeno tek pravim prolazom kroz Stripe.
                status:
                  subscription.cancelAtPeriodEnd || subscription.cancelAt
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
        subscriptionActive={
          billing ? subscriptionBlocks(billing) : false
        }
      />

      <DashboardFooter />
    </div>
  );
}
