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

  // Dok naplata nije moguća kartica prikazuje beta stanje: mreža ograničenja
  // koja se ne provode i mrtav gumb za kupnju gori su od nikakve ponude.
  // subscription je null — datum obnove i razdoblje dohvaća tek faza 2.
  const billingState: BillingState = !BILLING_ENABLED
    ? { kind: "prelaunch" }
    : billing?.isPro
      ? { kind: "pro", subscription: null }
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

      <BillingCard state={billingState} />

      <DashboardCustomizationsCard />

      <DataExportCard />

      <AccountManagementCard
        organizationName={session.user.organization}
        subscriptionActive={
          billing ? subscriptionBlocks(billing) : false
        }
      />

      <DashboardFooter />
    </div>
  );
}
