import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { SettingsCard } from "@/components/settings/settings-card";

// "Prilagodbe nadzorne ploče" na /settings — namjerno neaktivna kartica.
// Značajka je post-launch (Pro), pa nema stupca, akcije ni stanja.
const ROWS = ["density", "stats", "hero"] as const;

export async function DashboardCustomizationsCard() {
  const t = await getTranslations("dashboard.settings.customizations");

  return (
    <SettingsCard
      title={t("title")}
      subtitle={t("subtitle")}
      headerAside={
        <div className="flex shrink-0 gap-2">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-brand-100 px-3 text-xs font-semibold text-brand-700">
            <Lock className="size-3" strokeWidth={2.5} />
            {t("pro")}
          </span>
          <span className="inline-flex h-6 items-center rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-600">
            {t("soon")}
          </span>
        </div>
      }
      bodyClassName="px-6 pt-2 pb-5 opacity-55 pointer-events-none"
    >
      {ROWS.map((row, i) => (
        <div
          key={row}
          className={`flex items-center justify-between gap-4 py-3.5 ${
            i < ROWS.length - 1 ? "border-b border-neutral-100" : ""
          }`}
        >
          <div>
            <div className="text-sm font-medium text-neutral-800">
              {t(`${row}.label`)}
            </div>
            <div className="mt-0.5 text-[0.8125rem] text-neutral-600">
              {t(`${row}.description`)}
            </div>
          </div>
          {/* Nacrtani prekidač, ne kontrola — skriven od čitača ekrana.
              NE aria-disabled: tekst retka mora ostati čitljiv. */}
          <span
            aria-hidden
            className="relative inline-block h-6.5 w-11 shrink-0 rounded-full bg-neutral-200"
          >
            <span className="absolute top-0.75 left-0.75 size-5 rounded-full bg-white shadow-xs" />
          </span>
        </div>
      ))}
    </SettingsCard>
  );
}
