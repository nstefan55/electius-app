"use client";
import { useLocale, useTranslations } from "next-intl";
import { NotFoundCard } from "@/components/ui/not-found-card";
import { notFoundCopy } from "@/lib/not-found-copy";

// Hvata notFound() bačen unutar (voter) — loš /vote/[token] — uz očuvanu
// mobilnu biračku odoru. Vodi na apex naslovnicu, isti host kao svaka biračka
// ruta. Prikazuje biračku napomenu: svaki 404 na ovim zaslonima vjerojatno je
// stigao s magične poveznice ili QR koda. reason ostaje "generic" dok Voter Flow
// spec ne poveže stvarnu provjeru tokena.
//
// KLIJENTSKA komponenta iz istog razloga kao [locale]/not-found.tsx: granica
// rute renderira se u stablu svake stranice ispod sebe, pa su
// getLocale()/getTranslations() bez setRequestLocale ovdje čitali headers() i
// činili cijelu (voter) grupu dinamičnom. Vidi komentar ondje.
export default function VoterNotFound() {
  const t = useTranslations("notFound");
  const locale = useLocale();
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
