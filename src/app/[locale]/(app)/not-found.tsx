import { getLocale, getTranslations } from "next-intl/server";
import { NotFoundCard } from "@/components/ui/not-found-card";
import { notFoundCopy } from "@/lib/not-found-copy";

// Catches notFound() thrown inside (app) — e.g. elections/[id]/layout.tsx on a
// bad id / cross-org id — with the sidebar+topbar chrome preserved
// (404-page-redesign-spec). No voter note — admin surface, never reached via
// a voter magic link.
export default async function AppNotFound() {
  const [t, locale] = await Promise.all([
    getTranslations("notFound"),
    getLocale(),
  ]);
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <NotFoundCard
        badge={t("badge")}
        {...notFoundCopy(t, "generic")}
        homeLabel={t("cta")}
        homeHref={`/${locale}/home`}
        backLabel={t("back")}
      />
    </div>
  );
}
