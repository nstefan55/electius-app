"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ErrorCard } from "@/components/ui/error-card";

// Hvata pogrešku bačenu unutar (app) stranice — uz očuvanu sidebar+topbar odoru
// (layout je već prošao requireSession). reset() ponovno renderira segment.
// KLIJENTSKA komponenta (error.tsx uvijek jest) — koristi klijentski
// useTranslations, nikad next-intl/server (v0.9.38 pravilo za granice ruta).
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  const locale = useLocale();
  useEffect(() => {
    console.error("[app] render error", error.digest ?? "", error.message);
  }, [error]);
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <ErrorCard
        badge={t("badge")}
        title={t("title")}
        description={t("description")}
        retryLabel={t("tryAgain")}
        onRetry={reset}
        homeLabel={t("home")}
        homeHref={`/${locale}/home`}
      />
    </div>
  );
}
