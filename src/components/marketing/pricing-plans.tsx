"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { BillingToggle, PlanCards } from "@/components/marketing/plan-cards";

type Row = { label: string; free: string; pro: string };

// ✓ i — su grafika: čitač zaslona dobiva riječ, ne naziv znaka.
function Cell({ value, yes, no }: { value: string; yes: string; no: string }) {
  if (value === "✓" || value === "—") {
    return (
      <>
        <span aria-hidden="true">{value}</span>
        <span className="sr-only">{value === "✓" ? yes : no}</span>
      </>
    );
  }
  return <>{value}</>;
}

export function PricingPlans() {
  const t = useTranslations("marketing.pricing");
  const [yearly, setYearly] = useState(false);

  const rows = t.raw("table.rows") as Row[];

  return (
    <>
      {/* Cijene su planirane, nisu ponuda — nema pravnog subjekta ni aktivne naplate.
          Uklanja se kad BILLING_ENABLED postane true. */}
      <div className="mx-auto mb-8 flex max-w-220 items-start gap-3 rounded-md border-l-[3px] border-brand-500 bg-brand-50 p-4">
        <Info aria-hidden="true" className="mt-px size-5 flex-none text-brand-700" />
        <p className="text-[0.90625rem] leading-normal text-neutral-800">
          {t("betaNotice")}
        </p>
      </div>

      <div className="mb-10 flex justify-center">
        <BillingToggle yearly={yearly} onChange={setYearly} />
      </div>

      <PlanCards yearly={yearly} />

      {/* NOTE: „Provodite veće izbore? Platite jednom, od 9 €" je skriveno dok
          plaćanje po izborima ne postane treća opcija (post-MVP). Ključ
          `marketing.pricing.pointer` ostaje u oba kataloga — vraća se
          odkomentiranjem, ovaj put kao punopravna treća kartica, ne kao fusnota.

      <p className="mx-auto mt-6 max-w-220 text-center text-[0.9375rem]">
        <a href="#contact" className="font-semibold text-brand-700 hover:text-brand-600">
          {t("pointer")}
        </a>
      </p>
      */}

      <div className="scroll-shadow-x mx-auto mt-14 max-w-220 overflow-x-auto rounded-lg border border-neutral-200 shadow-sm">
        <table className="w-full border-collapse text-[0.90625rem]">
          <caption className="sr-only">{t("table.caption")}</caption>
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th
                scope="col"
                className="px-5 py-3.5 text-left font-heading text-[0.8125rem] font-semibold tracking-[0.04em] text-neutral-600 uppercase"
              >
                {t("table.feature")}
              </th>
              <th
                scope="col"
                className="w-[22%] px-5 py-3.5 text-center font-heading text-[0.8125rem] font-semibold tracking-[0.04em] text-neutral-600 uppercase"
              >
                {t("free.name")}
              </th>
              <th
                scope="col"
                className="w-[22%] px-5 py-3.5 text-center font-heading text-[0.8125rem] font-semibold tracking-[0.04em] text-brand-900 uppercase"
              >
                {t("pro.name")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-neutral-100">
                <th
                  scope="row"
                  className="px-5 py-3.25 text-left font-body font-medium text-neutral-800"
                >
                  {row.label}
                </th>
                <td className="px-5 py-3.25 text-center text-neutral-600">
                  <Cell
                    value={row.free}
                    yes={t("table.included")}
                    no={t("table.notIncluded")}
                  />
                </td>
                <td className="px-5 py-3.25 text-center font-medium text-neutral-800">
                  <Cell
                    value={row.pro}
                    yes={t("table.included")}
                    no={t("table.notIncluded")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mx-auto mt-5 max-w-220 text-center text-[0.8125rem] text-neutral-600">
        {t("footnote")}
      </p>
    </>
  );
}
