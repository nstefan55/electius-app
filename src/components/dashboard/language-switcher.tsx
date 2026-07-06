"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALES, type Locale } from "@/i18n/config";

// English is built-in but gated until its catalog is reviewed (MVP ships hr only).
const ENABLED: Record<Locale, boolean> = { hr: true, en: false };

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common.language");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative flex items-center">
      <Languages className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) =>
          startTransition(() =>
            // Same path, switched locale — next-intl handles the prefix.
            router.replace(pathname, { locale: e.target.value as Locale }),
          )
        }
        className="h-9.5 cursor-pointer rounded-md border border-border bg-card pr-3 pl-8 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none disabled:opacity-60"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} disabled={!ENABLED[code]}>
            {t(code)}
          </option>
        ))}
      </select>
    </label>
  );
}