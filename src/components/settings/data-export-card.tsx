import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { SettingsCard } from "@/components/settings/settings-card";

// "Izvoz podataka" na /settings (profile-settings-phase-6-spec §1) — pravo na
// prijenosivost podataka (GDPR čl. 20), blizanac brisanja iz faze 4.
//
// Obična poveznica, ne gumb s fetchom: Content-Disposition sam pokreće
// preuzimanje, pa nema ni klijentskog koda ni stanja. Zato je ovo poslužiteljska
// komponenta.
//
// ZIP gumb se NE iscrtava (§4). Kontrola iz GDPR-a koja javi "uskoro" čita se
// kao odbijena prijenosivost, a onemogućen gumb je isto to s manje riječi.
export async function DataExportCard() {
  const t = await getTranslations("dashboard.settings.export");
  const locale = await getLocale();

  return (
    <SettingsCard title={t("title")} subtitle={t("subtitle")}>
      <div>
        <a
          // Jezik bira samo ime datoteke — ključevi u dokumentu su engleski.
          href={`/api/organization/export?locale=${locale}`}
          className="inline-flex h-10 items-center gap-2 rounded-md border-[1.5px] border-brand-700 bg-white px-4.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          <Download className="size-4" aria-hidden />
          {t("json")}
        </a>
      </div>

      <p className="text-xs leading-relaxed text-neutral-600">{t("note")}</p>
    </SettingsCard>
  );
}
