"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Facet tab nav for the /elections/[id] aggregate root (Overview · Results · Voters).
// The one necessarily-interactive piece of the layout chrome — active-state needs the
// current pathname (usePathname is locale-stripped, so it matches the flat hrefs).
export function ElectionTabs({ id }: { id: string }) {
  const t = useTranslations("dashboard.election.tabs");
  const pathname = usePathname();
  const base = `/elections/${id}`;

  const tabs = [
    { key: "overview", href: base },
    { key: "results", href: `${base}/results` },
    { key: "voters", href: `${base}/voters` },
  ] as const;

  // Pregled PDF izvještaja je cjelostranični podprikaz s vlastitom trakom —
  // kartice bi ondje pokazivale aktivnu stranicu koju korisnik ne gleda.
  if (pathname === `${base}/results/report`) return null;

  return (
    <nav
      className="flex gap-1 border-b border-border print:hidden"
      aria-label={t("label")}
    >
      {tabs.map(({ key, href }) => {
        const active = pathname === href;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-brand-700 text-brand-700"
                : "border-transparent text-neutral-600 hover:text-neutral-800",
            )}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
