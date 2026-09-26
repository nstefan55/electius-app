"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Accessibility } from "lucide-react";
import {
  VOTER_ACCESSIBILITY_KEYS,
  voterAccessibilityAttributes,
  type VoterAccessibilityPrefs,
} from "@/lib/accessibility";

// Pristupačnost na glasačkom listiću — dvije postavke, samo u memoriji.
// Nema kolačića ni localStorage: /privacy §F obećava da tok glasovanja ne
// sprema ništa, i to obećanje ostaje istinito. Cijena: ponovno učitavanje
// vraća zadano (ili ono što traži uređaj, vidi prefers-contrast u globals.css).
//
// Atributi sjede na gumbu jer on uvijek postoji. CSS ih hvata preko
// `html:has([data-…])` (admin faza 5), pa se mijenja cijela stranica bez
// ijednog novog pravila. Klijentska komponenta, pa /results/[id] ostaje ISR.
export function AccessibilityMenu() {
  const t = useTranslations("voter.a11y");
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<VoterAccessibilityPrefs>({
    largerText: false,
    highContrast: false,
  });

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        // ml-auto: na 320px uz veći tekst gumb prelazi u drugi red — neka ostane desno.
        className="ml-auto inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
        {...voterAccessibilityAttributes(prefs)}
      >
        <Accessibility aria-hidden="true" className="size-5" />
        {t("label")}
      </button>
      {/* `hidden`, ne uvjetni render — aria-controls mora pokazivati na element koji postoji. */}
      <div
        id={panelId}
        hidden={!open}
        className="basis-full border-t border-neutral-200 py-2"
      >
        {VOTER_ACCESSIBILITY_KEYS.map((key) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-neutral-950"
          >
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => {
                const on = e.target.checked;
                setPrefs((p) => ({ ...p, [key]: on }));
              }}
              className="size-5 cursor-pointer accent-brand-700"
            />
            {t(key)}
          </label>
        ))}
        <p className="pb-1 text-xs text-neutral-600">{t("note")}</p>
      </div>
    </>
  );
}
