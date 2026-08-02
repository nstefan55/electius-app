"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Check } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/config";
import { SettingsCard } from "@/components/settings/settings-card";

// "Language" card on /profile — replaces the old LanguageSwitcher select and
// owns the locale navigation it used to hold.
// English is built-in but gated until its catalog is reviewed (MVP ships hr only).
const ENABLED: Record<Locale, boolean> = { hr: true, en: false };

export function LanguageCard() {
  const active = useLocale();
  const t = useTranslations("dashboard.profile.language");
  const tCommon = useTranslations("common.language");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function choose(code: Locale) {
    if (code === active) return; // the selected card is inert
    if (!ENABLED[code]) {
      toast(t("enToast"));
      return;
    }
    // Same path, switched locale — next-intl handles the prefix.
    startTransition(() => router.replace(pathname, { locale: code }));
  }

  return (
    <SettingsCard title={t("title")} subtitle={t("subtitle")}>
      <div
        role="radiogroup"
        aria-label={tCommon("label")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {LOCALES.map((code) => {
          const selected = code === active;
          // The locale you are IN is available whatever the gate says —
          // otherwise /en draws English as "Soon" while rendering in English.
          const available = ENABLED[code] || selected;
          const helper =
            code === DEFAULT_LOCALE
              ? t("defaultOption")
              : available
                ? null
                : t("soonOption");
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              // NOT aria-disabled: a gated locale must stay operable, or the
              // toast explaining why it is gated never reaches a screen reader.
              // The "Soon" chip + helper are already in the accessible name.
              disabled={pending}
              onClick={() => choose(code)}
              className={`flex min-h-16 items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                selected
                  ? "cursor-default border-[1.5px] border-brand-700 bg-brand-50"
                  : "border-neutral-200 bg-white hover:bg-neutral-50"
              }`}
            >
              <span
                aria-hidden
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                  selected
                    ? "bg-brand-700 text-white"
                    : "border-[1.5px] border-[#D1D5DB]"
                }`}
              >
                {selected && <Check className="size-3.25" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[0.9375rem] font-semibold ${
                    available ? "text-brand-900" : "text-neutral-400"
                  }`}
                >
                  {tCommon(code)}
                </span>
                {helper && (
                  <span
                    className={`mt-0.5 block text-xs ${
                      available ? "text-neutral-600" : "text-neutral-400"
                    }`}
                  >
                    {helper}
                  </span>
                )}
              </span>
              {!available && (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-neutral-100 px-2 text-[0.6875rem] font-semibold text-neutral-600">
                  {t("soon")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}
