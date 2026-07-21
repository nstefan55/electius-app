import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { ProfileCard } from "@/components/settings/profile-card";
import { OrganizationCard } from "@/components/settings/organization-card";

// /settings (profile-settings phase 1) — Profile + Organization cards. Later
// phases append their cards here (billing, customizations, danger zone).
// requireSession() is cache()d, so this read shares the layout's round trip.
export default async function SettingsPage() {
  const { user, organizationId } = await requireSession();

  const [account, organization, activeElections, totalElections] =
    await Promise.all([
      prisma.user.findUnique({
        where: { email: user.email },
        select: {
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          accounts: { select: { providerId: true } },
        },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, contactEmail: true, logoUrl: true },
      }),
      prisma.election.count({ where: { organizationId, status: "ACTIVE" } }),
      prisma.election.count({ where: { organizationId } }),
    ]);
  if (!account || !organization) notFound();

  // "First Last" → two fields: split on the FIRST space (setup-page convention).
  const [firstName, ...rest] = account.name.split(" ");
  const format = await getFormatter();
  const t = await getTranslations("dashboard.settings");

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-[15px] text-neutral-600">{t("subtitle")}</p>
      </div>

      <ProfileCard
        initialFirstName={firstName ?? ""}
        initialLastName={rest.join(" ")}
        email={account.email}
        emailVerified={account.emailVerified}
        image={account.image}
        memberSince={format.dateTime(account.createdAt, { dateStyle: "long" })}
        activeElections={activeElections}
        totalElections={totalElections}
        hasPassword={account.accounts.some(
          (a) => a.providerId === "credential",
        )}
        organizationName={organization.name}
      />

      <OrganizationCard
        initialName={organization.name}
        initialContactEmail={organization.contactEmail}
        logoUrl={organization.logoUrl}
      />
    </div>
  );
}
