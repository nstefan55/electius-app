import { getTranslations } from "next-intl/server";
import { Spinner } from "@/components/ui/spinner";

// Suspense fallback inside the 390px voter content card — the mobile header
// stays visible (loading-and-404-page-spec §1).
export default async function VoterLoading() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={t("loading")} />
    </div>
  );
}
