"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { signUpUrl } from "@/lib/urls";

// Dvije kartice plana + preklopnik razdoblja. Dijele ih odredišna stranica
// (PricingPlans) i modal "planirani planovi" na /settings — jedan prikaz
// cijena, da se dvije površine ne raziđu.
//
// Sav tekst dolazi iz marketing.pricing: cijene se pišu na jednom mjestu.

type Feature = { pre: string; strong: string; post: string };

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

export function BillingToggle({
  yearly,
  onChange,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  const t = useTranslations("marketing.pricing");

  const segment = (active: boolean) =>
    `min-h-11 rounded-full px-5.5 font-heading text-sm font-semibold transition-colors ${
      active ? "bg-white text-brand-900 shadow-sm" : "text-neutral-600"
    }`;

  return (
    <div
      role="group"
      aria-label={t("billingGroup")}
      className="inline-flex gap-1 rounded-full border border-neutral-200 bg-neutral-100 p-1"
    >
      <button
        type="button"
        aria-pressed={!yearly}
        onClick={() => onChange(false)}
        className={segment(!yearly)}
      >
        {t("monthly")}
      </button>
      <button
        type="button"
        aria-pressed={yearly}
        onClick={() => onChange(true)}
        className={segment(yearly)}
      >
        {t("yearly")}
      </button>
    </div>
  );
}

export function PlanCards({
  yearly,
  showCta = true,
  proBadge = true,
  freeCta,
  proCta,
}: {
  yearly: boolean;
  // Modal na /settings ih skriva: administrator je već prijavljen, a naplata
  // još nije moguća — mrtav gumb za kupnju gori je od nikakvog.
  showCta?: boolean;
  // Utori radnje, kad poveznica na registraciju nije točan potez: /upgrade ih
  // šalje jer je administrator već prijavljen — Pro nosi Checkout, Free oznaku
  // trenutačnog plana. Namjerno su bez rasporeda (utor ne postavlja razmak),
  // ali OBA se popunjavaju zajedno: prazan Free utor podigao bi njegove
  // natuknice za visinu Pro gumba i kartice bi se razišle.
  freeCta?: React.ReactNode;
  proCta?: React.ReactNode;
  // Oznaka „Uskoro". Istinita na odredišnoj stranici, gdje naplata još nije
  // moguća — ali /upgrade se prikazuje TEK kad naplata radi, pa bi ondje stajala
  // iznad gumba koji otvara Checkout i proturječila mu.
  proBadge?: boolean;
}) {
  const t = useTranslations("marketing.pricing");
  const freeFeatures = t.raw("free.features") as Feature[];
  const proFeatures = t.raw("pro.features") as Feature[];

  return (
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
          <span className="text-[0.9375rem] text-neutral-600">{t("free.period")}</span>
        </div>
        <div className="mb-6 text-[0.8125rem] text-neutral-600">{t("free.note")}</div>
        {freeCta ??
          (showCta && (
            <a
              href={signUpUrl()}
              className="mb-7 inline-flex min-h-12 items-center justify-center rounded-md border-[1.5px] border-brand-700 bg-white font-heading text-[0.9375rem] font-semibold text-brand-700 hover:bg-brand-50"
            >
              {t("free.cta")}
            </a>
          ))}
        <Bullets items={freeFeatures} />
      </div>

      {/* Pro */}
      <div className="flex flex-col rounded-lg border border-brand-900 bg-brand-900 p-8 shadow-md">
        <div className="flex items-center gap-2.5">
          <span className="font-heading text-sm font-semibold tracking-[0.04em] text-brand-100 uppercase">
            {t("pro.name")}
          </span>
          {proBadge && (
            <span className="inline-flex h-5 items-center rounded-full bg-white/15 px-2 text-xs font-semibold text-brand-100">
              {t("pro.badge")}
            </span>
          )}
        </div>
        <p className="mt-2 mb-5 text-[0.90625rem] leading-normal text-brand-100">
          {t("pro.desc")}
        </p>
        <div aria-live="polite">
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="font-heading text-[2.75rem] leading-none font-bold text-white">
              {yearly ? t("pro.priceYearly") : t("pro.priceMonthly")}
            </span>
            <span className="text-[0.9375rem] text-brand-100">{t("pro.perMonth")}</span>
          </div>
          <div className="mb-6 text-[0.8125rem] text-brand-100">
            {yearly ? t("pro.noteYearly") : t("pro.noteMonthly")}
          </div>
        </div>
        {proCta ??
          (showCta && (
            <a
              href={signUpUrl()}
              className="mb-7 inline-flex min-h-12 items-center justify-center rounded-md bg-brand-700 font-heading text-[0.9375rem] font-semibold text-white hover:bg-brand-600"
            >
              {t("pro.cta")}
            </a>
          ))}
        {/* `pro.trial` se ovdje ne prikazuje — uvjet je prodaje, a odredišna
            stranica ne prodaje. /upgrade ga nosi unutar svog proCta utora. */}
        <Bullets items={proFeatures} dark />
      </div>
    </div>
  );
}
