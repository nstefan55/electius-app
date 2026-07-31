import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";

// /settings — controls only; identity moved to /profile. Shell until phases
// 3–7 land their cards. Stays a server component so they can fetch here.
export default async function SettingsPage() {
  await requireSession();
  const t = await getTranslations("dashboard.settings");

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-[15px] text-neutral-600">{t("subtitle")}</p>
      </div>

      <DashboardFooter />
    </div>
  );
}
