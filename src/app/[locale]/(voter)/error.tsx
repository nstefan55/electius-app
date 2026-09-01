"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ErrorCard } from "@/components/ui/error-card";

// Hvata pogrešku bačenu unutar (voter) — uz očuvanu mobilnu biračku odoru.
// Vodi na apex naslovnicu, isti host kao svaka biračka ruta. KLIJENTSKA i to je
// nosivo: (voter) sadrži ISR rutu /results/[id], pa granica u tom stablu mora
// biti klijentska ili ne uvoziti next-intl/server, inače headers() ondje postaje
// FATALAN (v0.9.38; pinovano u static-route-boundaries.test.ts).
export default function VoterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  const locale = useLocale();
  useEffect(() => {
    console.error("[voter] render error", error.digest ?? "", error.message);
  }, [error]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <ErrorCard
        badge={t("badge")}
        title={t("title")}
        description={t("description")}
        retryLabel={t("tryAgain")}
        onRetry={reset}
        homeLabel={t("home")}
        homeHref={`/${locale}`}
      />
    </div>
  );
}
