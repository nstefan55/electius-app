import { getTranslations } from "next-intl/server";
import { Spinner } from "@/components/ui/spinner";

// Suspense fallback for the (auth) page slot. The group layout is bare — pages
// own their own frame (split-screen login/signup, self-centered setup/onboarding)
// — so this just centers on white, matching that frame's visual weight
// (loading-and-404-page-spec §1).
export default async function AuthLoading() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-white">
      <Spinner label={t("loading")} />
    </div>
  );
}
