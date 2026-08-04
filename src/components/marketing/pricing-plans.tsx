"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { signUpUrl } from "@/lib/urls";

type Feature = { pre: string; strong: string; post: string };
type Row = { label: string; free: string; pro: string };

// Jedan prikaz za obje kartice — u prototipu se isti redak ponavlja 16×.
function Bullets({ items, dark }: { items: Feature[]; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((f) => (
        <div key={f.pre + f.strong} className="flex items-start gap-2.75">
          <Check
            aria-hidden="true"
            strokeWidth={2.4}
            className={`mt-px size-4.75 flex-none ${dark ? "text-brand-500" : "text-brand-700"}`}
          />
          <span
            className={`text-[0.90625rem] leading-normal ${dark ? "text-brand-100" : "text-neutral-600"}`}
          >
            {f.pre}
            <strong className={`font-semibold ${dark ? "text-white" : "text-neutral-800"}`}>
              {f.strong}
            </strong>
            {f.post}
          </span>
        </div>
      ))}
    </div>
  );
}

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

  const freeFeatures = t.raw("free.features") as Feature[];
  const proFeatures = t.raw("pro.features") as Feature[];
  const rows = t.raw("table.rows") as Row[];

  const segment = (active: boolean) =>
    `min-h-11 rounded-full px-5.5 font-heading text-sm font-semibold transition-colors ${
      active ? "bg-white text-brand-900 shadow-sm" : "text-neutral-600"
    }`;

  return (
    <>
      <div className="mb-10 flex justify-center">
        <div
          role="group"
          aria-label={t("billingGroup")}
          className="inline-flex gap-1 rounded-full border border-neutral-200 bg-neutral-100 p-1"
        >
          <button
            type="button"
            aria-pressed={!yearly}
            onClick={() => setYearly(false)}
            className={segment(!yearly)}
          >
            {t("monthly")}
          </button>
          <button
            type="button"
            aria-pressed={yearly}
            onClick={() => setYearly(true)}
            className={segment(yearly)}
          >
            {t("yearly")}
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-220 grid-cols-1 items-stretch gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="font-heading text-sm font-semibold tracking-[0.04em] text-neutral-600 uppercase">
            {t("free.name")}
          </div>
          <p className="mt-2 mb-5 text-[0.90625rem] leading-normal text-neutral-600">
            {t("free.desc")}
          </p>
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="font-heading text-[2.75rem] leading-none font-bold text-brand-900">
              {t("free.price")}
            </span>
            <span className="text-[0.9375rem] text-neutral-600">
              {t("free.period")}
            </span>
          </div>
          <div className="mb-6 text-[0.8125rem] text-neutral-600">
            {t("free.note")}
          </div>
          <a
            href={signUpUrl()}
            className="mb-7 inline-flex min-h-12 items-center justify-center rounded-md border-[1.5px] border-brand-700 bg-white font-heading text-[0.9375rem] font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t("free.cta")}
          </a>
          <Bullets items={freeFeatures} />
        </div>

        {/* Pro */}
        <div className="flex flex-col rounded-lg border border-brand-900 bg-brand-900 p-8 shadow-md">
          <div className="font-heading text-sm font-semibold tracking-[0.04em] text-brand-100 uppercase">
            {t("pro.name")}
          </div>
          <p className="mt-2 mb-5 text-[0.90625rem] leading-normal text-brand-100">
            {t("pro.desc")}
          </p>
          <div aria-live="polite">
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="font-heading text-[2.75rem] leading-none font-bold text-white">
                {yearly ? t("pro.priceYearly") : t("pro.priceMonthly")}
              </span>
              <span className="text-[0.9375rem] text-brand-100">
                {t("pro.perMonth")}
              </span>
            </div>
            <div className="mb-6 text-[0.8125rem] text-brand-100">
              {yearly ? t("pro.noteYearly") : t("pro.noteMonthly")}
            </div>
          </div>
          <a
            href={signUpUrl()}
            className="mb-2.5 inline-flex min-h-12 items-center justify-center rounded-md bg-brand-700 font-heading text-[0.9375rem] font-semibold text-white hover:bg-brand-600"
          >
            {t("pro.cta")}
          </a>
          <div className="mb-6 text-center text-[0.8125rem] text-brand-100">
            {t("pro.trial")}
          </div>
          <Bullets items={proFeatures} dark />
        </div>
      </div>

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
