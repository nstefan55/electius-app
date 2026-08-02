import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { subscriptionBlocks } from "@/lib/services/account-deletion.service";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import { AccessibilityCard } from "@/components/settings/accessibility-card";
import { DashboardCustomizationsCard } from "@/components/settings/dashboard-customizations-card";
import { AccountManagementCard } from "@/components/settings/account-management-card";

// /settings — controls only; identity moved to /profile. Stays a server
// component so kartice mogu dohvaćati podatke ovdje.
// ponytail: redoslijed kartica se dovršava kad stigne Plan i naplata (faza 7);
// ona ide između Pristupačnosti i Prilagodbi.
export default async function SettingsPage() {
  const session = await requireSession();
  const t = await getTranslations("dashboard.settings");

  // isPro stiže iz sesije, ali blokada brisanja treba i stvarnu pretplatu —
  // jedan uzak upit umjesto širenja requireSession za jednu karticu.
  const billing = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { isPro: true, stripeSubscriptionId: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-neutral-600">{t("subtitle")}</p>
      </div>

      <AccessibilityCard prefs={session.accessibility} />

      <DashboardCustomizationsCard />

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
