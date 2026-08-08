"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Archive, BarChart3, BellOff, Check, Users } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { PRO_PLAN_NAME } from "@/lib/billing";

// Ponuda Pro plana — jedna, dijele je /settings (besplatno stanje kartice) i
// /upgrade (odredište zaključane značajke).
//
// Izdvojeno iz billing-card.tsx, a ne napisano drugi put: /settings je već bio
// potpuna ponuda — granice, cijena, prekidač razdoblja, popis značajki i STVARNI
// Stripe Checkout provjeren kroz test mode. Druga kopija razišla bi se prvom
// izmjenom cijene, i to na stranici koja postoji da bi nešto prodala.
//
// Ne sele se `prelaunch` i `pro` stanja: njihovi CTA-ovi provjereni su točno
// ondje gdje jesu.

const NS = "dashboard.settings.billing";

type Cycle = "monthly" | "yearly";

// Iznosi su u kodu, ne u katalogu: formatira ih next-intl, pa tvrdo kodiran
// znak € nikad ne uđe u prijevod. Autoritet: project-paywall-spec.md.
export const PRICE = { monthly: 9, yearly: 86, yearlyPerMonth: 7.2 } as const;

// Korisniku ide prevedena poruka, nikad Stripeova. Njegovi tekstovi su engleski
// i interni ("the subscription update feature in the portal configuration is
// disabled") — administratoru ne govore ništa, a hrvatsko sučelje ne smije
// procuriti engleski. Original ide u konzolu, gdje i pripada.
export function fail(
  error: { message?: string } | null | undefined,
  localized: string,
) {
  if (error?.message) console.error("[billing]", error.message);
  toast.error(localized);
}

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
  const locale = useLocale();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [pending, setPending] = useState(false);
  const monthly = cycle === "monthly";

  // Uspjeh UVIJEK vodi na /settings: ondje živi provjerena traka "obrada u
  // tijeku", a svježeg pretplatnika vratiti na stranicu koja mu nudi kupnju je
  // krivi zaslon — i čim webhook stigne, /upgrade bi ga ionako odbio.
  const successUrl = `/${locale}/settings?checkout=success`;
  const cancelUrl = `/${locale}${cancelPath}`;

  // Prva kupnja: plugin otvara Checkout i sam preusmjerava. Šalje se razdoblje
  // iz stanja iznad, nikad cijena. locale ide dalje da Stripeove stranice budu
  // na hrvatskom, a ne na jeziku preglednika.
  async function upgrade() {
    setPending(true);
    const { error } = await authClient.subscription.upgrade({
      plan: PRO_PLAN_NAME,
      annual: cycle === "yearly",
      referenceId: organizationId,
      successUrl,
      cancelUrl,
      locale,
    });
    // Uspjeh znači preusmjeravanje, pa se pending namjerno ne gasi — gumb ostaje
    // zaključan dok stranica ne ode.
    if (error) {
      fail(error, t("errors.checkout"));
      setPending(false);
    }
  }

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
          onClick={upgrade}
          disabled={pending}
          className="mt-3 h-11 cursor-pointer rounded-md bg-white px-5.5 text-[0.9375rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t("redirecting") : t("upsell.cta")}
        </button>
      </div>
    </>
  );
}
