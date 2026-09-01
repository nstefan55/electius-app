"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";

// Suspense fallback below the marketing header (loading-and-404-page-spec §1).
//
// KLIJENTSKA komponenta, i to je nosivo (Gate 13 / caching-strategy-spec §7).
// Granica rute renderira se u stablu SVAKE stranice ispod sebe; dok je ovo bila
// poslužiteljska komponenta, getTranslations() bez setRequestLocale čitao je
// headers() i držao cijelu (marketing) grupu dinamičnom — pa se jedina
// indeksabilna stranica u proizvodu nije mogla prerenderirati statički. Isti
// razlog i ista popravka kao [locale]/not-found.tsx i (voter) granice.
export default function MarketingLoading() {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner label={t("loading")} />
    </div>
  );
}
