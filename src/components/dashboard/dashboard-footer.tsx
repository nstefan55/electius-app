import { useTranslations } from "next-intl";

export function DashboardFooter() {
  const t = useTranslations("dashboard.page");

  return (
    <div className="flex flex-wrap items-start justify-between gap-6 text-md text-neutral-600 italic">
      {t("footerText")}
    </div>
  );
}
