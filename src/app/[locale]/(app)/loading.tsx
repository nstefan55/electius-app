import { getTranslations } from "next-intl/server";
import { Spinner } from "@/components/ui/spinner";

// Suspense fallback for the (app) content slot — DashboardShell's sidebar +
// topbar keep rendering around this (loading-and-404-page-spec §1).
export default async function AppLoading() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner label={t("loading")} />
    </div>
  );
}
