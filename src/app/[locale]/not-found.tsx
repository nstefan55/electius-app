import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { NotFoundCard } from "@/components/ui/not-found-card";
import { notFoundCopy } from "@/lib/not-found-copy";
import { isDashboardHost } from "@/proxy";

// [locale]-level fallback: catches notFound() thrown inside (auth) or
// (marketing) — neither has its own group-level not-found.tsx (spec's
// deliberate skip) — with [locale]/layout.tsx's <html>/<body> already
// rendered. No group chrome is available here, so we pick a tone from the
// host header instead (loading-and-404-page-spec §2).
//
// NOTE: genuinely unmatched top-level URLs do NOT reach this file — Next 16
// can't cascade a normal not-found.tsx through a dynamic-segment root layout
// ([locale]/layout.tsx), so that case is handled separately by
// src/app/global-not-found.tsx (see next.config.ts experimental.globalNotFound).
export default async function LocaleNotFound() {
  const host = (await headers()).get("host") ?? "";
  const dashboard = isDashboardHost(host);
  const [t, locale] = await Promise.all([
    getTranslations("notFound"),
    getLocale(),
  ]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <NotFoundCard
        badge={t("badge")}
        {...notFoundCopy(t, "generic")}
        homeLabel={t("cta")}
        homeHref={dashboard ? `/${locale}/home` : `/${locale}`}
        backLabel={t("back")}
      />
    </div>
  );
}
