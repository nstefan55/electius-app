"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Archive, BarChart3, BellOff, Check, Users } from "lucide-react";
import { useUpgradeCheckout } from "@/components/billing/use-upgrade-checkout";

// Ponuda Pro plana na /settings — besplatno stanje kartice naplate: granice,
// cijena, prekidač razdoblja, popis značajki i Checkout provjeren kroz test mode.
//
// /upgrade je OVO PRESTAO koristiti: ondje stoje kartice plana s odredišne
// stranice (UpgradePlans), jer stranica koja postoji da bi prodala treba isti
// cjenik koji je posjetitelj već vidio. Zajednički je ostao samo poziv na
// Checkout — useUpgradeCheckout — pa novčana staza i dalje postoji jednom.
//
// Ne sele se `prelaunch` i `pro` stanja: njihovi CTA-ovi provjereni su točno
// ondje gdje jesu.

const NS = "dashboard.settings.billing";

type Cycle = "monthly" | "yearly";

// Iznosi su u kodu, ne u katalogu: formatira ih next-intl, pa tvrdo kodiran
// znak € nikad ne uđe u prijevod. Autoritet: project-paywall-spec.md.
export const PRICE = { monthly: 9, yearly: 86, yearlyPerMonth: 7.2 } as const;

export function ProUpsell({
  organizationId,
  // Puna staza s upitnim nizom, jer odustajanje od Checkouta mora vratiti na
  // ISTU stranicu — uključujući ?feature=…, koji je jedini razlog zbog kojeg je
  // /upgrade prava ruta a ne preusmjeravanje.
  cancelPath,
}: {
  organizationId: string;
  cancelPath: string;
}) {
  const t = useTranslations(NS);
  const format = useFormatter();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const monthly = cycle === "monthly";
  const { upgrade, pending } = useUpgradeCheckout({ organizationId, cancelPath });

  const price = (value: number, digits: number) =>
    format.number(value, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const limits = [
    { icon: Users, text: t("limits.voters") },
    { icon: BarChart3, text: t("limits.results") },
    { icon: BellOff, text: t("limits.reminders") },
    { icon: Archive, text: t("limits.archive") },
  ];

  // nowrap: inače se "Godišnje −20 %" na 390 px lomi usred oznake.
  const segment = (active: boolean) =>
    `h-8 cursor-pointer rounded-full px-4 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors ${
      active ? "bg-white text-brand-900" : "text-white/75 hover:text-white"
    }`;

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-x-6">
        {limits.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-2.5 text-sm text-neutral-800">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-neutral-600" />
            {text}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-brand-900 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h3 className="font-heading text-xl font-semibold">{t("upsell.name")}</h3>
            <div aria-live="polite">
              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="font-heading text-4xl leading-none font-bold">
                  {monthly ? price(PRICE.monthly, 0) : price(PRICE.yearly, 0)}
                </span>
                <span className="text-sm text-white/65">
                  {monthly ? t("upsell.perMonth") : t("upsell.perYear")}
                </span>
              </div>
              <p className="mt-2 text-[0.8125rem] text-white/65">
                {monthly
                  ? t("upsell.noteMonthly", { price: price(PRICE.yearly, 0) })
                  : t("upsell.noteYearly", {
                      price: price(PRICE.yearlyPerMonth, 2),
                    })}
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label={t("upsell.cycleLabel")}
            className="inline-flex gap-1 rounded-full bg-white/12 p-0.75"
          >
            <button
              type="button"
              aria-pressed={monthly}
              onClick={() => setCycle("monthly")}
              className={segment(monthly)}
            >
              {t("upsell.monthly")}
            </button>
            <button
              type="button"
              aria-pressed={!monthly}
              onClick={() => setCycle("yearly")}
              className={segment(!monthly)}
            >
              {t("upsell.yearly")}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-2.25 sm:grid-cols-2 sm:gap-x-6">
          {(t.raw("upsell.features") as string[]).map((feature) => (
            <div
              key={feature}
              className="flex items-start gap-2.25 text-[0.8125rem] text-white/90"
            >
              <Check
                aria-hidden="true"
                strokeWidth={3}
                className="mt-0.5 size-3.5 shrink-0 text-brand-500"
              />
              {feature}
            </div>
          ))}
        </div>

        <p className="mt-5 text-[0.8125rem] text-white/65">{t("upsell.trial")}</p>
        <button
          type="button"
          onClick={() => upgrade(cycle === "yearly")}
          disabled={pending}
          className="mt-3 h-11 cursor-pointer rounded-md bg-white px-5.5 text-[0.9375rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t("redirecting") : t("upsell.cta")}
        </button>
      </div>
    </>
  );
}
