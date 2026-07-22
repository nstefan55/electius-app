import { getLocale, getTranslations } from "next-intl/server";
import { NotFoundCard } from "@/components/ui/not-found-card";
import { notFoundCopy } from "@/lib/not-found-copy";

// Catches notFound() thrown inside (voter) — the resultsVisible gate on
// /results/[id], a bad /vote/[token] — with the mobile voter chrome preserved
// (404-page-redesign-spec). Homes to the apex marketing landing, same host as
// every voter route, so a locale-prefixed root-relative href is enough. Shows
// the voter note — every voter-surface 404 plausibly came from a magic link
// or QR code. reason stays "generic" until the Voter Flow spec wires real
// token verification (see 404-page-redesign-spec's "link-expired" section).
export default async function VoterNotFound() {
  const [t, locale] = await Promise.all([
    getTranslations("notFound"),
    getLocale(),
  ]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <NotFoundCard
        badge={t("badge")}
        {...notFoundCopy(t, "generic")}
        homeLabel={t("cta")}
        homeHref={`/${locale}`}
        backLabel={t("back")}
        voterNote={{ title: t("voterNote.title"), description: t("voterNote.description") }}
      />
    </div>
  );
}
