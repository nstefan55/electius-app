import { getTranslations } from "next-intl/server";
import { Spinner } from "@/components/ui/spinner";

// Suspense fallback below the marketing header (loading-and-404-page-spec §1).
export default async function MarketingLoading() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner label={t("loading")} />
    </div>
  );
}
