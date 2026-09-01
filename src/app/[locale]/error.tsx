"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ErrorCard } from "@/components/ui/error-card";

// [locale]-level fallback: hvata pogrešku bačenu unutar (auth) ili (marketing)
// — nijedna grupa nema vlastiti error.tsx — uz <html>/<body> iz [locale]/layout.
// Ista klijentska granica kao [locale]/not-found.tsx: renderira se u stablu
// SVAKE stranice ispod sebe, uključujući ISR /results/[id], pa mora biti
// klijentska i ne smije uvoziti next-intl/server (inače headers() → 500).
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  const locale = useLocale();
  useEffect(() => {
    console.error("[locale] render error", error.digest ?? "", error.message);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
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
