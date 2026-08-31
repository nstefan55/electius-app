"use client";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";

// Suspense fallback unutar 390px biračke kartice — mobilno zaglavlje ostaje
// vidljivo (loading-and-404-page-spec §1).
//
// KLIJENTSKA komponenta: loading.tsx je granica rute i renderira se u stablu
// svake stranice ispod sebe, a getTranslations() ovdje nema odakle dobiti
// locale (loading.tsx ne prima params), pa je padao na čitanje zaglavlja i
// činio cijelu (voter) grupu dinamičnom. Isti razlog kao kod oba not-found.tsx.
export default function VoterLoading() {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={t("loading")} />
    </div>
  );
}
