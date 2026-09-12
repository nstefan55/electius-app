import { useTranslations } from "next-intl";
import { privacyUrl, termsUrl } from "@/lib/urls";

// Pojas povjerenja ispod /elections, /profile i /settings. Od 2026-09-12 nosi i
// poveznice na oba pravna dokumenta: do tada ih aplikacija nije nudila NIGDJE
// nakon prijave — stajale su samo na marketinškim i prijavnim zaslonima, koje
// administrator s otvorenim računom više ne vidi.
//
// Apsolutne su i vode na apeks (vidi privacyUrl/termsUrl): ovo je dashboard
// host, gdje bi relativni /privacy ili /terms završio na prijavi.
export function DashboardFooter() {
  const t = useTranslations("dashboard.page");
  const link = "underline underline-offset-2 hover:text-brand-700";

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 text-md text-neutral-600 italic">
      <span>{t("footerText")}</span>
      <span className="flex flex-wrap gap-x-4 gap-y-2 not-italic">
        <a href={privacyUrl()} className={link}>
          {t("legalPrivacy")}
        </a>
        <a href={termsUrl()} className={link}>
          {t("legalTerms")}
        </a>
      </span>
    </div>
  );
}
