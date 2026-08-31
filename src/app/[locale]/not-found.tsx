"use client";
import { useLocale, useTranslations } from "next-intl";
import { NotFoundCard } from "@/components/ui/not-found-card";
import { notFoundCopy } from "@/lib/not-found-copy";

// [locale]-level fallback: hvata notFound() bačen unutar (auth) ili (marketing)
// — nijedna od te dvije grupe nema vlastiti not-found.tsx — s već renderiranim
// <html>/<body> iz [locale]/layout.tsx.
//
// NAPOMENA: doista nepoklopljeni URL-ovi ne dolaze ovamo — Next 16 ne može
// kaskadirati obični not-found.tsx kroz korijenski layout na dinamičkom
// segmentu, pa taj slučaj rješava src/app/global-not-found.tsx.
//
// KLIJENTSKA komponenta, i to je nosivo. Granice rute (not-found, loading)
// renderiraju se u stablu SVAKE stranice ispod sebe. Dok je ovo bila
// poslužiteljska komponenta, čitala je headers() — izravno i preko
// getLocale()/getTranslations() bez setRequestLocale — pa je cijeli [locale]
// segment bio dinamičan i keširanje javnih rezultata nije se imalo gdje uhvatiti.
// Izmjereno: uz generateStaticParams na /results/[id] isti taj headers() postaje
// FATALAN (DYNAMIC_SERVER_USAGE → HTTP 500), ne samo spor.
//
// Detekcija hosta je nestala jer je bila suvišna: /{locale} radi na oba hosta —
// apex servira naslovnicu, a dashboard host ga 307-om šalje na /{locale}/home
// (proxy.ts, "Host root"). Jedan skok više, ista odredišta, nula čitanja zahtjeva.
export default function LocaleNotFound() {
  const t = useTranslations("notFound");
  const locale = useLocale();
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <NotFoundCard
        badge={t("badge")}
        {...notFoundCopy(t, "generic")}
        homeLabel={t("cta")}
        homeHref={`/${locale}`}
        backLabel={t("back")}
      />
    </div>
  );
}
