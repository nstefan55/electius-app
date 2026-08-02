"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { useRouter } from "@/i18n/navigation";
import { setAccessibilityPref } from "@/actions/settings";
import {
  ACCESSIBILITY_KEYS,
  type AccessibilityKey,
  type AccessibilityPrefs,
} from "@/lib/accessibility";
import { SettingsCard } from "@/components/settings/settings-card";

// "Pristupačnost" na /settings — četiri preferencije koje stvarno mijenjaju
// prikaz nadzorne ploče. Sprema se odmah na preklop: prekidač kojem treba
// gumb "Spremi" su dvije kontrole za jedan posao.
export function AccessibilityCard({ prefs }: { prefs: AccessibilityPrefs }) {
  const t = useTranslations("dashboard.settings.accessibility");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [local, setLocal] = useState(prefs);
  const [busy, setBusy] = useState<AccessibilityKey | null>(null);

  async function toggle(key: AccessibilityKey) {
    const next = !local[key];
    setLocal((p) => ({ ...p, [key]: next })); // optimistično
    setBusy(key);

    // Pad mreže odbacuje poziv akcije, ne vraća { success: false } — bez
    // catcha prekidač bi ostao prebačen na promjeni koja nikad nije spremljena.
    const result = await setAccessibilityPref({ key, value: next }).catch(
      () => ({ success: false }) as const,
    );
    setBusy(null);

    if (!result.success) {
      setLocal((p) => ({ ...p, [key]: !next })); // natrag
      toast.error(t("error"));
      return;
    }
    // Ljuska ponovno ispisuje atribute sa servera — CSS je ono što zapravo
    // primjenjuje promjenu, pa bez osvježavanja prekidač laže.
    startTransition(() => router.refresh());
  }

  return (
    <SettingsCard
      title={t("title")}
      subtitle={t("subtitle")}
      bodyClassName="px-6 pt-2 pb-5"
    >
      {ACCESSIBILITY_KEYS.map((key, i) => (
        <div
          key={key}
          className={`flex items-center justify-between gap-4 py-3.5 ${
            i < ACCESSIBILITY_KEYS.length - 1 ? "border-b border-neutral-100" : ""
          }`}
        >
          <div>
            <label
              htmlFor={`a11y-${key}`}
              className="block text-sm font-medium text-neutral-800"
            >
              {t(`${key}.label`)}
            </label>
            <p
              id={`a11y-${key}-hint`}
              className="mt-0.5 text-[0.8125rem] text-neutral-600"
            >
              {t(`${key}.description`)}
            </p>
          </div>
          <button
            id={`a11y-${key}`}
            type="button"
            role="switch"
            aria-checked={local[key]}
            aria-describedby={`a11y-${key}-hint`}
            disabled={busy !== null}
            onClick={() => toggle(key)}
            className={`relative inline-block h-6.5 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              local[key] ? "bg-brand-700" : "bg-neutral-200"
            }`}
          >
            {/* Kanonske (rem) klase, ne px: tračnica raste s "Veći tekst",
                pa bi fiksni pomak u px razmaknuo kuglicu od tračnice. */}
            <span
              className={`absolute top-0.75 size-5 rounded-full bg-white shadow-xs transition-[left] ${
                local[key] ? "left-5.25" : "left-0.75"
              }`}
            />
          </button>
        </div>
      ))}
    </SettingsCard>
  );
}
